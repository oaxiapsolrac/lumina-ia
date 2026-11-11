import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { parseBackupEllasTTL, classificarRuido, limparPais } from './ttl_parser.js';
import { IndiceBM25, normalizar } from './busca_lexica.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_TTL_JSON = path.join(__dirname, 'base_ellas_ttl_completa.json');

// --- Modelo de embeddings (configurável) ---
// Lido sob demanda: este módulo é importado antes de o servidor carregar o .env.
// EMBEDDING_PROVIDER=local (padrão) roda o modelo no próprio servidor; =nvidia usa a API da NVIDIA,
// multilíngue, sem carregar modelo na memória. As perguntas passam a ser enviadas à NVIDIA.
const MODELO_PADRAO = 'Xenova/all-MiniLM-L6-v2';
const MODELO_API_PADRAO = 'nvidia/nemotron-3-embed-1b';
const provedorEmbeddings = () => ((process.env.EMBEDDING_PROVIDER || 'local').trim().toLowerCase() === 'nvidia' ? 'nvidia' : 'local');
const modeloEmbeddings = () => (process.env.EMBEDDING_MODEL || '').trim() || (provedorEmbeddings() === 'nvidia' ? MODELO_API_PADRAO : MODELO_PADRAO);
// O nemotron-3-embed-1b devolve 2048 números; os 1024 primeiros dão a mesma qualidade
// (medido no conjunto de avaliação) com metade do arquivo e da memória
const dimensoesApi = () => {
    const v = parseInt(process.env.EMBEDDING_DIMENSOES || '1024', 10);
    return Number.isInteger(v) && v > 0 ? v : 1024;
};
const TIMEOUT_API_MS = () => parseInt(process.env.EMBEDDING_API_TIMEOUT_MS || '5000', 10);
const PAUSA_APOS_FALHA_MS = 60000; // depois de uma falha da API, busca só por palavras durante 1 minuto

function normalizarVetor(v) {
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    // 6 casas: o cache fica menor e o cosseno não muda de forma perceptível
    return v.map((x) => Math.round((x / n) * 1e6) / 1e6);
}

// Modelos da família E5 foram treinados com prefixos que distinguem pergunta e documento
function prefixos(modelo) {
    return /(^|\/)(multilingual-)?e5-/i.test(modelo) ? { consulta: 'query: ', documento: 'passage: ' } : { consulta: '', documento: '' };
}

// Cada modelo tem seu próprio cache: vetores de modelos diferentes não são comparáveis
function arquivoCache(modelo) {
    if (modelo === MODELO_PADRAO) return path.join(__dirname, 'vector_store_cache.json');
    return path.join(__dirname, `vector_store_cache.${modelo.replace(/[^a-zA-Z0-9]+/g, '_')}.json`);
}
const arquivoBackup = (cache) => cache.replace(/\.json$/, '.anterior.json');

// --- Parâmetros da busca híbrida ---
// Peso da busca por palavras (BM25 normalizado de 0 a 1) somado ao cosseno.
// Medido em 22 perguntas de teste: MRR 0,61 sem BM25 e 0,82 com peso entre 0,2 e 0,3.
const pesoLexico = () => {
    // Variável vazia conta como não definida (Number('') daria 0 e desligaria o BM25 sem querer)
    if (!String(process.env.BUSCA_PESO_LEXICO ?? '').trim()) return 0.25;
    const v = Number(process.env.BUSCA_PESO_LEXICO);
    return Number.isFinite(v) && v >= 0 ? v : 0.25;
};
// Bônus medidos no conjunto de avaliação (avaliacao/casos.json, 66 perguntas com documento-alvo):
// MRR 0,872 → 0,924 com o MiniLM e 0,958 com os embeddings da NVIDIA.
const BONUS_NOME = 0.1;           // nome do documento (ou parte dele) citado na pergunta, como palavra inteira
const BONUS_PAIS = 0.08;          // país citado na pergunta, quando não há filtro de país
const LIMIAR_DUPLICADO = 0.97;    // cosseno entre dois documentos a partir do qual são tratados como iguais

// Corte de relevância: dos documentos escolhidos, só vão para o modelo os que têm pontuação de pelo menos
// esta fração da pontuação do primeiro. 0 desliga. O padrão depende do modelo, porque a escala das notas muda:
// MiniLM 0,75 (média de 3,1 documentos em vez de 4) e API 0,65 (3,2). Nos dois, nenhum documento certo
// foi cortado no conjunto de avaliação; com a API, 0,75 já cortava um.
const corteRelativo = () => {
    const v = Number(process.env.BUSCA_CORTE_RELATIVO);
    if (process.env.BUSCA_CORTE_RELATIVO !== undefined && process.env.BUSCA_CORTE_RELATIVO !== '' && Number.isFinite(v) && v >= 0 && v < 1) return v;
    return provedorEmbeddings() === 'nvidia' ? 0.65 : 0.75;
};

