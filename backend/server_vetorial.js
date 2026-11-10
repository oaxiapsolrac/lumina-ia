// backend/server_vetorial.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import Groq from 'groq-sdk';
import { vectorEngine } from './vector_engine.js';
import { coletarAnexos, montarPartesMidia } from './anexos.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();

// --- Proteções de acesso (o servidor chama APIs pagas com as chaves do .env) ---

// Atrás de proxy (Render etc.), usa o IP real do cliente no limite de requisições
if (process.env.TRUST_PROXY) {
    const v = process.env.TRUST_PROXY;
    app.set('trust proxy', /^\d+$/.test(v) ? Number(v) : v);
} else if (process.env.RENDER) {
    app.set('trust proxy', 1);
}

// Tamanho máximo do corpo: comporta imagens/vídeos curtos em base64 sem aceitar uploads arbitrários
const BODY_LIMIT = process.env.BODY_LIMIT || '25mb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

// CORS: lista de origens em CORS_ORIGINS (separadas por vírgula). Sem a variável, aceita qualquer origem (modo laboratório).
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
if (CORS_ORIGINS.length > 0) {
    app.use(cors({ origin: CORS_ORIGINS }));
} else {
    console.warn("⚠️ AVISO: CORS_ORIGINS não definido; qualquer site pode chamar este servidor. Defina-o antes de publicar.");
    app.use(cors());
}

// Limite de requisições por IP em janela fixa (em memória; suficiente para uma instância única)
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX ?? '30', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000', 10);
const contadoresPorIp = new Map();
setInterval(() => {
    const agora = Date.now();
    for (const [ip, c] of contadoresPorIp) if (c.reinicioEm <= agora) contadoresPorIp.delete(ip);
}, RATE_LIMIT_WINDOW_MS).unref();

function limitarRequisicoes(req, res, next) {
    if (!RATE_LIMIT_MAX || RATE_LIMIT_MAX <= 0) return next();
    const agora = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || 'desconhecido';
    let c = contadoresPorIp.get(ip);
    if (!c || c.reinicioEm <= agora) {
        c = { total: 0, reinicioEm: agora + RATE_LIMIT_WINDOW_MS };
        contadoresPorIp.set(ip, c);
    }
    c.total++;
    if (c.total > RATE_LIMIT_MAX) {
        const segundos = Math.ceil((c.reinicioEm - agora) / 1000);
        res.setHeader('Retry-After', String(segundos));
        return res.status(429).json({ erro: `Muitas requisições. Tente novamente em ${segundos}s.` });
    }
    next();
}
app.use(['/search', '/chat', '/tts'], limitarRequisicoes); // '/chat' também cobre '/chat/stream'

// Validação de entrada compartilhada pelas rotas
const TOPK_MAX = 20;
function lerTopK(valor, padrao) {
    const n = parseInt(valor, 10);
    if (!Number.isFinite(n) || n < 1) return padrao;
    return Math.min(n, TOPK_MAX);
}
function lerPais(valor) {
    return typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, 60) : null;
}

const PORT = process.env.PORT || process.env.PORT_TESTE || 3001;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

if (!GROQ_API_KEY) {
    console.warn("⚠️ AVISO: GROQ_API_KEY não encontrada no ambiente/.env. Algumas funções de chat podem falhar.");
}

const groq = new Groq({ apiKey: GROQ_API_KEY || "missing-key" });

// Função de cálculo de uso da janela de contexto (0 a 100%)
// Janela de contexto real (em tokens) de cada modelo suportado
function janelaContexto(modelo) {
    const m = String(modelo || '').toLowerCase();
    if (['qwen', 'qwen2.5:1.5b', 'local', 'ic-qwen', 'qwen-2.5-1.5b'].includes(m)) return parseInt(process.env.QWEN_NUM_CTX || '4096', 10);
    if (m === 'phi-3-mini') return 4096;
    if (m === 'gemma-2-2b') return 8192;
    if (m === 'gemini') return 1048576;           // Gemini 2.5 Flash: 1M tokens
    if (m.includes('mistral')) return 1048576;    // Mistral Large 4: 1M tokens
    if (m.startsWith('minimax') || m.startsWith('glm') || m.startsWith('kimi') || m === 'nvidia') return 131072; // MiniMax M3.1 Flash (NIM)
    if (m.startsWith('nemotron')) return 131072;  // Nemotron: 128K
    if (m.startsWith('gpt-oss')) return 131072;   // GPT-OSS 20B/120B: 128K
    return 131072;                                // Groq (gpt-oss-120b): 128K
}

// Estimativa de tokens (fallback quando a API não retorna usage; remove mídia base64 para não inflar contagem)
function estimarTokens(conteudo) {
    const raw = typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo || '');
    const clean = raw.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '[MEDIA]');
    return Math.ceil(clean.length / 3.8);
}

function calcularUsoContexto(tokensUsados, maxContexto = 4096) {
    if (!tokensUsados || tokensUsados <= 0) {
        return { porcentagem: 0, usados: 0, maximo: maxContexto, status: 'seguro' };
    }
    // Permite passar de 100% para evidenciar o estouro da janela de contexto
    const pct = Number(((tokensUsados / maxContexto) * 100).toFixed(1));
    let status = 'seguro';      // Verde: até 60%
    if (pct > 80) status = 'critico';     // Vermelho: acima de 80% (inclusive > 100%)
    else if (pct > 60) status = 'alerta'; // Amarelo: entre 60% e 80%
    return {
        porcentagem: pct,
        usados: tokensUsados,
        maximo: maxContexto,
        status: status
    };
}

// Formata os documentos recuperados do banco vetorial para injeção no prompt
function formatarContextoRecuperado(docs, incluirScore = false) {
    if (!docs || docs.length === 0) {
        return "Nenhum documento específico encontrado com alta similaridade para esta pergunta.";
    }
    return docs.map((d, i) => {
        const cabecalho = incluirScore ? `[DOCUMENTO ${i + 1}] (Score: ${(d.score * 100).toFixed(1)}%)` : `[DOCUMENTO ${i + 1}]`;
        return `${cabecalho}
- Nome: ${d.nome}
- País/Região: ${d.pais}
- Categoria: ${d.categoria}
- Detalhes: ${d.detalhes}`;
    }).join('\n\n');
}

