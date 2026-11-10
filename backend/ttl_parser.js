import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TTL_PADRAO = path.join(__dirname, 'backup_ellas.ttl');
const SAIDA_PADRAO = path.join(__dirname, 'base_ellas_ttl_completa.json');

// ---------------------------------------------------------------------------
// Classificação de ruído (usada aqui e na ingestão do vector_engine.js)
// ---------------------------------------------------------------------------

// Tipos do vocabulário OWL/RDF que indicam definição de esquema, não instância
const TIPOS_ESQUEMA = new Set([
    'Class', 'Property', 'ObjectProperty', 'DatatypeProperty', 'AnnotationProperty',
    'OntologyProperty', 'FunctionalProperty', 'InverseFunctionalProperty',
    'TransitiveProperty', 'SymmetricProperty', 'AsymmetricProperty',
    'ReflexiveProperty', 'IrreflexiveProperty', 'Ontology', 'Restriction',
    'Datatype', 'AllDisjointClasses', 'AllDifferent'
]);

// Tipos de nós de vocabulário controlado (valores de país, público-alvo, área),
// que não têm conteúdo próprio e já aparecem dentro das iniciativas
const TIPOS_VOCABULARIO = new Set([
    'Location', 'Country', 'City', 'State', 'Target_Audience',
    'Target_Audience_EducationalLevel', 'TargetAudienceEducationalLevel',
    'Area', 'SpecificArea', 'AdministrativeCategory'
]);

const NOMES_DE_CLASSE = new Set(['Area', 'Location', 'Target_Audience', 'AdministrativeCategory']);

// Inclui as subclasses Target_Audience_Gender, Target_Audience_Age, Target_Audience_JobPosition etc.
function ehTipoVocabulario(local) {
    return TIPOS_VOCABULARIO.has(local) || /^Target_?Audience/.test(local);
}

function normalizarTipo(t) {
    return String(t || '').trim().replace(/[;,.\s]+$/, '');
}