/** Tira as séries anuais ("(série: 2013: 45,30%; ...)", "Série feminina: 2014: 6,29%; ...") de um texto. */
function semSeriesHistoricas(texto) {
    return String(texto || '')
        .replace(/\s*[(\[]\s*s[ée]rie[^)\]]*[)\]]/gi, '')
        .replace(/\s*S[ée]rie[^:.;]{0,30}:(?:\s*\d{4}:\s*[^;]*?(?:;|\.(?=\s|$)|$))+/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/** Texto em minúsculas, sem acento e com palavras separadas por um espaço, com espaço nas pontas. */
const formaPalavras = (s) => ` ${normalizar(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

/**
 * Partes do nome que, citadas na pergunta, indicam o documento: o nome inteiro, o curso depois de
 * "Censo INEP:" e o que está dentro e fora de parênteses ("Role Models (Modelos Femininos)").
 * Partes com menos de 4 letras ficam de fora ("Uem" casava com "quem").
 */
function partesDoNome(nome) {
    const partes = new Set([formaPalavras(nome)]);
    const semPrefixo = String(nome || '').replace(/^Censo INEP:\s*/i, '');
    partes.add(formaPalavras(semPrefixo));
    const m = semPrefixo.match(/^(.*?)\s*\((.*?)\)\s*$/);
    if (m) {
        partes.add(formaPalavras(m[1]));
        partes.add(formaPalavras(m[2]));
    }
    return [...partes].filter((p) => p.trim().length >= 4);
}

// Pergunta que pede número ou estatística (português, espanhol e inglês; texto já sem acento).
// "Evolução"/"tendência" pedem série histórica: sem elas, "Como evoluíram as leis... no Paraguai desde 2013?"
// deixava a série do índice WBL em 15º.
const PEDE_NUMERO = /\b(quant[oa]s?|cuant[oa]s?|porcent|percent|propor|taxa|tasa|numero|indice|indicador|estatistic|estadistic|dados?\b|participacao|participacion|representa|maioria|minoria|media|how many|share|rate|evolu|tendencia|trend)|%/;
// Categorias de indicadores numéricos (ontologia, Censo INEP, UNESCO UIS, RICYT/RedIndices). As categorias
// "Estatística - Barreiras/Soluções/Diagnóstico" da base curada descrevem barreiras em texto e ficam de fora.
const CATEGORIA_ESTATISTICA = /^(Indicator|Indicador\b)/i;
// Medido no conjunto de avaliação com a base UNESCO/RICYT (77 perguntas): sem penalidade 73/77 no top-4,
// com 0,1 ficaram 76/77 (financiamento de pesquisa na Argentina voltou de 17º para o top-4).
// Com a base CEPALSTAT (+655 indicadores), 0,1 deixava 3 indicadores de participação política no lugar das
// iniciativas em "Quais iniciativas e políticas... na Argentina?"; com 0,15 a busca fica em 75/77 e o PICT volta ao 1º. 0 desliga.
const penalidadeEstatistica = () => {
    const bruto = process.env.BUSCA_PENALIDADE_ESTATISTICA;
    const v = Number(bruto);
    return bruto !== undefined && String(bruto).trim() !== '' && Number.isFinite(v) && v >= 0 ? v : 0.15;
};

// Pergunta que fala de mulheres ou gênero (texto já sem acento)
const FALA_DE_GENERO = /\b(mulher|mulheres|genero|feminin\w*|meninas?|garotas?|maes?|gestantes?|maternidade|pesquisadoras|engenheiras|professoras|cientistas mulheres|investigadoras|ingenieras|mujer|mujeres|ninas?|madres?|women|woman|gender|girls?|female|mothers?)\b/;
// Documentos que avisam não tratar de mulheres nem de gênero (políticas de carreira do STIP sem recorte de gênero,
// indicadores da CEPALSTAT que não separam por sexo) perdem esta nota quando a pergunta fala de mulheres ou gênero.
// Medido no conjunto de avaliação (77 perguntas) com as bases STIP e WBL: MRR 0,913 sem a penalidade (e sem a
// diversificação por família), 0,915 com 0,15 e 0,921 com 0,25. 0 desliga.
const penalidadeSemGenero = () => {
    const bruto = process.env.BUSCA_PENALIDADE_SEM_GENERO;
    const v = Number(bruto);
    return bruto !== undefined && String(bruto).trim() !== '' && Number.isFinite(v) && v >= 0 ? v : 0.25;
};

// Países reconhecidos na pergunta (português, espanhol e inglês) → forma usada no campo "pais" dos documentos
const PAISES_NA_PERGUNTA = [
    ['brasil', 'brasil'], ['brazil', 'brasil'], ['peru', 'peru'], ['bolivia', 'bolivia'], ['mexico', 'mexico'],
    ['argentina', 'argentina'], ['chile', 'chile'], ['colombia', 'colombia'], ['equador', 'equador'], ['ecuador', 'equador'],
    ['costa rica', 'costa rica'], ['uruguai', 'uruguai'], ['uruguay', 'uruguai'], ['paraguai', 'paraguai'], ['paraguay', 'paraguai'],
    ['el salvador', 'el salvador'], ['venezuela', 'venezuela'], ['guatemala', 'guatemala'], ['cuba', 'cuba'], ['panama', 'panama'],
    // Países que entraram com a base World Bank WBL
    ['honduras', 'honduras'], ['nicaragua', 'nicaragua'], ['republica dominicana', 'republica dominicana'],
    ['dominican republic', 'republica dominicana'], ['haiti', 'haiti']
];

/**
 * Família de um documento das bases tratadas: fonte + indicador, tema de debate ou tema.
 * Cada iniciativa do STIP é a sua própria família (as partes 1, 2 e 3 do mesmo texto contam como uma só).
 */
function familiaDoDocumento(doc) {
    const m = doc.metadados || {};
    if (!m.source) return null;
    if (m.document_type === 'iniciativa') return m.initiative_id ? `${m.source}:iniciativa:${m.initiative_id}` : null;
    const tema = m.indicator_id ?? m.debate_theme_id ?? m.topic;
    return tema === undefined || tema === null ? null : `${m.source}:${tema}`;
}

const chaveNome = (nome) => normalizar(nome).replace(/[^\p{L}\p{N}]+/gu, '');

function produtoEscalar(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}

// Caminhos candidatos, em ordem de prioridade (variável de ambiente primeiro).
// O projeto irmão (teste-lumina-1artigosematec) fica um nível acima e usava '../';
// aqui os arquivos estão dentro de backend/, então a base curada fica dois níveis acima.
function primeiroExistente(candidatos) {
    return candidatos.filter(Boolean).map(p => path.resolve(__dirname, p)).find(p => fs.existsSync(p)) || null;
}

const caminhoTTL = () => primeiroExistente([
    process.env.TTL_PATH,
    'backup_ellas.ttl'
]);

const caminhoConhecimento = () => primeiroExistente([
    process.env.CONHECIMENTO_PATH,
    'conhecimento.js',
    '../conhecimento.js',
    '../../conhecimento.js'
]);

class VectorEngine {
    constructor() {
        this.embedder = null;
        this.modelo = null;
        this.documents = [];
        this.indiceLexico = null;
        this.isInitialized = false;
        this.dimensions = 384;
        this.reindexEmAndamento = null;
        this.partesNome = [];
        this.apiIndisponivelAte = 0;
    }

    async carregarModelo() {
        const modelo = modeloEmbeddings();
        if (provedorEmbeddings() === 'nvidia') {
            this.modelo = modelo;
            return;
        }
        if (this.embedder && this.modelo === modelo) return;
        console.log(`⏳ Inicializando modelo de embeddings local (${modelo})...`);
        // Importado só no modo local: no modo API o servidor não carrega o ONNX na memória
        const { pipeline } = await import('@xenova/transformers');
        this.embedder = await pipeline('feature-extraction', modelo);
        this.modelo = modelo;
    }

    /** Embeddings pela API da NVIDIA (papel: 'consulta' | 'documento'). Lança erro em falha ou demora. */
    async embeddingsApi(textos, papel) {
        const chave = process.env.NVIDIA_API_KEY;
        if (!chave) throw new Error('NVIDIA_API_KEY não configurada para EMBEDDING_PROVIDER=nvidia');
        const res = await fetch('https://integrate.api.nvidia.com/v1/embeddings', {
            method: 'POST',
            headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                model: modeloEmbeddings(),
                input: textos,
                input_type: papel === 'documento' ? 'passage' : 'query',
                encoding_format: 'float',
                truncate: 'END'
            }),
            signal: AbortSignal.timeout(papel === 'documento' ? 60000 : TIMEOUT_API_MS())
        });
        if (!res.ok) throw new Error(`API de embeddings respondeu ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const dados = await res.json();
        return dados.data.map((d) => normalizarVetor(d.embedding.slice(0, dimensoesApi())));
    }

    /** Vetores de vários documentos (em lotes na API, um a um no modelo local). */
    async embeddingsDocumentos(textos, aoProgredir) {
        const vetores = [];
        if (provedorEmbeddings() !== 'nvidia') {
            for (const t of textos) {
                vetores.push(await this.getEmbedding(t, 'documento'));
                aoProgredir?.(vetores.length);
            }
            return vetores;
        }
        const LOTE = 32;
        for (let i = 0; i < textos.length; i += LOTE) {
            const lote = textos.slice(i, i + LOTE);
            for (let tentativa = 1; ; tentativa++) {
                try {
                    vetores.push(...(await this.embeddingsApi(lote, 'documento')));
                    break;
                } catch (e) {
                    if (tentativa >= 4) throw e;
                    console.warn(`⚠️ Lote ${i / LOTE + 1}: ${e.message}. Nova tentativa em ${5 * tentativa} s...`);
                    await new Promise((r) => setTimeout(r, 5000 * tentativa));
                }
            }
            aoProgredir?.(vetores.length);
            await new Promise((r) => setTimeout(r, 1600)); // a API gratuita aceita cerca de 40 chamadas por minuto
        }
        return vetores;
    }

    /** Monta o índice BM25 com os mesmos documentos do índice vetorial (o nome entra duas vezes para pesar mais). */
    construirIndiceLexico() {
        this.partesNome = this.documents.map((d) => [...new Set([d.nome, ...(d.outrosNomes || [])].flatMap(partesDoNome))]);
        // IDF por família: medido no conjunto de avaliação com CEPALSTAT, STIP e WBL, a busca foi de 73/77 (MRR 0,921)
        // para 74/77 (MRR 0,923), e as perguntas novas sobre STIP e WBL de 22/23 para 23/23
        this.indiceLexico = new IndiceBM25(this.documents.map((d) => `${d.nome} ${d.nome} ${d.texto}`),
            { grupos: this.documents.map((d) => d.familia || null) });
    }

    async init() {
        if (this.isInitialized) return;
        await this.carregarModelo();

        // Se já existir cache de vetores salvo para este modelo, carrega em milissegundos
        const cache = arquivoCache(this.modelo);
        if (fs.existsSync(cache)) {
            console.log(`⚡ Carregando banco vetorial do cache local (${path.basename(cache)})...`);
            this.documents = JSON.parse(fs.readFileSync(cache, 'utf-8'));
            // No modo API a dimensão é a configurada: não depende de a API estar no ar na hora de subir o servidor
            const dimensao = provedorEmbeddings() === 'nvidia' ? dimensoesApi() : (await this.getEmbedding('teste', 'consulta')).length;
            if (this.documents[0] && this.documents[0].vetor?.length !== dimensao) {
                console.warn(`⚠️ Cache com vetores de ${this.documents[0].vetor?.length} dimensões, mas o modelo gera ${dimensao}. Reindexando...`);
                await this.reindex();
                return;
            }
            this.dimensions = dimensao;
            this.construirIndiceLexico();
            console.log(`✅ Banco vetorial carregado com ${this.documents.length} documentos indexados da Ontologia ELLAS!`);
            this.isInitialized = true;
            return;
        }

        // Caso contrário, gera os vetores a partir das bases
        console.log(`📦 Cache ${path.basename(cache)} não encontrado. Gerando novo índice vetorial...`);
        await this.reindex();
    }

    /** @param {'consulta'|'documento'} papel define o prefixo exigido por alguns modelos (E5) */
    async getEmbedding(text, papel = 'consulta') {
        await this.carregarModelo();
        if (provedorEmbeddings() === 'nvidia') return (await this.embeddingsApi([text], papel))[0];
        const prefixo = prefixos(this.modelo)[papel] || '';
        const output = await this.embedder(prefixo + text, { pooling: 'mean', normalize: true });
        return Array.from(output.data);
    }

    cosineSimilarity(vecA, vecB) {
        let dotProduct = 0.0;
        let normA = 0.0;
        let normB = 0.0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    // Evita duas reindexações simultâneas (ex.: npm run reindex + POST /reindex)
    async reindex() {
        if (this.reindexEmAndamento) return this.reindexEmAndamento;
        this.reindexEmAndamento = this._reindex().finally(() => { this.reindexEmAndamento = null; });
        return this.reindexEmAndamento;
    }

    async _reindex() {
        console.log("🔄 Reindexando a base vetorial...");
        const rawDocs = [];
        const seenKeys = new Set();
        const resumo = { ontologia: 0, ruidoDescartado: 0, inep: 0, unescoRicyt: 0, cepalstat: 0, stip: 0, wbl: 0, soaas: 0, curado: 0, fontesAusentes: [] };

        // 1. Ontologia ELLAS (JSON gerado pelo ttl_parser.js, ou o próprio TTL se o JSON não existir)
        let docsTTL = [];
        if (fs.existsSync(BASE_TTL_JSON)) {
            docsTTL = JSON.parse(fs.readFileSync(BASE_TTL_JSON, 'utf-8'));
        } else if (caminhoTTL()) {
            docsTTL = await parseBackupEllasTTL({ entrada: caminhoTTL() });
        } else {
            resumo.fontesAusentes.push('ontologia (base_ellas_ttl_completa.json / TTL_PATH)');
        }

        for (const doc of docsTTL) {
            // Defesa extra para JSONs gerados pela versão antiga do parser
            if (classificarRuido([doc.tipo || doc.categoria], doc.nome)) {
                resumo.ruidoDescartado++;
                continue;
            }
            doc.pais = limparPais(doc.pais) || "América Latina";

            // O tipo entra na chave: o mesmo nome pode ser uma Iniciativa e uma Política diferentes (ex.: W-STEM Project)
            const key = `${doc.pais}-${doc.tipo || doc.categoria}-${doc.nome}`.toLowerCase();
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);
            resumo.ontologia++;

            // Só o que está na base: a antiga heurística que acrescentava frases pelo nome
            // ("Foco em ensino de programação...", "...robótica...") virava fato inventado na resposta.
            const detalhesEnriquecidos = doc.detalhes || `Iniciativa ou conceito mapeado no(a) ${doc.pais} pelo Projeto ELLAS (UFMT).`;
            // Nomes do mesmo indicador em outros idiomas (traduções unidas pelo ttl_parser.js)
            const outrosNomes = Array.isArray(doc.outrosNomes) && doc.outrosNomes.length ? doc.outrosNomes : null;

            rawDocs.push({
                id: doc.id,
                nome: doc.nome,
                outrosNomes,
                pais: doc.pais || "América Latina",
                categoria: doc.categoria || doc.tipo || "Iniciativa",
                tipo: doc.tipo || doc.categoria || "Iniciativa",
                cidades: doc.cidades || null,
                estados: doc.estados || null,
                publicoAlvo: doc.publicoAlvo || null,
                financiamento: doc.financiamento || null,
                apoio: doc.apoio || null,
                areas: doc.areas || null,
                objetivos: doc.objetivos || null,
                detalhes: detalhesEnriquecidos,
                texto: `Nome: ${String(doc.nome).replace(/[.\s]+$/, '')}. País: ${doc.pais}. Categoria: ${doc.categoria}. ${detalhesEnriquecidos}${outrosNomes ? `. Outros nomes: ${outrosNomes.join('; ')}` : ''}`
            });
        }

        // 2. Ingestão dos Microdados Educacionais do INEP/MEC
        const INEP_JSON = path.join(__dirname, 'base_inep_extraida.json');
        if (fs.existsSync(INEP_JSON)) {
            try {
                const docsINEP = JSON.parse(fs.readFileSync(INEP_JSON, 'utf-8'));
                for (const doc of docsINEP) {
                    const key = `${doc.pais}-${doc.nome}`.toLowerCase();
                    if (seenKeys.has(key)) continue;
                    seenKeys.add(key);

                    rawDocs.push(doc);
                    resumo.inep++;
                }
                console.log(`✅ ${docsINEP.length} estatísticas do Censo INEP/MEC integradas.`);
            } catch (e) {
                console.warn("⚠️ Aviso ao carregar base_inep_extraida.json:", e.message);
            }
        } else {
            resumo.fontesAusentes.push('INEP (base_inep_extraida.json)');
        }

        // 2b. Indicadores da UNESCO (UIS e DataHub) e da RICYT/RedIndices para 11 países da América Latina.
        // Gerado na pasta ellas.ufmt/newdata (construir_base_lumina.py + construir_extras_unesco.py), com os
        // valores conferidos nas APIs oficiais e os erros das fontes já excluídos.
        const UNESCO_RICYT_JSON = path.join(__dirname, 'base_unesco_ricyt.json');
        if (fs.existsSync(UNESCO_RICYT_JSON)) {
            try {
                const docsUR = JSON.parse(fs.readFileSync(UNESCO_RICYT_JSON, 'utf-8'));
                for (const doc of docsUR) {
                    const key = `${doc.pais}-${doc.categoria}-${doc.nome}`.toLowerCase();
                    if (seenKeys.has(key)) continue;
                    seenKeys.add(key);
                    const outrosNomes = Array.isArray(doc.outrosNomes) && doc.outrosNomes.length ? doc.outrosNomes : null;
                    rawDocs.push({
                        id: doc.id,
                        nome: doc.nome,
                        outrosNomes,
                        pais: doc.pais,
                        categoria: doc.categoria,
                        tipo: doc.tipo || doc.categoria,
                        areas: doc.areas || null,
                        objetivos: doc.objetivos || null,
                        detalhes: doc.detalhes,
                        // Citação: a licença CC BY-SA 4.0 da UNESCO pede a fonte com a licença e o link
                        fonte: doc.fonte || null,
                        urlsFonte: Array.isArray(doc.urlsFonte) && doc.urlsFonte.length ? doc.urlsFonte : null,
                        // Texto do vetor sem as séries anuais (só o dado mais recente): com as séries, o total de
                        // pesquisadoras do Uruguai caía para 21º na busca. A série completa continua em "detalhes".
                        // Os nomes em espanhol e inglês ajudam a busca em perguntas nessas línguas.
                        texto: `${semSeriesHistoricas(doc.texto)}${outrosNomes ? ` Outros nomes: ${outrosNomes.join('; ')}` : ''}`
                    });
                    resumo.unescoRicyt++;
                }
                console.log(`✅ ${resumo.unescoRicyt} indicadores e registros da UNESCO e da RICYT/RedIndices integrados.`);
            } catch (e) {
                console.warn("⚠️ Aviso ao carregar base_unesco_ricyt.json:", e.message);
            }
        } else {
            resumo.fontesAusentes.push('UNESCO/RICYT (base_unesco_ricyt.json)');
        }

        // 2c. Bases tratadas em ellas.ufmt/newdata/<fonte>/tratado, no mesmo formato da base UNESCO/RICYT:
        //  - CEPALSTAT (CEPAL): indicadores de trabalho, renda, uso do tempo, competências digitais, liderança e marcos
        //    legais para os 11 países do ELLAS e agregados da América Latina (tratar_cepalstat.py)
        //  - OECD STIP Compass: políticas de CTI dos governos latino-americanos sobre mulheres e gênero e sobre
        //    formação e carreira em CTI, e debates de política de 2025 (tratar_stip.py)
        //  - World Bank WBL: leis, políticas e aplicação das leis sobre os direitos econômicos das mulheres em
        //    19 países da América Latina, edição 2026 e série 1.0 desde 2013 (tratar_wbl.py)
        // Cada documento diz a origem em dois lugares que vão para o modelo: o começo de "detalhes"
        // ("Fonte: ...") e o campo "fonte", que vira a linha "- Fonte:" do contexto. Documento sem os dois é ignorado.
        const BASES_TRATADAS = [
            { arquivo: 'base_cepalstat.json', contador: 'cepalstat', rotulo: 'indicadores da CEPALSTAT (CEPAL)', origem: /^Fonte: CEPALSTAT/, semSeries: true },
            { arquivo: 'base_stip.json', contador: 'stip', rotulo: 'políticas e debates do OECD STIP Compass', origem: /^Fonte: EC-OECD STIP Compass/, semSeries: false },
            { arquivo: 'base_wbl.json', contador: 'wbl', rotulo: 'documentos do World Bank Women, Business and the Law', origem: /^Fonte: World Bank/, semSeries: false }
        ];
        for (const base of BASES_TRATADAS) {
            const caminho = path.join(__dirname, base.arquivo);
            if (!fs.existsSync(caminho)) {
                resumo.fontesAusentes.push(`${base.rotulo} (${base.arquivo})`);
                continue;
            }
            try {
                const docsBase = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
                for (const doc of docsBase) {
                    const key = `${doc.pais}-${doc.categoria}-${doc.nome}`.toLowerCase();
                    if (seenKeys.has(key)) continue;
                    if (!doc.fonte || !base.origem.test(doc.detalhes || '')) {
                        console.warn(`⚠️ Documento sem origem ignorado (${base.arquivo}): ${doc.id}`);
                        continue;
                    }
                    seenKeys.add(key);
                    const outrosNomes = Array.isArray(doc.outrosNomes) && doc.outrosNomes.length ? doc.outrosNomes : null;
                    rawDocs.push({
                        id: doc.id,
                        nome: doc.nome,
                        outrosNomes,
                        pais: doc.pais,
                        categoria: doc.categoria,
                        tipo: doc.tipo || doc.categoria,
                        areas: doc.areas || null,
                        objetivos: doc.objetivos || null,
                        detalhes: doc.detalhes,
                        fonte: doc.fonte,
                        urlsFonte: Array.isArray(doc.urlsFonte) && doc.urlsFonte.length ? doc.urlsFonte : null,
                        // Família: o mesmo indicador ou tema em vários países (ex.: licenças do WBL nos 19 países),
                        // ou as partes de uma mesma iniciativa do STIP. Na busca sem país citado, entra só um documento de cada família.
                        familia: familiaDoDocumento(doc),
                        semGenero: doc.metadados?.topic === 'carreira_stem' || /não separa os dados por sexo/.test(doc.detalhes || ''),
                        // "texto" já vem curto (sem séries anuais), como na base UNESCO/RICYT
                        texto: `${base.semSeries ? semSeriesHistoricas(doc.texto) : doc.texto}${outrosNomes ? ` Outros nomes: ${outrosNomes.join('; ')}` : ''}`
                    });
                    resumo[base.contador]++;
                }
                console.log(`✅ ${resumo[base.contador]} ${base.rotulo} integrados.`);
            } catch (e) {
                console.warn(`⚠️ Aviso ao carregar ${base.arquivo}:`, e.message);
            }
        }

        // 3. Ingestão de Conhecimento Semântico do SOAAS
        const SOAAS_JSON = path.join(__dirname, 'base_soaas_extraida.json');
        if (fs.existsSync(SOAAS_JSON)) {
            try {
                const docsSOAAS = JSON.parse(fs.readFileSync(SOAAS_JSON, 'utf-8'));
                for (const doc of docsSOAAS) {
                    const key = `${doc.pais}-${doc.nome}`.toLowerCase();
                    if (seenKeys.has(key)) continue;
                    seenKeys.add(key);

                    rawDocs.push(doc);
                    resumo.soaas++;
                }
                console.log(`✅ ${docsSOAAS.length} registros do repositório SOAAS integrados.`);
            } catch (e) {
                console.warn("⚠️ Aviso ao carregar base_soaas_extraida.json:", e.message);
            }
        }

        // 4. Ingestão da Base Curada (conhecimento.js) com Biografias, Fatores e Políticas Detalhadas
        const arquivoConhecimento = caminhoConhecimento();
        if (!arquivoConhecimento) {
            resumo.fontesAusentes.push('base curada (conhecimento.js / CONHECIMENTO_PATH)');
        }
        try {
            const conhecimentoEllas = arquivoConhecimento ? (await import(pathToFileURL(arquivoConhecimento).href)).default : null;
            if (Array.isArray(conhecimentoEllas)) {
                for (const item of conhecimentoEllas) {
                    const nome = item.nome || item.fator || item.contexto || "Dado ELLAS";
                    const pais = item.pais || item.contexto || "América Latina";
                    const categoria = item.categoria || "Estatística / Diagnóstico";
                    const detalhes = item.detalhes || item.dado || item.impacto || item.bio || "";
                    const key = `${pais}-${nome}`.toLowerCase();
                    if (seenKeys.has(key)) continue;
                    seenKeys.add(key);

                    const textoIndexacao = `País/Contexto: ${pais}. Categoria: ${categoria}. Tópico/Nome: ${nome}. Detalhes: ${detalhes}`;
                    
                    rawDocs.push({
                        id: `curado-${nome}`.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                        nome: nome,
                        pais: pais,
                        categoria: categoria,
                        tipo: categoria,
                        cidades: null,
                        estados: null,
                        publicoAlvo: null,
                        financiamento: null,
                        apoio: null,
                        areas: null,
                        objetivos: null,
                        detalhes: detalhes,
                        texto: textoIndexacao
                    });
                    resumo.curado++;
                }
                console.log(`✅ ${resumo.curado} itens da base curada integrados (${arquivoConhecimento}).`);
            }
        } catch (err) {
            console.warn("⚠️ Aviso ao carregar conhecimento.js:", err.message);
        }

        if (resumo.fontesAusentes.length > 0) {
            console.warn(`⚠️ Fontes não encontradas (ficarão fora do índice): ${resumo.fontesAusentes.join('; ')}`);
        }
        if (resumo.ruidoDescartado > 0) {
            console.log(`🧹 ${resumo.ruidoDescartado} nós de esquema/vocabulário da ontologia descartados.`);
        }
        console.log(`📊 Total de ${rawDocs.length} documentos para vetorização. Gerando embeddings...`);

        await this.carregarModelo();
        const total = rawDocs.length;
        let ultimoAviso = 0;
        const vetores = await this.embeddingsDocumentos(rawDocs.map((d) => d.texto), (feitos) => {
            if (feitos - ultimoAviso >= 100 || feitos === total) {
                ultimoAviso = feitos;
                console.log(`⏳ Progresso: ${feitos}/${total} documentos vetorizados (${Math.round(feitos / total * 100)}%)`);
            }
        });
        const indexedDocs = rawDocs.map((doc, i) => ({ ...doc, vetor: vetores[i] }));

        this.documents = indexedDocs;
        this.dimensions = indexedDocs[0]?.vetor.length || this.dimensions;
        this.construirIndiceLexico();
        this.isInitialized = true;

        // Guarda o cache anterior antes de sobrescrever, para permitir voltar atrás
        const cache = arquivoCache(this.modelo);
        if (fs.existsSync(cache)) {
            fs.copyFileSync(cache, arquivoBackup(cache));
            console.log(`🗂️ Cache anterior copiado para ${arquivoBackup(cache)}`);
        }
        // Escreve em arquivo temporário e renomeia, para não deixar um cache corrompido se o processo cair no meio
        const tmp = `${cache}.tmp`;
        // Vetores da API são grandes (1024 números por documento): sem indentação o arquivo fica 2× menor
        fs.writeFileSync(tmp, provedorEmbeddings() === 'nvidia' ? JSON.stringify(indexedDocs) : JSON.stringify(indexedDocs, null, 2));
        fs.renameSync(tmp, cache);
        console.log(`💾 Cache do banco vetorial salvo com sucesso em ${cache}!`);
        return { totalDocumentos: this.documents.length, modeloEmbeddings: this.modelo, ...resumo };
    }

    async search(query, options = {}) {
        const topK = parseInt(options.topK, 10) || 5;
        const minScore = options.minScore !== undefined ? options.minScore : 0.05;
        const pais = options.pais ? options.pais.trim() : null;
        const categoria = options.categoria ? options.categoria.trim() : null;
        const start = Date.now();

        if (!this.isInitialized) {
            await this.init();
        }

        // Vetor da pergunta. Se a API de embeddings falhar ou demorar, a busca segue só por palavras (BM25 + bônus);
        // no conjunto de avaliação isso ainda acerta o documento entre os 4 primeiros em 55 de 60 perguntas.
        let queryVetor = null;
        let modoBusca = 'hibrida';
        if (provedorEmbeddings() === 'nvidia' && Date.now() < this.apiIndisponivelAte) {
            modoBusca = 'palavras';
        } else {
            try {
                queryVetor = await this.getEmbedding(query, 'consulta');
            } catch (e) {
                if (provedorEmbeddings() !== 'nvidia') throw e;
                this.apiIndisponivelAte = Date.now() + PAUSA_APOS_FALHA_MS;
                console.warn(`⚠️ Embeddings da API indisponíveis (${e.message}). Busca só por palavras por ${PAUSA_APOS_FALHA_MS / 1000} s.`);
                modoBusca = 'palavras';
            }
        }
        const consultaPalavras = formaPalavras(query);
        const lexico = this.indiceLexico ? this.indiceLexico.pontuar(query) : null;
        const peso = queryVetor ? pesoLexico() : 1;
        // Só por palavras as notas têm outra escala e o corte tirava documentos certos: nesse modo ele fica desligado
        const corte = options.corteRelativo !== undefined ? Number(options.corteRelativo) : (queryVetor ? corteRelativo() : 0);

        // Helper para normalizar e casar nomes de países e variações regionais
        const matchPais = (docPais, filtroPais) => {
            if (!filtroPais) return true;
            if (!docPais) return false;
            const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
            const fNorm = norm(filtroPais);
            const dNorm = norm(docPais);

            const equivalencias = {
                'brasil': ['brazil', 'brasil'],
                'bolivia': ['bolivia'],
                'peru': ['peru'],
                'mexico': ['mexico'],
                'colombia': ['colombia'],
                'argentina': ['argentina'],
                'chile': ['chile'],
                'equador': ['ecuador', 'equador'],
                'costarica': ['costarica', 'costa rica'],
                'latam': ['latam', 'latin america', 'america latina', 'regional']
            };

            const aliases = equivalencias[fNorm] || [fNorm];
            return aliases.some(alias => dNorm.includes(norm(alias)));
        };

        // Documentos que passam pelos filtros de metadados
        const candidatos = [];
        for (let i = 0; i < this.documents.length; i++) {
            const doc = this.documents[i];
            if (pais && !matchPais(doc.pais, pais)) continue;
            if (categoria && doc.categoria.toLowerCase() !== categoria.toLowerCase()) continue;
            candidatos.push(i);
        }
        // BM25 normalizado pelo maior valor entre os candidatos (0 a 1)
        let maxLexico = 0;
        if (lexico) for (const i of candidatos) if (lexico[i] > maxLexico) maxLexico = lexico[i];

        // Nome (ou parte do nome) citado na pergunta. Vale a citação mais específica: em "Engenharia Elétrica",
        // o curso "Engenharia Elétrica" ganha o bônus e o curso genérico "Engenharia" não.
        const citadas = new Map(); // índice do documento → parte mais longa citada
        for (const i of candidatos) {
            let maior = null;
            for (const p of this.partesNome[i] || []) if (consultaPalavras.includes(p) && (!maior || p.length > maior.length)) maior = p;
            if (maior) citadas.set(i, maior);
        }
        const partesCitadas = [...new Set(citadas.values())];
        for (const [i, p] of citadas) {
            if (partesCitadas.some((o) => o.length > p.length && o.includes(p))) citadas.delete(i);
        }
        // Pergunta que não pede número ("O que a Argentina faz...", "Quais iniciativas..."): os documentos
        // estatísticos perdem um pouco de nota, para não ocuparem o lugar de políticas e iniciativas
        const penalizarEstatisticas = !PEDE_NUMERO.test(normalizar(query));
        const perguntaDeGenero = FALA_DE_GENERO.test(normalizar(query));
        // País citado na pergunta (sem filtro de país): bônus para documentos daquele país
        const paisesCitados = pais ? [] : [...new Set(PAISES_NA_PERGUNTA.filter(([forma]) => consultaPalavras.includes(` ${forma} `)).map(([, p]) => p))];

        const scored = [];
        for (const i of candidatos) {
            const doc = this.documents[i];
            // Vetores normalizados: o produto escalar já é o cosseno
            const semantico = queryVetor ? produtoEscalar(queryVetor, doc.vetor) : 0;
            const lexicoNorm = maxLexico > 0 ? lexico[i] / maxLexico : 0;
            const paisDoc = paisesCitados.length ? normalizar(doc.pais) : '';
            const bonusPais = paisesCitados.some((p) => paisDoc.includes(p)) ? BONUS_PAIS : 0;
            const penalidade = (penalizarEstatisticas && CATEGORIA_ESTATISTICA.test(doc.categoria || '') ? penalidadeEstatistica() : 0)
                + (perguntaDeGenero && doc.semGenero ? penalidadeSemGenero() : 0);
            const score = semantico + peso * lexicoNorm + (citadas.has(i) ? BONUS_NOME : 0) + bonusPais - penalidade;
            if (score >= minScore) scored.push({ doc, score, semantico });
        }
        scored.sort((a, b) => b.score - a.score);

        // Top-K sem repetições: mesmo nome (com/sem acento) ou vetor praticamente idêntico a um já escolhido
        const escolhidos = [];
        const nomesVistos = new Set();
        // Sem país na pergunta (nem filtro), um documento por família: senão as 19 versões nacionais do mesmo tema
        // do WBL ocupavam todo o top-4 de "Como o assédio afeta as estudantes de exatas?"
        const umPorFamilia = !pais && paisesCitados.length === 0;
        const familiasVistas = new Set();
        for (const item of scored) {
            if (escolhidos.length >= topK) break;
            const chave = chaveNome(item.doc.nome);
            if (nomesVistos.has(chave)) continue;
            if (umPorFamilia && item.doc.familia && familiasVistas.has(item.doc.familia)) continue;
            if (item.doc.familia) familiasVistas.add(item.doc.familia);
            if (escolhidos.some((e) => produtoEscalar(e.doc.vetor, item.doc.vetor) > LIMIAR_DUPLICADO)) continue;
            nomesVistos.add(chave);
            escolhidos.push(item);
        }

        // Corte de relevância: tira os documentos bem abaixo do primeiro (sempre fica pelo menos um)
        const cortados = corte > 0 && escolhidos.length ? escolhidos.filter((e, i) => i === 0 || e.score >= corte * escolhidos[0].score) : escolhidos;

        const results = cortados.map(({ doc, score, semantico }) => ({
            id: doc.id,
            nome: doc.nome,
            outrosNomes: doc.outrosNomes || null,
            pais: doc.pais,
            categoria: doc.categoria,
            tipo: doc.tipo,
            detalhes: doc.detalhes,
            fonte: doc.fonte || null,
            urlsFonte: doc.urlsFonte || null,
            score: Number(Math.min(1, score).toFixed(4)),
            scoreSemantico: Number(semantico.toFixed(4)),
            texto: doc.texto
        }));
        const durationMs = Date.now() - start;

        return {
            query,
            totalEncontrados: scored.length,
            topKSolicitado: topK,
            filtroPais: pais || 'Todos',
            tempoBuscaMs: durationMs,
            modoBusca,
            documentosCortados: escolhidos.length - cortados.length,
            resultados: results
        };
    }

    getStats() {
        const paises = new Set();
        const categorias = new Set();
        for (const doc of this.documents) {
            paises.add(doc.pais);
            categorias.add(doc.categoria);
        }
        const modelo = this.modelo || modeloEmbeddings();
        return {
            totalDocumentos: this.documents.length,
            dimensoesVetor: this.dimensions,
            modeloEmbeddings: provedorEmbeddings() === 'nvidia' ? `${modelo} (API NVIDIA, ${dimensoesApi()} dimensões)` : `${modelo} (Local ONNX)`,
            busca: `híbrida: cosseno + ${pesoLexico()} × BM25, corte de relevância ${corteRelativo()}`,
            paisesIndexados: Array.from(paises),
            categoriasIndexadas: Array.from(categorias),
            cacheStatus: fs.existsSync(arquivoCache(modelo)) ? "Salvo em disco" : "Em memória"
        };
    }
}

export const vectorEngine = new VectorEngine();
