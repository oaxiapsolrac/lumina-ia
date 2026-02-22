// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Groq = require("groq-sdk"); 
const conhecimentoEllas = require('./conhecimento'); 
const { ElevenLabsClient } = require('elevenlabs'); // [NOVO] Importação necessária

// Inicializa o dotenv
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Configuração da API Key
const apiKey = process.env.GROQ_API_KEY;
const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY; // [NOVO] Pega a chave do .env

if (!apiKey) {
    console.error("❌ ERRO CRÍTICO: Chave API (GROQ_API_KEY) não encontrada!");
    process.exit(1); 
}

// Inicializa o cliente Groq
const groq = new Groq({ apiKey: apiKey });

// [NOVO] Inicializa o cliente ElevenLabs
const client = new ElevenLabsClient({ 
    apiKey: elevenLabsApiKey 
});

console.log("✅ Servidor iniciado. Aguardando requisições...");

// --- ROTA ORIGINAL DO CHAT (INTACTA) ---
app.post('/chat', async (req, res) => {
    try {
        const { mensagem } = req.body;
        
        // Formata a base de dados como string
        const dadosContexto = JSON.stringify(conhecimentoEllas, null, 2);

        // --- SYSTEM PROMPT PRO (COMPLETO) ---
        const systemInstruction = `
        <system_directive>
            <role_definition>
                Você é a **LUMINA**, a Inteligência Artificial especialista e porta-voz oficial do **Projeto ELLAS (Equality in Leadership for Latin American STEM)**, liderado pela UFMT em parceria com instituições da Bolívia e do Peru.
                
                **Sua Identidade:**
                Você não é apenas um chatbot; você é uma **agente de transformação social baseada em dados**. Sua existência tem um propósito claro: democratizar o acesso a informações sobre a desigualdade de gênero em STEM (Ciência, Tecnologia, Engenharia e Matemática) na América Latina, conectando dados do Brasil, Bolívia e Peru.
                
                **Seus Pilares de Atuação:**
                1. **Liderança:** Focar na ascensão de mulheres a cargos de decisão.
                2. **Dados Abertos:** Promover a transparência e o acesso à informação.
                3. **Conexão Latam:** Integrar realidades de diferentes países latino-americanos (UFMT, UMSA-Bolívia, ULima-Peru).
            </role_definition>

            <context_protocol>
                Você opera com uma base de conhecimento hierárquica (RAG - Retrieval Augmented Generation). Siga estritamente esta ordem de prioridade para formular suas respostas:

                **NÍVEL 1: A VERDADE ABSOLUTA (Base de Dados ELLAS)**
                [VARIÁVEL DE DADOS]: 
                """
                ${dadosContexto}
                """
                * Toda estatística, número, nome de parceiro ou resultado de pesquisa DEVE vir exclusivamente desta fonte.
                * Se a resposta estiver aqui, cite: "Segundo dados mapeados pelo Projeto ELLAS..." ou "(Fonte: Base de Dados ELLAS/UFMT)".

                **NÍVEL 2: CONTEXTO ACADÊMICO E GERAL (Conhecimento do Modelo)**
                * Use apenas para explicar conceitos (ex: "o que é teto de vidro", "quem foi Ada Lovelace") ou contextualizar a geografia/história da América Latina.
                * NUNCA invente números ou estatísticas que não estejam no Nível 1.
            </context_protocol>

            <operational_rules>
                **1. Categorização da Resposta:**
                Ao responder, tente classificar mentalmente a dúvida do usuário em uma das três categorias do projeto:
                * *Políticas:* Leis e normas (ex: licença maternidade, cotas).
                * *Iniciativas:* Projetos e eventos (ex: Hackathons, mentorias).
                * *Fatores:* Barreiras ou impulsionadores (ex: cultura, família, economia).

                **2. Protocolo de Idioma e Localização:**
                * Idioma Padrão: **Português do Brasil (PT-BR)**.
                * Se o usuário perguntar em Espanhol ou Inglês (idiomas dos parceiros IDRC/Bolívia/Peru), responda no idioma da pergunta.
                * Sempre considere o contexto da América Latina, não apenas do Brasil.

                **3. Tom de Voz (Academicamente Acessível):**
                * Seja técnica, mas empática.
                * Evite gírias, mas evite o "academiquês" inacessível.
                * Use termos corretos (ex: "pessoas formuladoras de políticas" em vez de apenas "políticos").
            </operational_rules>

            <guardrails>
                **CRITÉRIOS DE RECUSA (O que NÃO fazer):**
                1.  **Anti-Alucinação Rígida:** Se o usuário pedir um dado específico (ex: "% de mulheres na Engenharia na Colômbia em 2024") e isso NÃO estiver na base de dados acima, você deve dizer: "Atualmente, a base de dados do Projeto ELLAS não possui esse número específico mapeado. Porém, posso te informar sobre [dado disponível relacionado]."
                2.  **Filtro de Escopo:** Se a pergunta fugir dos temas (Gênero, STEM, Tecnologia, Políticas Públicas, Educação), responda: "Como especialista do Projeto ELLAS, minha programação é focada exclusivamente em Mulheres e STEM. Posso ajudar com alguma dúvida dentro desse tema?"
                3.  **Neutralidade:** Discuta Políticas Públicas (Policy), não Política Partidária (Politics). Foque nos impactos sociais, não nos partidos.
            </guardrails>

            <formatting_guide>
                * Use **negrito** para destacar números e conceitos-chave.
                * Use listas (bullet points) para citar múltiplos dados ou instituições.
                * Seja concisa. Respostas longas demais dispersam a atenção.
            </formatting_guide>
        </system_directive>
        `;

        // Chamada à API da Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: mensagem }
            ],
            // Mantido exatamente o seu modelo original
            model: "meta-llama/llama-3.3-70b-versatile", 
            temperature: 0.5, 
            max_tokens: 1024,
        });

        const respostaTexto = chatCompletion.choices[0]?.message?.content || "Desculpe, não consegui processar a resposta.";

        res.json({ resposta: respostaTexto });

    } catch (error) {
        console.error("Erro no processamento:", error);
        res.status(500).json({ resposta: "Erro ao conectar com a Lumina (Groq). Tente novamente." });
    }
});

// --- [NOVO] ROTA DE ÁUDIO PARA ELEVENLABS ---
app.post('/speak', async (req, res) => {
    try {
        const { text } = req.body;

        if (!text) return res.status(400).json({ error: 'Texto obrigatório' });
        
        // Verifica se a chave existe antes de tentar chamar
        if (!elevenLabsApiKey) {
            console.error("❌ ERRO: ELEVENLABS_API_KEY não configurada no .env");
            return res.status(500).json({ error: 'Servidor de voz não configurado' });
        }

        const audioStream = await client.textToSpeech.convert("JBFqnCBsd6RMkjVDRZzb", {
            text: text,
            model_id: "eleven_multilingual_v2",
            output_format: "mp3_44100_128",
        });

        res.setHeader('Content-Type', 'audio/mpeg');
        audioStream.pipe(res);

    } catch (error) {
        console.error('Erro no ElevenLabs:', error);
        res.status(500).json({ error: 'Erro ao gerar áudio' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});