// Prompt único com guardrail estrito de economia de tokens e concisão para todas as rotas
function construirSystemPrompt(contextoRecuperado) {
    return `Você é a **LUMINA**, Inteligência Artificial especialista e porta-voz oficial do **Projeto ELLAS (Equality in Leadership for Latin American STEM)**, liderado pela UFMT em cooperação com Bolívia (UMSA) e Peru (ULima).

        **MISSÃO:**
        Fornecer respostas precisas, concisas e ancoradas na realidade da América Latina sobre igualdade de gênero em STEM, baseando-se exclusivamente nos documentos recuperados da base vetorial.

        **REGRAS DE OURO (SEGUIR ESTRITAMENTE):**

        1. **CONCISÃO OBRIGATÓRIA:**
           - Responda de forma direta e objetiva. Evite introduções longas, repetições e rodeios.
           - Use no máximo o necessário para responder com clareza. Prefira listas curtas e parágrafos enxutos.

        2. **FIDELIDADE ABSOLUTA À BASE VETORIAL (Prioridade Máxima):**
           - Toda estatística, nome de iniciativa, dado ou resultado DEVE vir exclusivamente dos **DOCUMENTOS RECUPERADOS** abaixo.
           - É proibido inventar, inferir ou estimar dados que não estejam textualmente presentes nos documentos recuperados.
           - Se um dado não estiver nos documentos, diga explicitamente que não está disponível.

        3. **ANCORAGEM REGIONAL OBRIGATÓRIA:**
           - Sempre contextualize as respostas na realidade da América Latina (Brasil, Bolívia, Peru e região).
           - Evite generalizações eurocentristas ou referências a dados de regiões não cobertas pelo projeto.

        4. **ABSTENÇÃO ATIVA E EXPLÍCITA (Hard Stop — sem exceções):**
           - Se a pergunta não houver uma resposta coerente ao dados da recuperação, diga que não há dados para aquela pergunta.
           - Se a pergunta for uma armadilha (premissa falsa, escopo ilícito, tema fora de STEM/Gênero): responda APENAS com *"Como especialista do Projeto ELLAS, meu escopo é restrito à igualdade de gênero em STEM na América Latina. Não possuo informações ou orientações sobre este tema."* e encerre imediatamente. Não elabore, não contextualize, não ofereça alternativas.

        5. **VIABILIDADE PRÁTICA:**
           - Quando pertinente, inclua recomendações ou ações concretas e implementáveis baseadas nos documentos.
        6. **Você pode responder as perguntas com menos palavras, seja sucinta ao responder para que não fique nao longo os textos

        **DOCUMENTOS RECUPERADOS DA BASE VETORIAL:**

        """
        ${contextoRecuperado}
        """
        `;
}

// Inicializa o motor vetorial na inicialização do servidor
console.log("🚀 Inicializando Servidor Vetorial de Teste da LUMINA...");
await vectorEngine.init();

// --- ROTAS ---

// 1. Rota de Boas-Vindas e Health Check
app.get('/', (req, res) => {
    res.json({
        status: "online",
        servico: "Servidor Vetorial Lumina (Laboratório Teste-Lumina)",
        versao: "2.0.0-RAG-Vetorial",
        endpoints: {
            stats: "GET /stats",
            buscaVetorial: "POST /search",
            chatRAG: "POST /chat",
            chatStream: "POST /chat/stream",
            reindex: "POST /reindex"
        }
    });
});

// 2. Estatísticas do Banco Vetorial
app.get('/stats', (req, res) => {
    try {
        const stats = vectorEngine.getStats();
        res.json(stats);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// 3. Busca Vetorial Pura (Semantic Search sem LLM)
app.post('/search', async (req, res) => {
    try {
        const { query, topK = 5, pais = null, categoria = null, minScore = 0.2 } = req.body;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ erro: "Campo 'query' é obrigatório." });
        }

        const resultados = await vectorEngine.search(query, { topK, pais, categoria, minScore });
        res.json(resultados);
    } catch (error) {
        console.error("Erro na busca vetorial:", error);
        res.status(500).json({ erro: "Erro ao processar busca vetorial.", detalhes: error.message });
    }
});