function nomeLocal(t) {
    return normalizarTipo(t).replace(/>$/, '').split(/[#:/]/).pop();
}

function ehNamespaceW3C(t) {
    const n = normalizarTipo(t);
    return /^(owl|rdf|rdfs|xsd):/.test(n) || n.includes('www.w3.org/');
}

/**
 * Retorna o motivo pelo qual a entidade deve ser descartada do índice, ou null se ela é conteúdo.
 * Aceita a lista completa de tipos (parser) ou só o tipo principal (JSON já gerado).
 */
export function classificarRuido(tipos, nome = '') {
    const lista = (Array.isArray(tipos) ? tipos : [tipos]).map(normalizarTipo).filter(Boolean);
    if (lista.length === 0) return 'sem-tipo';
    if (lista.some(t => ehNamespaceW3C(t) && TIPOS_ESQUEMA.has(nomeLocal(t)))) return 'esquema';
    if (lista.every(t => ehTipoVocabulario(nomeLocal(t)))) return 'vocabulario';
    if (NOMES_DE_CLASSE.has(String(nome).trim())) return 'esquema';
    return null;
}

/** Remove restos de sintaxe Turtle de um valor de país ("Peru;", "Latam, Ellas:Colombia, Ellas:Latin America,"). */
export function limparPais(valor) {
    if (!valor) return valor;
    const limpo = String(valor)
        .replace(/Ellas:/g, '')
        .replace(/;/g, ',')
        .replace(/\s*,\s*(,\s*)*/g, ', ')
        .replace(/^[\s,.]+|[\s,.]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return limpo.replace(/^[,;\s]+$/, '');
}

// ---------------------------------------------------------------------------
// Tokenizador e parser de instruções Turtle (subconjunto usado pelo export do GraphDB)
// ---------------------------------------------------------------------------

const PONTUACAO = new Set([',', ';', '.', '[', ']', '(', ')']);
const FIM_DE_NOME = new Set([' ', '\t', '\r', '\n', ',', ';', '(', ')', '[', ']', '"', '<']);

function desescaparLiteral(s) {
    return s
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
        .replace(/\\U([0-9a-fA-F]{8})/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
        .replace(/\\[nrt]/g, ' ')
        .replace(/\\(["'\\])/g, '$1');
}

/**
 * Tokenizador incremental: recebe linhas e emite tokens.
 * Mantém estado entre linhas para literais longos ("""...""").
 */
class TokenizadorTurtle {
    constructor(onToken) {
        this.onToken = onToken;
        this.literalLongo = null; // { aspas, buffer }
    }

    linha(texto) {
        let i = 0;
        const n = texto.length;

        if (this.literalLongo) {
            const fim = texto.indexOf(this.literalLongo.aspas);
            if (fim === -1) {
                this.literalLongo.buffer += '\n' + texto;
                return;
            }
            const valor = this.literalLongo.buffer + '\n' + texto.slice(0, fim);
            this.literalLongo = null;
            i = this.sufixoLiteral(texto, fim + 3, valor);
        }

        while (i < n) {
            const c = texto[i];

            if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
            if (c === '#') return; // comentário até o fim da linha

            if (c === '<') {
                const fim = texto.indexOf('>', i + 1);
                const j = fim === -1 ? n : fim + 1;
                this.onToken({ tipo: 'iri', valor: texto.slice(i, j) });
                i = j;
                continue;
            }

            if (c === '"' || c === "'") {
                const tripla = texto.substr(i, 3) === c.repeat(3);
                if (tripla) {
                    const aspas = c.repeat(3);
                    const fim = texto.indexOf(aspas, i + 3);
                    if (fim === -1) {
                        this.literalLongo = { aspas, buffer: texto.slice(i + 3) };
                        return;
                    }
                    i = this.sufixoLiteral(texto, fim + 3, texto.slice(i + 3, fim));
                    continue;
                }
                let j = i + 1;
                while (j < n && texto[j] !== c) {
                    if (texto[j] === '\\') j++;
                    j++;
                }
                i = this.sufixoLiteral(texto, j + 1, texto.slice(i + 1, j));
                continue;
            }

            if (PONTUACAO.has(c)) {
                this.onToken({ tipo: 'pontuacao', valor: c });
                i++;
                continue;
            }

            // Nome prefixado (Ellas:Foo), palavra-chave (a, @prefix), rótulo de nó vazio (_:b1) ou número
            let j = i;
            while (j < n && !FIM_DE_NOME.has(texto[j])) j++;
            let palavra = texto.slice(i, j);
            let terminaComPonto = false;
            if (palavra.length > 1 && palavra.endsWith('.')) {
                palavra = palavra.slice(0, -1);
                terminaComPonto = true;
            }
            this.onToken({ tipo: 'nome', valor: palavra });
            if (terminaComPonto) this.onToken({ tipo: 'pontuacao', valor: '.' });
            i = j;
        }
    }

    // Consome @lang ou ^^tipo após um literal e emite o token
    sufixoLiteral(texto, i, valorBruto) {
        const n = texto.length;
        if (texto[i] === '@') {
            let j = i + 1;
            while (j < n && /[A-Za-z0-9-]/.test(texto[j])) j++;
            i = j;
        } else if (texto.substr(i, 2) === '^^') {
            let j = i + 2;
            if (texto[j] === '<') {
                const fim = texto.indexOf('>', j);
                j = fim === -1 ? n : fim + 1;
            } else {
                while (j < n && !/[\s,;()[\]]/.test(texto[j])) j++;
                if (texto[j - 1] === '.') j--;
            }
            i = j;
        }
        this.onToken({ tipo: 'literal', valor: desescaparLiteral(valorBruto) });
        return i;
    }
}

/**
 * Parser de instruções: sujeito predicado objeto (, objeto)* (; predicado objeto ...)* .
 * Chama onTriple(sujeito, predicado, objeto) para cada tripla.
 */
class ParserTurtle {
    constructor(onTriple) {
        this.onTriple = onTriple;
        this.estado = 'sujeito';
        this.sujeito = null;
        this.predicado = null;
        this.profundidade = 0; // [ ... ] e ( ... ) são ignorados
        this.diretiva = false;
    }

    token(t) {
        if (this.diretiva) {
            if (t.tipo === 'pontuacao' && t.valor === '.') this.diretiva = false;
            return;
        }

        if (this.profundidade > 0) {
            if (t.tipo === 'pontuacao' && (t.valor === '[' || t.valor === '(')) this.profundidade++;
            else if (t.tipo === 'pontuacao' && (t.valor === ']' || t.valor === ')')) {
                this.profundidade--;
                if (this.profundidade === 0) this.estado = 'aposObjeto';
            }
            return;
        }

        const pont = t.tipo === 'pontuacao' ? t.valor : null;

        switch (this.estado) {
            case 'sujeito':
                if (t.tipo === 'nome' && (t.valor === '@prefix' || t.valor === '@base')) { this.diretiva = true; return; }
                if (t.tipo === 'nome' && /^(PREFIX|BASE)$/i.test(t.valor)) { this.diretiva = true; return; }
                if (pont === '.') return;
                if (pont) { this.recuperar(t); return; }
                this.sujeito = t.valor;
                this.estado = 'predicado';
                return;

            case 'predicado':
                if (pont === ';') return;          // ";" repetido é permitido
                if (pont === '.') { this.estado = 'sujeito'; return; }
                if (pont) { this.recuperar(t); return; }
                this.predicado = t.valor;
                this.estado = 'objeto';
                return;

            case 'objeto':
                if (pont === '[' || pont === '(') { this.profundidade = 1; return; }
                if (pont) { this.recuperar(t); return; }
                this.onTriple(this.sujeito, this.predicado, t);
                this.estado = 'aposObjeto';
                return;

            case 'aposObjeto':
                if (pont === ',') { this.estado = 'objeto'; return; }
                if (pont === ';') { this.estado = 'predicado'; return; }
                if (pont === '.') { this.estado = 'sujeito'; return; }
                this.recuperar(t);
                return;

            case 'recuperando':
                if (pont === '.') this.estado = 'sujeito';
                return;
        }
    }

    // Sintaxe inesperada: descarta tokens até o próximo "."
    recuperar() {
        this.erros = (this.erros || 0) + 1;
        this.estado = 'recuperando';
    }
}

// ---------------------------------------------------------------------------
// Extração das entidades ELLAS
// ---------------------------------------------------------------------------

const PREFIXO_ELLAS_IRI = '<https://ellas.ufmt.br/Ontology/Ellas#';

function normalizarPredicado(p) {
    if (p.startsWith(PREFIXO_ELLAS_IRI)) return 'Ellas:' + p.slice(PREFIXO_ELLAS_IRI.length, -1);
    if (p === '<http://www.w3.org/2000/01/rdf-schema#label>') return 'rdfs:label';
    if (p === '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>' || p === 'rdf:type') return 'a';
    return p;
}

function cleanString(str) {
    if (!str) return "";
    try {
        str = decodeURIComponent(str);
    } catch (e) { }
    return str
        .replace(/^Ellas:/, '')
        .replace(/^<https:\/\/ellas\.ufmt\.br\/Ontology\/Ellas#/, '')
        .replace(/>$/, '')
        .replace(/["']+/g, '')
        // Fallback para IRIs com escapes inválidos, em que decodeURIComponent falha
        .replace(/%20/g, ' ')
        .replace(/%3B/g, ';')
        .replace(/%2C/g, ',')
        .replace(/%28/g, '(')
        .replace(/%29/g, ')')
        .replace(/%2F/g, '/')
        .replace(/%3A/g, ':')
        .replace(/\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Valor de um objeto: texto do literal ou nome limpo do IRI
function valorObjeto(obj) {
    if (obj.tipo === 'literal') return obj.valor.replace(/\s+/g, ' ').trim();
    return cleanString(obj.valor);
}

export async function parseBackupEllasTTL({ entrada, saida } = {}) {
    const arquivoTTL = entrada || process.env.TTL_PATH || TTL_PADRAO;
    const arquivoSaida = saida || SAIDA_PADRAO;

    if (!fs.existsSync(arquivoTTL)) {
        throw new Error(`Arquivo TTL não encontrado: ${arquivoTTL}. Informe o caminho como argumento ou em TTL_PATH.`);
    }

    console.log(`⏳ Lendo ${arquivoTTL}...`);
    const inicio = Date.now();

    const entities = {};

    function getOrCreateEntity(uri) {
        if (!entities[uri]) {
            entities[uri] = {
                id: uri.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase(),
                uri: uri,
                nome: cleanString(uri),
                tipos: new Set(),
                paises: new Set(),
                cidades: new Set(),
                estados: new Set(),
                publicoAlvo: new Set(),
                financiadores: new Set(),
                apoiadores: new Set(),
                areas: new Set(),
                objetivos: [],
                detalhes: [],
                fontes: new Set()
            };
        }
        return entities[uri];
    }

    function onTriple(sujeito, predicadoBruto, obj) {
        if (!(sujeito.startsWith('Ellas:') || sujeito.startsWith(PREFIXO_ELLAS_IRI))) return;

        const ent = getOrCreateEntity(sujeito);
        const pred = normalizarPredicado(predicadoBruto);
        const val = valorObjeto(obj);

        if (pred === 'a') {
            if (obj.tipo !== 'literal') {
                const tipo = obj.valor.startsWith(PREFIXO_ELLAS_IRI) || obj.valor.startsWith('Ellas:') ? cleanString(obj.valor) : obj.valor;
                if (tipo) ent.tipos.add(tipo);
            }
        } else if (pred === 'rdfs:label') {
            if (val) ent.nome = val;
        } else if (pred === 'Ellas:created_in' || pred === 'Ellas:Country') {
            const pais = limparPais(val);
            if (pais && pais !== 'Country') ent.paises.add(pais);
        } else if (pred === 'Ellas:located_in' || pred === 'Ellas:hasCity') {
            if (val && val !== 'City') ent.cidades.add(val);
        } else if (pred === 'Ellas:hasState') {
            if (val && val !== 'State') ent.estados.add(val);
        } else if (pred === 'Ellas:focused_on' || pred === 'Ellas:target_audience') {
            if (val && !val.startsWith('Target_Audience')) ent.publicoAlvo.add(val);
        } else if (pred === 'Ellas:funded_by' || pred === 'Ellas:fundingOrganization_name') {
            if (val && val !== 'Funding_Organization') ent.financiadores.add(val);
        } else if (pred === 'Ellas:supported_by') {
            if (val) ent.apoiadores.add(val);
        } else if (pred === 'Ellas:hasArea' || pred === 'Ellas:hasSpecificArea') {
            if (val && val !== 'Area') ent.areas.add(val);
        } else if (pred === 'Ellas:initiative_objective' || pred === 'Ellas:policy_description' || pred === 'Ellas:article_research_objectives' || pred === 'Ellas:article_research_problem') {
            if (val && val.length > 5 && !ent.objetivos.includes(val)) ent.objetivos.push(val);
        } else if (pred === 'Ellas:from_source' || pred === 'Ellas:fromSource') {
            if (val && val !== 'Source') ent.fontes.add(val);
        } else if (pred.startsWith('Ellas:factors_') || pred.startsWith('Ellas:initiative_') || pred.startsWith('Ellas:indicator_')) {
            const prop = pred.replace(/^Ellas:/, '');
            if (val && val.length > 1) {
                const item = `${prop}: ${val}`;
                if (!ent.detalhes.includes(item)) ent.detalhes.push(item);
            }
        }
    }

    const parser = new ParserTurtle(onTriple);
    const tokenizador = new TokenizadorTurtle(t => parser.token(t));

    const rl = readline.createInterface({
        input: fs.createReadStream(arquivoTTL),
        crlfDelay: Infinity
    });

    let lineCount = 0;
    for await (const line of rl) {
        lineCount++;
        tokenizador.linha(line);
    }

    console.log(`✅ ${lineCount} linhas processadas em ${((Date.now() - inicio) / 1000).toFixed(2)}s (${parser.erros || 0} instruções com sintaxe inesperada ignoradas).`);

    // Descarta definições de esquema e nós de vocabulário sem conteúdo próprio
    const descartes = {};
    const entidadesFiltradas = Object.values(entities).filter(ent => {
        const motivo = classificarRuido(Array.from(ent.tipos), ent.nome);
        if (motivo) {
            descartes[motivo] = (descartes[motivo] || 0) + 1;
            return false;
        }
        return true;
    });
    console.log(`🧹 Entidades descartadas: ${JSON.stringify(descartes)}`);

    // IRIs que só diferem em maiúsculas (ex.: W-stem / W-STEM) geravam o mesmo id
    const idsUsados = new Map();
    const idUnico = (id) => {
        const n = (idsUsados.get(id) || 0) + 1;
        idsUsados.set(id, n);
        return n === 1 ? id : `${id}_${n}`;
    };

    const documentosFinais = entidadesFiltradas.map(ent => {
        const tipos = Array.from(ent.tipos);
        // Tipo principal: primeiro tipo do domínio ELLAS (ignora owl:NamedIndividual e afins)
        const tipoPrincipal = tipos.find(t => !ehNamespaceW3C(t)) || tipos[0] || 'Conhecimento';
        const pais = limparPais(Array.from(ent.paises).join(', ')) || 'América Latina';
        const cidadesStr = Array.from(ent.cidades).join(', ');
        const estadosStr = Array.from(ent.estados).join(', ');
        const publicoStr = Array.from(ent.publicoAlvo).join(', ');
        const financiadoresStr = Array.from(ent.financiadores).join(', ');
        const apoiadoresStr = Array.from(ent.apoiadores).join(', ');
        const areasStr = Array.from(ent.areas).join(', ');
        const fontesStr = Array.from(ent.fontes).join(', ');
        const objetivosStr = ent.objetivos.join('. ');
        const outrosDetalhesStr = ent.detalhes.join(' | ');

        // Constrói resumo textual semântico rico
        let partes = [];
        if (pais !== 'América Latina') partes.push(`País: ${pais}`);
        if (cidadesStr) partes.push(`Cidade: ${cidadesStr}`);
        if (estadosStr) partes.push(`Estado: ${estadosStr}`);
        if (tipoPrincipal) partes.push(`Tipo: ${tipoPrincipal}`);
        if (areasStr) partes.push(`Área STEM: ${areasStr}`);
        if (publicoStr) partes.push(`Público-Alvo: ${publicoStr}`);
        if (financiadoresStr) partes.push(`Financiamento: ${financiadoresStr}`);
        if (apoiadoresStr) partes.push(`Apoio/Parcerias: ${apoiadoresStr}`);
        if (objetivosStr) partes.push(`Objetivos/Foco: ${objetivosStr}`);
        if (outrosDetalhesStr) partes.push(`Detalhes Adicionais: ${outrosDetalhesStr}`);
        if (fontesStr) partes.push(`Fontes Mapeadas: ${fontesStr}`);

        const descricaoCompleta = partes.length > 0 ? partes.join('. ') : `Iniciativa ou conceito mapeado no Projeto ELLAS (UFMT).`;

        // Texto completo para geração do Embedding
        const textoVetor = `Nome: ${ent.nome}. Categoria: ${tipoPrincipal}. País: ${pais}. ${descricaoCompleta}`;

        return {
            id: idUnico(ent.id),
            nome: ent.nome,
            pais: pais,
            tipo: tipoPrincipal,
            categoria: tipoPrincipal,
            cidades: cidadesStr || null,
            estados: estadosStr || null,
            publicoAlvo: publicoStr || null,
            financiamento: financiadoresStr || null,
            apoio: apoiadoresStr || null,
            areas: areasStr || null,
            objetivos: objetivosStr || null,
            detalhes: descricaoCompleta,
            texto: textoVetor
        };
    });

    console.log(`📊 Total de documentos extraídos: ${documentosFinais.length}`);
    fs.writeFileSync(arquivoSaida, JSON.stringify(documentosFinais, null, 2), 'utf-8');
    console.log(`💾 Base salva em: ${arquivoSaida}`);

    return documentosFinais;
}

// Execução direta via CLI: node ttl_parser.js [entrada.ttl] [saida.json]
if (process.argv[1] && process.argv[1].endsWith('ttl_parser.js')) {
    const [entrada, saida] = process.argv.slice(2);
    parseBackupEllasTTL({ entrada, saida }).catch(err => {
        console.error(`❌ ${err.message}`);
        process.exit(1);
    });
}
