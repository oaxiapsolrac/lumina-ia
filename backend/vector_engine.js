import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from '@xenova/transformers';
import { parseBackupEllasTTL } from './ttl_parser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.join(__dirname, 'vector_store_cache.json');
const TTL_FILE = path.join(__dirname, 'backup_ellas.ttl');
const BASE_TTL_JSON = path.join(__dirname, 'base_ellas_ttl_completa.json');
const CONHECIMENTO_FILE = path.join(__dirname, '../conhecimento.js');

class VectorEngine {
    constructor() {
        this.embedder = null;
        this.documents = [];
        this.isInitialized = false;
        this.dimensions = 384;
    }

    async init() {
        if (this.isInitialized) return;

        console.log("⏳ Inicializando modelo de embeddings local (Xenova/all-MiniLM-L6-v2)...");
        this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

        // Se já existir cache de vetores salvo, carrega em milissegundos
        if (fs.existsSync(CACHE_FILE)) {
            console.log("⚡ Carregando banco vetorial do cache local...");
            const rawCache = fs.readFileSync(CACHE_FILE, 'utf-8');
            this.documents = JSON.parse(rawCache);
            console.log(`✅ Banco vetorial carregado com ${this.documents.length} documentos indexados da Ontologia ELLAS!`);
            this.isInitialized = true;
            return;
        }

        // Caso contrário, gera os vetores a partir do backup completo da ontologia
        console.log("📦 Cache não encontrado. Gerando novo índice vetorial a partir do backup_ellas.ttl...");
        await this.reindex();
    }

    async getEmbedding(text) {
        if (!this.embedder) {
            this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        }
        const output = await this.embedder(text, { pooling: 'mean', normalize: true });
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

    async reindex() {
        console.log("🔄 Reindexando base de dados COMPLETA a partir do backup_ellas.ttl (5.5M linhas)...");
        const rawDocs = [];
        const seenKeys = new Set();

        // 1. Ingestão profunda do backup_ellas.ttl via ttl_parser
        let docsTTL = [];
        if (fs.existsSync(BASE_TTL_JSON)) {
            docsTTL = JSON.parse(fs.readFileSync(BASE_TTL_JSON, 'utf-8'));
        } else if (fs.existsSync(TTL_FILE)) {
            docsTTL = await parseBackupEllasTTL();
        }

        for (const doc of docsTTL) {
            const key = `${doc.pais}-${doc.nome}`.toLowerCase();
            if (seenKeys.has(key)) continue;
            seenKeys.add(key);

            let detalhesEnriquecidos = doc.detalhes || `Iniciativa ou conceito mapeado no(a) ${doc.pais} pelo Projeto ELLAS (UFMT).`;
            const nomeLower = doc.nome.toLowerCase();

            if (nomeLower.includes("programar") || nomeLower.includes("código") || nomeLower.includes("code") || nomeLower.includes("software") || nomeLower.includes("dev") || nomeLower.includes("pyladies") || nomeLower.includes("reprograma")) {
                detalhesEnriquecidos += " Foco em ensino de programação, capacitação técnica em software, desenvolvimento web e inclusão digital de mulheres.";
            } else if (nomeLower.includes("robot") || nomeLower.includes("maker") || nomeLower.includes("stem") || nomeLower.includes("steam") || nomeLower.includes("meninas")) {
                detalhesEnriquecidos += " Foco em incentivo a meninas e mulheres nas ciências exatas, robótica, engenharia e áreas de STEM.";
            }

            rawDocs.push({
                id: doc.id,
                nome: doc.nome,
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
                texto: `Nome: ${doc.nome}. País: ${doc.pais}. Categoria: ${doc.categoria}. ${detalhesEnriquecidos}`
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
                }
                console.log(`✅ ${docsINEP.length} estatísticas do Censo INEP/MEC integradas.`);
            } catch (e) {
                console.warn("⚠️ Aviso ao carregar base_inep_extraida.json:", e.message);
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
                }
                console.log(`✅ ${docsSOAAS.length} registros do repositório SOAAS integrados.`);
            } catch (e) {
                console.warn("⚠️ Aviso ao carregar base_soaas_extraida.json:", e.message);
            }
        }

        // 4. Ingestão da Base Curada (conhecimento.js) com Biografias, Fatores e Políticas Detalhadas
        try {
            const conhecimentoEllas = (await import('../conhecimento.js')).default;
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
                }
            }
        } catch (err) {
            console.warn("⚠️ Aviso ao carregar conhecimento.js:", err.message);
        }

        console.log(`📊 Total de ${rawDocs.length} documentos para vetorização. Gerando embeddings...`);

        const indexedDocs = [];
        let count = 0;
        const total = rawDocs.length;

        for (const doc of rawDocs) {
            const vetor = await this.getEmbedding(doc.texto);
            indexedDocs.push({
                ...doc,
                vetor: vetor
            });
            count++;
            if (count % 100 === 0 || count === total) {
                console.log(`⏳ Progresso: ${count}/${total} documentos vetorizados (${Math.round(count/total*100)}%)`);
            }
        }

        this.documents = indexedDocs;
        this.isInitialized = true;

        // Salva cache em disco
        fs.writeFileSync(CACHE_FILE, JSON.stringify(indexedDocs, null, 2));
        console.log(`💾 Cache do banco vetorial salvo com sucesso em ${CACHE_FILE}!`);
        return this.documents.length;
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

        const queryVetor = await this.getEmbedding(query);
        const queryLower = query.toLowerCase();

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

        const scored = [];
        for (const doc of this.documents) {
            // Filtros de metadados opcionais
            if (pais && !matchPais(doc.pais, pais)) {
                continue;
            }
            if (categoria && doc.categoria.toLowerCase() !== categoria.toLowerCase()) {
                continue;
            }

            // Similaridade semântica de cosseno
            let score = this.cosineSimilarity(queryVetor, doc.vetor);

            // Boost léxico (se o termo exato estiver no nome da entidade)
            if (queryLower.includes(doc.nome.toLowerCase()) || doc.nome.toLowerCase().includes(queryLower)) {
                score = Math.min(1.0, score + 0.15);
            }

            if (score >= minScore) {
                scored.push({
                    id: doc.id,
                    nome: doc.nome,
                    pais: doc.pais,
                    categoria: doc.categoria,
                    tipo: doc.tipo,
                    detalhes: doc.detalhes,
                    score: Number(score.toFixed(4)),
                    texto: doc.texto
                });
            }
        }

        // Ordena por score descendente
        scored.sort((a, b) => b.score - a.score);
        const results = scored.slice(0, topK);
        const durationMs = Date.now() - start;

        return {
            query,
            totalEncontrados: scored.length,
            topKSolicitado: topK,
            filtroPais: pais || 'Todos',
            tempoBuscaMs: durationMs,
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
        return {
            totalDocumentos: this.documents.length,
            dimensoesVetor: this.dimensions,
            modeloEmbeddings: "Xenova/all-MiniLM-L6-v2 (Local ONNX)",
            paisesIndexados: Array.from(paises),
            categoriasIndexadas: Array.from(categorias),
            cacheStatus: fs.existsSync(CACHE_FILE) ? "Salvo em disco" : "Em memória"
        };
    }
}

export const vectorEngine = new VectorEngine();