// 4. RAG Completo com Memória Multi-Turn (Busca Vetorial + Inferência Groq)
app.post('/chat', async (req, res) => {
    const inicioTotal = Date.now();
    try {
        const { mensagem = "", topK = 4, pais = null, historico = [], modelo = "groq", imagens = [], arquivos = [] } = req.body;
        const parsedTopK = parseInt(topK, 10) || 4;

        if (!mensagem && (!imagens || imagens.length === 0) && (!arquivos || arquivos.length === 0)) {
            return res.status(400).json({ resposta: "Mensagem ou anexo inválido." });
        }

        // FASE 1: Recontextualização de Query para Busca Vetorial (Conversational Retrieval)
        let queryBusca = mensagem || "Iniciativas e dados de mulheres em STEM na América Latina";

        // Se houver histórico anterior e a mensagem for curta/de continuidade
        if (historico && Array.isArray(historico) && historico.length > 0 && mensagem) {
            try {
                const ultimasMensagens = historico.slice(-4).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n');
                const recontextCompletion = await groq.chat.completions.create({
                    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
                    messages: [
                        {
                            role: "system",
                            content: `Você é um reescritor de consultas de busca para um banco vetorial sobre mulheres em STEM.
Dada a conversa anterior e a nova mensagem do usuário, gere UMA ÚNICA frase de busca autônoma e direta que capture o assunto real que o usuário quer pesquisar.
NÃO responda à pergunta. Apenas retorne a frase de busca.
Exemplo:
Conversa: "User: Quem é Sonia Guimarães? Assistant: Professora do ITA..." | Nova mensagem: "me traga mais" -> "biografia trajetória e carreira de Sonia Guimarães"`
                        },
                        {
                            role: "user",
                            content: `Histórico recente:\n${ultimasMensagens}\n\nNova mensagem do usuário: "${mensagem}"`
                        }
                    ],
                    temperature: 0.1,
                    max_tokens: 60
                });
                const queryReescrita = recontextCompletion.choices[0]?.message?.content?.trim();
                if (queryReescrita && queryReescrita.length > 3) {
                    queryBusca = queryReescrita.replace(/^["']|["']$/g, '');
                    console.log(`🔄 Query Recontextualizada: "${mensagem}" ➔ "${queryBusca}"`);
                }
            } catch (e) {
                console.warn("⚠️ Aviso ao recontextualizar query:", e.message);
            }
        }

        // FASE 2: Recuperação Vetorial com a Query Recontextualizada
        const busca = await vectorEngine.search(queryBusca, { topK: parsedTopK, pais });
        const docs = busca.resultados;

        // Formatação do contexto recuperado e montagem do prompt conciso
        const contextoRecuperado = formatarContextoRecuperado(docs, true);

        // FASE 3: Geração Aumentada com Histórico Completo de Mensagens
        const systemPrompt = construirSystemPrompt(contextoRecuperado);

        // Prepara o array de mensagens com histórico completo
        const messagesPayload = [
            { role: "system", content: systemPrompt }
        ];

        // Adiciona o histórico completo da conversa para manter a memória acumulada do diálogo
        if (historico && Array.isArray(historico)) {
            const historicoValido = historico.map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: typeof m.content === 'string' ? m.content : String(m.content || '')
            }));
            messagesPayload.push(...historicoValido);
        }

        // Se houver imagens ou arquivos anexados, cria estrutura multimodal compatível
        if ((imagens && imagens.length > 0) || (arquivos && arquivos.length > 0)) {
            const userParts = [];
            if (Array.isArray(imagens)) {
                for (const img of imagens) {
                    if (typeof img === 'string' && img.startsWith('data:')) {
                        userParts.push({
                            type: "image_url",
                            image_url: { url: img }
                        });
                    }
                }
            }
            if (Array.isArray(arquivos)) {
                for (const arq of arquivos) {
                    const url = arq.url || arq.data || (typeof arq === 'string' ? arq : null);
                    if (url && typeof url === 'string' && url.startsWith('data:')) {
                        userParts.push({
                            type: "image_url",
                            image_url: { url: url }
                        });
                    }
                }
            }
            userParts.push({ type: "text", text: mensagem || "Por favor, analise a imagem ou mídia anexada no contexto de mulheres em STEM." });
            messagesPayload.push({ role: "user", content: userParts });
        } else {
            messagesPayload.push({ role: "user", content: mensagem });
        }

        const inicioLLM = Date.now();
        let respostaTexto = "";
        let modeloIdentificado = modelo;

        // Roteamento para os 6 Modelos de IA
        if (modelo === 'gemini') {
            const geminiApiKey = process.env.GEMINI_API_KEY;
            const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

            if (!geminiApiKey) {
                return res.status(400).json({ resposta: "❌ GEMINI_API_KEY não configurada no arquivo .env." });
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
            const geminiContents = [];

            // Converte mensagens para formato Gemini
            for (const m of messagesPayload.filter(m => m.role !== 'system')) {
                geminiContents.push({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                });
            }

            const geminiRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: geminiContents,
                    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 }
                })
            });
            const geminiData = await geminiRes.json();
            respostaTexto = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta do Gemini.";
            modeloIdentificado = `Google Gemini (${geminiModel})`;

        } else if (modelo === 'minimax-m3.1-flash' || modelo === 'minimax' || modelo === 'glm-5.3-flash' || modelo === 'glm' || modelo === 'kimi-3' || modelo === 'kimi' || modelo === 'nvidia') {
            const nvidiaApiKey = process.env.NVIDIA_API_KEY;
            const nvidiaModel = process.env.NVIDIA_MODEL || "minimaxai/minimax-m3.1-flash";

            if (!nvidiaApiKey) {
                return res.status(400).json({ resposta: "❌ NVIDIA_API_KEY não configurada no arquivo .env." });
            }

            try {
                const nvidiaBody = {
                    model: nvidiaModel,
                    messages: messagesPayload,
                    temperature: 0.5,
                    top_p: 1,
                    max_tokens: 4096
                };
                if (nvidiaModel.includes("minimax")) {
                    nvidiaBody.reasoning_effort = process.env.NVIDIA_REASONING_EFFORT || "low";
                }
                const nvidiaRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${nvidiaApiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(nvidiaBody),
                    signal: AbortSignal.timeout(45000)
                });
                const nvidiaData = await nvidiaRes.json();
                if (!nvidiaRes.ok) {
                    respostaTexto = `⚠️ **Erro da API NVIDIA (${nvidiaRes.status}):** ${nvidiaData.detail || nvidiaData.error?.message || JSON.stringify(nvidiaData)}.`;
                } else {
                    respostaTexto = nvidiaData?.choices?.[0]?.message?.content
                        || nvidiaData?.choices?.[0]?.message?.reasoning_content
                        || "Sem resposta do MiniMax M3.1 Flash.";
                    req.tokensIn = nvidiaData?.usage?.prompt_tokens || 0;
                    req.tokensOut = nvidiaData?.usage?.completion_tokens || 0;
                }
            } catch (err) {
                respostaTexto = `⚠️ Erro/timeout ao conectar ao endpoint da NVIDIA (${nvidiaModel}): ${err.message}`;
            }
            modeloIdentificado = `MiniMax M3.1 Flash (NVIDIA • ${nvidiaModel})`;

        } else if (modelo === 'gpt-oss-20b' || modelo === 'gpt-oss') {
            const gptOssApiKey = process.env.GPT_OSS_API_KEY || process.env.NVIDIA_API_KEY;
            const gptOssModel = process.env.GPT_OSS_MODEL || "openai/gpt-oss-20b";

            if (!gptOssApiKey) {
                return res.status(400).json({ resposta: "❌ GPT_OSS_API_KEY não configurada no arquivo .env." });
            }

            const gptOssRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${gptOssApiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: gptOssModel,
                    messages: messagesPayload,
                    temperature: 0.7,
                    max_tokens: 4096
                })
            });
            const gptOssData = await gptOssRes.json();
            respostaTexto = gptOssData?.choices?.[0]?.message?.content
                || gptOssData?.choices?.[0]?.message?.reasoning_content
                || "Sem resposta do GPT-OSS-20B.";
            modeloIdentificado = `GPT-OSS-20B (NVIDIA • ${gptOssModel})`;

        } else if (modelo === 'gpt-oss-120b' || modelo === 'gpt-oss-120b-nvidia' || modelo === 'nvidia-gpt-oss-120b') {
            const gptOss120ApiKey = process.env.GPT_OSS_120B_API_KEY || process.env.NVIDIA_API_KEY;
            const gptOss120Model = process.env.GPT_OSS_120B_MODEL || "openai/gpt-oss-120b";

            if (!gptOss120ApiKey) {
                return res.status(400).json({ resposta: "❌ GPT_OSS_120B_API_KEY não configurada no arquivo .env." });
            }

            try {
                const gptOss120Res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${gptOss120ApiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: gptOss120Model,
                        messages: messagesPayload,
                        temperature: 1,
                        top_p: 1,
                        max_tokens: 4096
                    })
                });
                const gptOss120Data = await gptOss120Res.json();
                if (!gptOss120Res.ok) {
                    respostaTexto = `⚠️ **Erro da API NVIDIA (${gptOss120Res.status}):** ${gptOss120Data.detail || gptOss120Data.error?.message || JSON.stringify(gptOss120Data)}.`;
                } else {
                    respostaTexto = gptOss120Data?.choices?.[0]?.message?.content
                        || gptOss120Data?.choices?.[0]?.message?.reasoning_content
                        || "Sem resposta do GPT-OSS-120B (NVIDIA).";
                }
            } catch (err) {
                respostaTexto = `⚠️ Erro ao conectar com o endpoint da NVIDIA para o modelo ${gptOss120Model}: ${err.message}`;
            }
            modeloIdentificado = `GPT-OSS-120B (NVIDIA • 120B Reasoning)`;

        } else if (modelo === 'nemotron-3-super-120b' || modelo === 'nemotron-120b' || modelo === 'nemotron' || modelo === 'nemotron-3-ultra-550b') {
            const nemotron120ApiKey = process.env.NVIDIA_NEMOTRON_120B_API_KEY || process.env.NVIDIA_API_KEY;
            const nemotron120Model = process.env.NEMOTRON_120B_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b";

            if (!nemotron120ApiKey) {
                return res.status(400).json({ resposta: "❌ NVIDIA_NEMOTRON_120B_API_KEY não configurada no arquivo .env." });
            }

            try {
                const nem120Res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${nemotron120ApiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: nemotron120Model,
                        messages: messagesPayload,
                        temperature: 0.7,
                        top_p: 0.95,
                        max_tokens: 4096
                    })
                });
                const nem120Data = await nem120Res.json();

                if (!nem120Res.ok) {
                    respostaTexto = `⚠️ **Erro da API NVIDIA (${nem120Res.status}):** ${nem120Data.detail || nem120Data.error?.message || JSON.stringify(nem120Data)}.`;
                } else {
                    respostaTexto = nem120Data?.choices?.[0]?.message?.content
                        || nem120Data?.choices?.[0]?.message?.reasoning_content
                        || "Sem resposta do Nemotron 3 Super 120B.";
                    req.tokensIn = nem120Data?.usage?.prompt_tokens || 0;
                    req.tokensOut = nem120Data?.usage?.completion_tokens || 0;
                }
            } catch (err) {
                respostaTexto = `⚠️ Erro ao conectar com o endpoint da NVIDIA para o modelo ${nemotron120Model}: ${err.message}`;
            }
            modeloIdentificado = `Nemotron 3.5 Super VL 120B (NVIDIA • 120B MoE)`;

        } else if (modelo === 'mistral-large' || modelo === 'mistral' || modelo === 'mistral-large-4' || modelo === 'mistralai/mistral-large-4-1t-a52b') {
            const mistralApiKey = process.env.MISTRAL_LARGE_API_KEY || process.env.NVIDIA_API_KEY;
            const mistralModel = process.env.MISTRAL_LARGE_MODEL || "mistralai/mistral-large-4-1t-a52b";

            if (!mistralApiKey) {
                return res.status(400).json({ resposta: "❌ MISTRAL_LARGE_API_KEY não configurada no arquivo .env." });
            }

            try {
                const mistralRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${mistralApiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: mistralModel,
                        messages: messagesPayload,
                        temperature: 0.5,
                        top_p: 1,
                        max_tokens: 4096,
                        reasoning_effort: process.env.MISTRAL_REASONING_EFFORT || "medium"
                    })
                });
                const mistralData = await mistralRes.json();

                if (!mistralRes.ok) {
                    respostaTexto = `⚠️ **Erro da API NVIDIA (${mistralRes.status}):** ${mistralData.detail || mistralData.error?.message || JSON.stringify(mistralData)}.`;
                } else {
                    respostaTexto = mistralData?.choices?.[0]?.message?.content
                        || mistralData?.choices?.[0]?.message?.reasoning_content
                        || "Sem resposta do Mistral Large 4.";
                    req.tokensIn = mistralData?.usage?.prompt_tokens || 0;
                    req.tokensOut = mistralData?.usage?.completion_tokens || 0;
                }
            } catch (err) {
                respostaTexto = `⚠️ Erro ao conectar com o endpoint da NVIDIA para o modelo ${mistralModel}: ${err.message}`;
            }
            modeloIdentificado = `Mistral Large 4 (NVIDIA • 1T MoE Multimodal)`;

        } else if (modelo === 'nemotron-3-nano-omni' || modelo === 'nemotron-omni' || modelo === 'nano-omni') {
            const omniApiKey = process.env.NVIDIA_NEMOTRON_OMNI_API_KEY || process.env.NVIDIA_NEMOTRON_API_KEY || process.env.NVIDIA_API_KEY;
            const omniModel = process.env.NEMOTRON_OMNI_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

            if (!omniApiKey) {
                return res.status(400).json({ resposta: "❌ NVIDIA_NEMOTRON_OMNI_API_KEY não configurada no arquivo .env." });
            }

            try {
                const omniRes = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${omniApiKey}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model: omniModel,
                        messages: messagesPayload,
                        temperature: 0.6,
                        top_p: 0.95,
                        max_tokens: 4096
                    })
                });
                const omniData = await omniRes.json();

                if (!omniRes.ok) {
                    respostaTexto = `⚠️ **Erro da API NVIDIA (${omniRes.status}):** ${omniData.detail || omniData.error?.message || JSON.stringify(omniData)}.`;
                } else {
                    respostaTexto = omniData?.choices?.[0]?.message?.content
                        || omniData?.choices?.[0]?.message?.reasoning_content
                        || "Sem resposta do Nemotron 3 Nano Omni.";
                }
            } catch (err) {
                respostaTexto = `⚠️ Erro ao conectar com o endpoint da NVIDIA para o modelo ${omniModel}: ${err.message}`;
            }
            modeloIdentificado = `Nemotron 3 Nano Omni 30B (NVIDIA • Multimodal/Visão)`;

        } else if (modelo === 'qwen' || modelo === 'qwen2.5:1.5b' || modelo === 'local' || modelo === 'ic-qwen' || modelo === 'qwen-2.5-1.5b') {
            const endpointOllama = process.env.OLLAMA_ENDPOINT || "http://localhost:11434/v1/chat/completions";
            const qwenModel = process.env.QWEN_MODEL || "qwen2.5:1.5b";
            try {
                const qwenRes = await fetch(endpointOllama, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: qwenModel,
                        messages: messagesPayload,
                        temperature: 0.3, // Baixa temperatura para fidelidade estrita ao RAG
                        max_tokens: 1536
                    })
                });
                const qwenData = await qwenRes.json();
                respostaTexto = qwenData?.choices?.[0]?.message?.content || "Sem resposta do Qwen 2.5 (Ollama).";
                req.tokensIn = qwenData?.usage?.prompt_tokens || 0;
                req.tokensOut = qwenData?.usage?.completion_tokens || 0;
            } catch (err) {
                respostaTexto = `⚠️ Não foi possível conectar ao Ollama local para o modelo Qwen 2.5 em ${endpointOllama}. Certifique-se de que o Ollama está ativo.`;
            }
            modeloIdentificado = "Qwen 2.5 1.5B (Local Ollama)";

        } else if (modelo === 'phi-3-mini') {
            const endpointPhi3 = process.env.OLLAMA_ENDPOINT || "http://localhost:11434/v1/chat/completions";
            try {
                const phi3Res = await fetch(endpointPhi3, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "phi3",
                        messages: messagesPayload,
                        temperature: 0.5,
                        max_tokens: 1536
                    })
                });
                const phi3Data = await phi3Res.json();
                respostaTexto = phi3Data?.choices?.[0]?.message?.content || "Sem resposta do Phi-3-mini (Ollama).";
            } catch (err) {
                respostaTexto = `⚠️ Não foi possível conectar ao Ollama local para o modelo Phi-3-mini em ${endpointPhi3}. Certifique-se de que o Ollama está rodando com \`ollama run phi3\`.`;
            }
            modeloIdentificado = "Phi-3-mini (Local Ollama)";

        } else if (modelo === 'gemma-2-2b' || modelo === 'gemma') {
            const endpointGemma = process.env.OLLAMA_ENDPOINT || "http://localhost:11434/v1/chat/completions";
            try {
                const gemmaRes = await fetch(endpointGemma, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model: "gemma2:2b",
                        messages: messagesPayload,
                        temperature: 0.5,
                        max_tokens: 1536
                    })
                });
                const gemmaData = await gemmaRes.json();
                respostaTexto = gemmaData?.choices?.[0]?.message?.content || "Sem resposta do Gemma 2 (Ollama).";
            } catch (err) {
                respostaTexto = `⚠️ Não foi possível conectar ao Ollama local para o modelo Gemma 2 em ${endpointGemma}. Certifique-se de que o Ollama está rodando com \`ollama run gemma2:2b\`.`;
            }
            modeloIdentificado = "Gemma 2 - 2B (Local Ollama)";

        } else {
            // Padrão: Groq Cloud
            const chatCompletion = await groq.chat.completions.create({
                messages: messagesPayload,
                model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
                temperature: 0.3,
                max_tokens: 1024,
            });
            respostaTexto = chatCompletion.choices[0]?.message?.content || "Desculpe, não consegui processar a resposta.";
            modeloIdentificado = `Groq (${process.env.GROQ_MODEL || "openai/gpt-oss-120b"})`;

            req.tokensIn = chatCompletion.usage?.prompt_tokens || 0;
            req.tokensOut = chatCompletion.usage?.completion_tokens || 0;
        }

        const tempoLLMMs = Date.now() - inicioLLM;
        const tempoTotalMs = Date.now() - inicioTotal;

        // Para SLMs locais (Ollama corta acima de num_ctx), usa o maior entre o real e o enviado; para nuvem usa o usage real da API
        const isLocalSLM = ['qwen', 'qwen2.5:1.5b', 'local', 'ic-qwen', 'qwen-2.5-1.5b', 'phi-3-mini', 'gemma-2-2b'].includes(String(modelo || '').toLowerCase());
        const promptTokens = isLocalSLM ? Math.max(req.tokensIn || 0, estimarTokens(messagesPayload)) : (req.tokensIn || estimarTokens(messagesPayload));
        const completionTokens = req.tokensOut || estimarTokens(respostaTexto);
        const totalTokens = promptTokens + completionTokens;
        const maxContexto = janelaContexto(modelo);
        const infoContexto = { ...calcularUsoContexto(totalTokens, maxContexto), truncado: totalTokens > maxContexto };

        res.json({
            resposta: respostaTexto,
            tokens_in: promptTokens,
            tokens_out: completionTokens,
            contexto: infoContexto,
            modeloUtilizado: modeloIdentificado,
            queryUtilizada: queryBusca,
            documentosRecuperados: busca.resultados,
            metricas: {
                tempoBuscaVetorialMs: busca.tempoBuscaMs,
                tempoLLMMs: tempoLLMMs,
                tempoTotalMs: tempoTotalMs,
                totalDocumentosNoBanco: vectorEngine.documents.length,
                topKSolicitado: parsedTopK,
                filtroPais: pais || 'Todos',
                documentosUtilizados: busca.resultados.length,
                contexto: infoContexto
            }
        });

    } catch (error) {
        console.error("Erro no chat vetorial:", error);
        res.status(500).json({
            resposta: "Erro ao conectar com a Lumina (Groq Vetorial).",
            erro: error.message
        });
    }
});

// 5. RAG com Streaming em Tempo Real (Server-Sent Events)
app.post('/chat/stream', async (req, res) => {
    try {
        const { mensagem, modelo = 'groq', imagens, arquivos, historico = [], pais = null, topK = 4 } = req.body;
        if (!mensagem && (!imagens || imagens.length === 0)) {
            return res.status(400).send("Mensagem ou mídia obrigatória");
        }

        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();

        const inicioTotal = Date.now();
        const parsedTopK = parseInt(topK, 10) || 4;

        // FASE 1: Busca Vetorial
        let queryBusca = mensagem || "";
        if (!queryBusca && (imagens || arquivos)) {
            queryBusca = "mulheres latino-americanas ciência tecnologia liderança igualdade de gênero iniciativas";
        }

        const busca = await vectorEngine.search(queryBusca, { topK: parsedTopK, pais });
        const docs = busca.resultados;

        let modeloDisplay = "Groq (openai/gpt-oss-120b)";
        if (modelo === 'gemini') modeloDisplay = "Gemini 2.5 Flash (Google)";
        else if (modelo === 'qwen' || modelo === 'qwen2.5:1.5b' || modelo === 'local' || modelo === 'ic-qwen' || modelo === 'qwen-2.5-1.5b') modeloDisplay = "Qwen 2.5 1.5B (Local Ollama)";
        else if (modelo === 'mistral-large' || modelo === 'mistral' || modelo === 'mistral-large-4') modeloDisplay = "Mistral Large 4 (NVIDIA • 1T Multimodal)";
        else if (modelo === 'minimax-m3.1-flash' || modelo === 'minimax' || modelo === 'glm-5.3-flash' || modelo === 'glm' || modelo === 'kimi-3' || modelo === 'kimi' || modelo === 'nvidia') modeloDisplay = "MiniMax M3.1 Flash (NVIDIA)";
        else if (modelo === 'nemotron-3-nano-omni') modeloDisplay = "Nemotron 3 Nano Omni 30B (NVIDIA • Multimodal)";
        else if (modelo === 'nemotron-3-super-120b') modeloDisplay = "Nemotron 3.5 Super VL 120B (NVIDIA)";
        else if (modelo === 'gpt-oss-20b') modeloDisplay = "GPT-OSS 20B (NVIDIA)";
        else if (modelo === 'phi-3-mini') modeloDisplay = "Phi-3-mini (Local Ollama)";
        else if (modelo === 'gemma-2-2b') modeloDisplay = "Gemma 2 2B (Local Ollama)";

        // Formata os documentos recuperados e aplica o guardrail conciso de economia de tokens
        const contextoRecuperado = formatarContextoRecuperado(docs, false);
        const systemPrompt = construirSystemPrompt(contextoRecuperado);

        const messagesPayload = [{ role: "system", content: systemPrompt }];
        if (historico && Array.isArray(historico)) {
            const historicoValido = historico.map(m => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: typeof m.content === 'string' ? m.content : String(m.content || '')
            }));
            messagesPayload.push(...historicoValido);
        }
        // Suporte a anexos de imagem (multimodal) também no streaming
        if ((imagens && imagens.length > 0) || (arquivos && arquivos.length > 0)) {
            const userParts = [];
            if (Array.isArray(imagens)) {
                for (const img of imagens) {
                    if (typeof img === 'string' && img.startsWith('data:')) {
                        userParts.push({ type: "image_url", image_url: { url: img } });
                    }
                }
            }
            if (Array.isArray(arquivos)) {
                for (const arq of arquivos) {
                    const url = arq.url || arq.data || (typeof arq === 'string' ? arq : null);
                    if (url && typeof url === 'string' && url.startsWith('data:')) {
                        userParts.push({ type: "image_url", image_url: { url: url } });
                    }
                }
            }
            userParts.push({ type: "text", text: mensagem || "Por favor, analise a imagem ou mídia anexada no contexto de mulheres em STEM." });
            messagesPayload.push({ role: "user", content: userParts });
        } else {
            messagesPayload.push({ role: "user", content: mensagem });
        }

        // Estima o uso inicial de tokens para o contexto RAG
        const estimatedPromptTokens = estimarTokens(messagesPayload);
        const maxCtx = janelaContexto(modelo);
        const initialContexto = calcularUsoContexto(estimatedPromptTokens, maxCtx);
        let streamUsage = null;
        let streamText = "";

        // Envia metadados imediatos (fontes recuperadas, estatísticas da busca e uso de contexto)
        res.write(`event: metadata\ndata: ${JSON.stringify({
            documentosRecuperados: docs,
            modeloUtilizado: modeloDisplay,
            contexto: initialContexto,
            metricas: {
                tempoBuscaVetorialMs: busca.tempoBuscaMs,
                totalDocumentosNoBanco: vectorEngine.documents.length,
                topKSolicitado: parsedTopK,
                filtroPais: pais || 'Todos',
                documentosUtilizados: docs.length,
                contexto: initialContexto
            }
        })}\n\n`);

        // Stream via Groq (Padrão e Mais Rápido)
        if (modelo === 'groq' || modelo === 'gpt-oss-120b') {
            const stream = await groq.chat.completions.create({
                messages: messagesPayload,
                model: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
                stream: true,
                temperature: 0.6,
                max_tokens: 4096
            });

            for await (const chunk of stream) {
                const u = chunk.x_groq?.usage || chunk.usage;
                if (u) streamUsage = { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens };
                const token = chunk.choices[0]?.delta?.content || "";
                if (token) {
                    streamText += token; res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
                }
            }
        } else if (modelo === 'gemini') {
            const geminiApiKey = process.env.GEMINI_API_KEY;
            const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:streamGenerateContent?alt=sse&key=${geminiApiKey}`;

            const geminiContents = [];
            for (const m of messagesPayload.filter(m => m.role !== 'system')) {
                geminiContents.push({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                });
            }

            const geminiRes = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: geminiContents,
                    generationConfig: { temperature: 0.6, maxOutputTokens: 4096 }
                })
            });

            if (!geminiRes.ok) {
                const errText = await geminiRes.text();
                res.write(`event: error\ndata: ${JSON.stringify({ erro: errText })}\n\n`);
            } else {
                const reader = geminiRes.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    for (const line of lines) {
                        if (line.startsWith('data:')) {
                            try {
                                const parsed = JSON.parse(line.slice(5).trim());
                                if (parsed.usageMetadata) {
                                    const um = parsed.usageMetadata;
                                    streamUsage = { prompt_tokens: um.promptTokenCount || 0, completion_tokens: um.candidatesTokenCount || 0, total_tokens: um.totalTokenCount || 0 };
                                }
                                const textPart = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
                                if (textPart) {
                                    streamText += textPart; res.write(`event: token\ndata: ${JSON.stringify({ token: textPart })}\n\n`);
                                }
                            } catch (e) { }
                        }
                    }
                }
            }
        } else {
            // Demais modelos (NVIDIA NIM / Ollama) via OpenAI-compatible stream
            let apiUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
            let apiKey = process.env.NVIDIA_API_KEY;
            let modelName = process.env.NVIDIA_MODEL || "minimaxai/minimax-m3.1-flash";

            if (modelo === 'minimax-m3.1-flash' || modelo === 'minimax' || modelo === 'glm-5.3-flash' || modelo === 'glm' || modelo === 'kimi-3' || modelo === 'kimi' || modelo === 'nvidia') {
                apiKey = process.env.NVIDIA_API_KEY;
                modelName = process.env.NVIDIA_MODEL || "minimaxai/minimax-m3.1-flash";
            } else if (modelo === 'nemotron-3-nano-omni') {
                apiKey = process.env.NVIDIA_NEMOTRON_OMNI_API_KEY || process.env.NVIDIA_API_KEY;
                modelName = process.env.NEMOTRON_OMNI_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
            } else if (modelo === 'nemotron-3-super-120b') {
                apiKey = process.env.NVIDIA_NEMOTRON_120B_API_KEY || process.env.NVIDIA_API_KEY;
                modelName = process.env.NEMOTRON_120B_MODEL || "nvidia/nemotron-3.5-super-vl-120b-a12b";
            } else if (modelo === 'mistral-large' || modelo === 'mistral' || modelo === 'mistral-large-4' || modelo === 'mistralai/mistral-large-4-1t-a52b') {
                apiKey = process.env.MISTRAL_LARGE_API_KEY || process.env.NVIDIA_API_KEY;
                modelName = process.env.MISTRAL_LARGE_MODEL || "mistralai/mistral-large-4-1t-a52b";
            } else if (modelo === 'gpt-oss-20b') {
                apiKey = process.env.GPT_OSS_API_KEY || process.env.NVIDIA_API_KEY;
                modelName = process.env.GPT_OSS_MODEL || "openai/gpt-oss-20b";
            } else if (modelo === 'phi-3-mini' || modelo === 'gemma-2-2b' || modelo === 'qwen' || modelo === 'qwen2.5:1.5b' || modelo === 'local' || modelo === 'ic-qwen' || modelo === 'qwen-2.5-1.5b') {
                apiUrl = process.env.OLLAMA_ENDPOINT || "http://localhost:11434/v1/chat/completions";
                apiKey = "ollama";

                if (modelo === 'phi-3-mini') {
                    modelName = "phi3";
                } else if (modelo === 'gemma-2-2b') {
                    modelName = "gemma2:2b";
                } else {
                    modelName = process.env.QWEN_MODEL || "qwen2.5:1.5b"; // Padrão selecionado
                }
            }

            const streamBody = {
                model: modelName,
                messages: messagesPayload,
                temperature: (modelName.includes("mistral") || modelName.includes("minimax") || modelName.includes("glm")) ? 0.5 : 0.6,
                max_tokens: apiUrl.includes("nvidia.com") ? 4096 : 1536,
                stream: true,
                stream_options: { include_usage: true }
            };
            if (modelName.includes("minimax") || modelName.includes("glm")) {
                streamBody.top_p = 1;
            }
            if (modelName.includes("mistral")) {
                streamBody.reasoning_effort = process.env.MISTRAL_REASONING_EFFORT || "medium";
            }
            if (modelName.includes("minimax")) {
                streamBody.reasoning_effort = process.env.NVIDIA_REASONING_EFFORT || "low";
            }

            const streamRes = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(streamBody),
                signal: AbortSignal.timeout(apiUrl.includes("nvidia.com") ? 60000 : 120000)
            });

            if (!streamRes.ok) {
                const errText = await streamRes.text();
                res.write(`event: error\ndata: ${JSON.stringify({ erro: errText })}\n\n`);
            } else {
                const reader = streamRes.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop();
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('data:')) {
                            const dataPayload = trimmed.slice(5).trim();
                            if (dataPayload === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(dataPayload);
                                const token = parsed.choices?.[0]?.delta?.content || "";
                                if (token) {
                                    streamText += token; res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
                                }
                                if (parsed.usage) streamUsage = parsed.usage;
                            } catch (e) { }
                        }
                    }
                }
            }
        }

        // Emite um único evento de usage ao final (real da API ou estimado)
        // SLMs locais truncam acima do num_ctx; modelos em nuvem retornam o usage real exato
        const isLocalSLM = ['qwen', 'qwen2.5:1.5b', 'local', 'ic-qwen', 'qwen-2.5-1.5b', 'phi-3-mini', 'gemma-2-2b'].includes(String(modelo || '').toLowerCase());
        const promptT = isLocalSLM ? Math.max(streamUsage?.prompt_tokens || 0, estimatedPromptTokens) : (streamUsage?.prompt_tokens || estimatedPromptTokens);
        const complT = streamUsage?.completion_tokens || estimarTokens(streamText);
        const totalT = promptT + complT;
        const finalContexto = { ...calcularUsoContexto(totalT, maxCtx), estimado: !streamUsage, truncado: totalT > maxCtx };
        res.write(`event: usage\ndata: ${JSON.stringify({ usage: { prompt_tokens: promptT, completion_tokens: complT, total_tokens: totalT }, contexto: finalContexto })}\n\n`);

        res.write('event: done\ndata: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error("Erro no SSE Streaming:", error);
        res.write(`event: error\ndata: ${JSON.stringify({ erro: error.message })}\n\n`);
        res.end();
    }
});

// Função para transformar Markdown e Tabelas em Narração Fluida e Natural
function prepareTextForSpeech(text) {
    if (!text) return "";

    // 1. Remove qualquer bloco de tabela HTML <table>...</table>
    let cleaned = text.replace(/<table[\s\S]*?<\/table>/gi, "\nOs dados detalhados estão organizados na tabela na tela.\n");

    // 2. Processa tabelas Markdown (com ou sem barras nas extremidades)
    const lines = cleaned.split('\n');
    const processedLines = [];
    let inTable = false;
    let tableRowCount = 0;

    function flushTable() {
        if (tableRowCount > 0) {
            processedLines.push("Os dados detalhados estão organizados na tabela na tela.");
        }
        tableRowCount = 0;
        inTable = false;
    }

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        // Linha pertencente a tabela: contém 2+ pipes ou separador de colunas (|---| ou ---|---)
        const isTableLine = (line.includes('|') && (line.match(/\|/g) || []).length >= 1 && !line.startsWith('>'))
            || /^\|?[\s\-:|]+\|?$/.test(line);

        if (isTableLine) {
            inTable = true;
            if (!/^\|?[\s\-:|]+\|?$/.test(line)) {
                tableRowCount++;
            }
        } else {
            if (inTable) {
                flushTable();
            }
            processedLines.push(line);
        }
    }
    if (inTable) {
        flushTable();
    }

    const clean = processedLines.join('\n');

    return clean
        .replace(/[*#_`~>]/g, '')                // Remove markdown
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // Links [texto](url) -> texto
        .replace(/https?:\/\/\S+/g, '')          // URLs
        .replace(/([0-9]+)\s*%/g, '$1 por cento') // 15% -> 15 por cento
        .replace(/\n{2,}/g, '. ')                // Pausas naturais entre parágrafos
        .replace(/\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Cache simples de TTS em memória (evita re-gasto de cota ao repetir mensagens)
const ttsAudioCache = new Map();

function mapearVozStudio(voz) {
    const v = String(voz || '');
    if (v === 'pt-br-assistant-11') return 'Puck';
    if (v.startsWith('pt-br-')) return 'Kore';
    return v || 'Kore';
}

function pcm16ToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(numChannels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);
    return Buffer.concat([header, pcmBuffer]);
}

async function sintetizarInteractionsTTS(apiKey, model, textoLimpo, voiceName) {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
            model,
            input: [{
                type: "user_input",
                content: [{
                    type: "text",
                    text: textoLimpo,
                    annotations: [{ type: "speech_metadata", style: "natural, clear and fluent Brazilian Portuguese" }]
                }]
            }],
            response_format: { type: "audio" },
            generation_config: { speech_config: [{ voice: voiceName }] }
        })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, status: res.status, erro: data.error?.message || JSON.stringify(data) };
    const audioBlock = [
        ...(data.steps || []).filter(s => s.type === 'model_output').flatMap(s => s.content || []),
        ...(data.outputs || [])
    ].reverse().find(c => c && c.type === 'audio' && c.data);
    if (!audioBlock?.data) return { ok: false, status: 502, erro: "Sem bloco de áudio no retorno." };
    return { ok: true, buffer: Buffer.from(audioBlock.data, 'base64'), mimeType: audioBlock.mime_type || 'audio/wav' };
}

async function sintetizarGemini25TTS(apiKey, textoLimpo, voiceName) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [{ parts: [{ text: `Fale em português do Brasil de forma natural e clara: ${textoLimpo}` }] }],
            generationConfig: {
                responseModalities: ["AUDIO"],
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
            }
        })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, status: res.status, erro: data.error?.message || JSON.stringify(data) };
    const part = (data.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data);
    if (!part) return { ok: false, status: 502, erro: "Sem inlineData no gemini-2.5-flash-preview-tts." };
    const raw = Buffer.from(part.inlineData.data, 'base64');
    const mime = part.inlineData.mimeType || 'audio/wav';
    if (mime.includes('L16') || mime.includes('pcm')) {
        return { ok: true, buffer: pcm16ToWav(raw, 24000, 1, 16), mimeType: 'audio/wav' };
    }
    return { ok: true, buffer: raw, mimeType: mime };
}

// 7. Síntese de Voz com Gemini TTS (Multi-modelo com fallback para não estourar cota)
app.post('/tts', async (req, res) => {
    try {
        const { texto, voz = "pt-br-assistant-5" } = req.body;
        if (!texto) {
            return res.status(400).json({ erro: "Texto obrigatório para síntese de voz." });
        }

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (!geminiApiKey) {
            return res.status(500).json({ erro: "Chave GEMINI_API_KEY não configurada no servidor." });
        }

        const textoLimpo = prepareTextForSpeech(texto);
        if (!textoLimpo) {
            return res.status(400).json({ erro: "Nenhum texto legível após limpeza." });
        }

        const voiceId = String(voz || "pt-br-assistant-5");
        const cacheKey = `${voiceId}::${textoLimpo}`;
        if (ttsAudioCache.has(cacheKey)) {
            const cached = ttsAudioCache.get(cacheKey);
            res.setHeader('Content-Type', cached.mimeType);
            res.setHeader('Content-Length', cached.buffer.length);
            return res.send(cached.buffer);
        }

        const studioVoice = mapearVozStudio(voiceId);
        const tentativas = [
            () => sintetizarInteractionsTTS(geminiApiKey, process.env.GEMINI_TTS_MODEL || "gemini-3.8-flash-lite-tts", textoLimpo, voiceId),
            () => sintetizarInteractionsTTS(geminiApiKey, "gemini-3.8-flash-tts", textoLimpo, voiceId),
            () => sintetizarInteractionsTTS(geminiApiKey, "gemini-3.1-flash-tts-preview", textoLimpo, studioVoice),
            () => sintetizarGemini25TTS(geminiApiKey, textoLimpo, studioVoice)
        ];

        let ultimoErro = { status: 500, erro: "Falha no Gemini TTS." };
        for (const tentar of tentativas) {
            const r = await tentar();
            if (r.ok) {
                if (ttsAudioCache.size >= 30) {
                    ttsAudioCache.delete(ttsAudioCache.keys().next().value);
                }
                ttsAudioCache.set(cacheKey, { buffer: r.buffer, mimeType: r.mimeType });
                res.setHeader('Content-Type', r.mimeType);
                res.setHeader('Content-Length', r.buffer.length);
                return res.send(r.buffer);
            }
            ultimoErro = r;
            console.warn(`⚠️ Fallback Gemini TTS (${r.status}): ${r.erro}`);
        }

        return res.status(ultimoErro.status || 502).json({ erro: ultimoErro.erro });

    } catch (err) {
        console.error("Erro no processamento do Gemini TTS:", err);
        res.status(500).json({ erro: `Erro interno no TTS: ${err.message}` });
    }
});

process.on('uncaughtException', (err) => {
    console.error("⚠️ [UncaughtException capturado no server_vetorial]:", err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error("⚠️ [UnhandledRejection capturado no server_vetorial]:", reason);
});

app.listen(PORT, () => {
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || (process.env.RENDER ? "https://lumina-backend-zsak.onrender.com" : `http://localhost:${PORT}`);
    console.log(`\n======================================================`);
    console.log(`🚀 SERVIDOR VETORIAL DA LUMINA RODANDO NA PORTA ${PORT}`);
    console.log(`📡 URL Base: ${BASE_URL}`);
    console.log(`📊 Endpoint de Estatísticas: ${BASE_URL}/stats`);
    console.log(`💬 Endpoint RAG Vetorial: ${BASE_URL}/chat`);
    console.log(`======================================================\n`);
});
