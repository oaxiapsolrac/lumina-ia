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
        let idioma = null;
        if (texto[i] === '@') {
            let j = i + 1;
            while (j < n && /[A-Za-z0-9-]/.test(texto[j])) j++;
            idioma = texto.slice(i + 1, j).toLowerCase();
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
        this.onToken({ tipo: 'literal', valor: desescaparLiteral(valorBruto), idioma });
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

// ---------------------------------------------------------------------------
// Apresentação legível dos campos da ontologia
// ---------------------------------------------------------------------------

// Rótulos em português para as propriedades técnicas (antes iam cruas, como "indicator_value: 72.0")
const ROTULOS_CAMPOS = {
    factors_context_type: 'Contexto',
    factors_impact: 'Impacto',
    factors_impact_type: 'Tipo de impacto',
    factors_impact_description: 'Descrição do impacto',
    factors_contextual_factor_detail: 'Detalhe do fator',
    initiative_reach: 'Alcance',
    initiative_status: 'Situação',
    initiative_format: 'Formato',
    initiative_coordinator_type: 'Tipo de coordenação',
    initiative_coordinator_gender: 'Gênero da coordenação',
    initiative_organization_sector: 'Setor',
    initiative_community_name: 'Comunidade',
    initiative_number_of_participants: 'Participantes',
    initiative_data_source: 'Onde a informação foi encontrada',
    initiative_website: 'Site',
    initiative_socialmedia_link: 'Rede social',
    initiative_other_links: 'Outros links'
};
// Campos que não acrescentam nada ao texto (repetem o nome) ou são tratados à parte
const CAMPOS_IGNORADOS = new Set(['initiative_name']);
const CAMPOS_INDICADOR = new Set([
    'indicator_value', 'indicator_unit', 'indicator_complementary_information', 'indicator_population',
    'indicator_total_population', 'indicator_gender_variable', 'indicator_technology_variable', 'indicator_leadership_variable'
]);

const ehVerdadeiro = (v) => /^(true|verdadeiro|verdadero|sim|s[ií]|yes)$/i.test(String(v || '').trim());

function formatarNumero(v) {
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n)) return String(v).trim();
    return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

function formatarValorIndicador(valor, unidade) {
    const numero = formatarNumero(valor);
    const u = String(unidade || '').trim();
    if (!u) return numero;
    if (u === '%') return `${numero}%`;
    if (u === '$') return `US$ ${numero}`;
    const traducoes = { people: 'pessoas', women: 'mulheres', 'indigenous women': 'mulheres indígenas' };
    return `${numero} ${traducoes[u.toLowerCase()] || u}`;
}

// --- Países ---

// Variações encontradas na base → nome em português
const PAISES_CANONICOS = {
    brasil: 'Brasil', brazil: 'Brasil', peru: 'Peru', bolivia: 'Bolívia', mexico: 'México', chile: 'Chile',
    colombia: 'Colômbia', argentina: 'Argentina', ecuador: 'Equador', equador: 'Equador', uruguai: 'Uruguai',
    uruguay: 'Uruguai', paraguai: 'Paraguai', paraguay: 'Paraguai', 'costa rica': 'Costa Rica', venezuela: 'Venezuela',
    cuba: 'Cuba', guatemala: 'Guatemala', panama: 'Panamá', 'el salvador': 'El Salvador', honduras: 'Honduras',
    nicaragua: 'Nicarágua', latam: 'América Latina', 'latin america': 'América Latina', 'america latina': 'América Latina'
};
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function canonizarPaises(lista) {
    const saida = [];
    for (const item of lista) {
        // Separa listas como "Brazil, argentina and mexico" ou "México y Perú"
        for (const parte of String(item).split(/,|\s+(?:and|e|y)\s+/i)) {
            const p = parte.trim();
            if (!p) continue;
            const canon = PAISES_CANONICOS[semAcento(p)] || p;
            if (!saida.includes(canon)) saida.push(canon);
        }
    }
    // "América Latina" só faz sentido sozinha; com países específicos, sobra
    const especificos = saida.filter((p) => p !== 'América Latina');
    return especificos.length ? especificos : saida;
}

// País citado no nome (ex.: "Mulheres negras no setor de TIC no Brasil"), usado só quando a base não informa o país
const PAISES_NO_NOME = [
    [/\bbra[sz]il|\bbrasileir/, 'Brasil'], [/\bperu\b|\bperuan/, 'Peru'], [/\bbolivi/, 'Bolívia'], [/\bmexic/, 'México'],
    [/\bchile\b|\bchilen/, 'Chile'], [/\bcolombi/, 'Colômbia'], [/\bargentin/, 'Argentina'], [/\bequador\b|\becuador/, 'Equador'],
    [/\burugua/, 'Uruguai'], [/\bparagua/, 'Paraguai'], [/\bcosta rica/, 'Costa Rica'], [/\bvenezuel/, 'Venezuela']
];
function paisesCitadosNoNome(nome) {
    const n = semAcento(nome);
    return PAISES_NO_NOME.filter(([re]) => re.test(n)).map(([, pais]) => pais);
}

/** Chave canônica de uma entidade: o nome local do IRI, sem depender da forma (Ellas:X ou <...#X>). */
function chaveEntidade(token) {
    let local = token;
    if (token.startsWith('Ellas:')) local = token.slice(6);
    else if (token.startsWith(PREFIXO_ELLAS_IRI)) local = token.slice(PREFIXO_ELLAS_IRI.length, -1);
    try {
        return decodeURIComponent(local);
    } catch {
        return local;
    }
}

const PREFERENCIA_IDIOMA = ['pt', 'es', 'en'];

// Dimensões afetadas (Ellas:affects) aparecem nas três línguas; unifica em português
const DIMENSOES = {
    professional: 'Profissional', profissional: 'Profissional', profesional: 'Profissional',
    sociocultural: 'Sociocultural', 'socio-cultural': 'Sociocultural',
    socioeconomic: 'Socioeconômico', 'socio-economico': 'Socioeconômico', socioeconomico: 'Socioeconômico',
    sociopolitical: 'Sociopolítico', 'socio-politico': 'Sociopolítico', sociopolitico: 'Sociopolítico',
    educational: 'Educacional', educacional: 'Educacional', educativo: 'Educacional',
    individual: 'Individual',
    interpessoal: 'Interpessoal', interpersonal: 'Interpessoal', interpersonales: 'Interpessoal',
    familia: 'Família', family: 'Família'
};
const canonizarDimensoes = (valores) => [...new Set(valores.map((v) => DIMENSOES[semAcento(v)] || v))];
const listar = (itens, max = 8) => {
    const lista = [...new Set(itens)];
    return lista.length > max ? `${lista.slice(0, max).join('; ')} e mais ${lista.length - max}` : lista.join('; ');
};

export async function parseBackupEllasTTL({ entrada, saida } = {}) {
    const arquivoTTL = entrada || process.env.TTL_PATH || TTL_PADRAO;
    const arquivoSaida = saida || SAIDA_PADRAO;

    if (!fs.existsSync(arquivoTTL)) {
        throw new Error(`Arquivo TTL não encontrado: ${arquivoTTL}. Informe o caminho como argumento ou em TTL_PATH.`);
    }

    console.log(`⏳ Lendo ${arquivoTTL}...`);
    const inicio = Date.now();

    const entities = new Map(); // chave canônica → entidade

    function getOrCreateEntity(token) {
        const chave = chaveEntidade(token);
        if (!entities.has(chave)) {
            entities.set(chave, {
                chave,
                id: token.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase(),
                nome: cleanString(token),
                rotulos: {},               // idioma → rótulo
                idiomasVistos: {},         // idioma → nº de literais nesse idioma
                tipos: new Set(),
                paises: new Set(),         // created_in / Country
                paisesAnalisados: new Set(), // analyzed_in (fatores, indicadores, artigos)
                cidades: new Set(),
                estados: new Set(),
                publicoAlvo: new Set(),
                financiadores: new Set(),
                apoiadores: new Set(),
                areas: new Set(),
                afeta: new Set(),
                objetivos: [],
                campos: new Map(),         // propriedade técnica → valores
                fontes: new Set(),
                relFontes: new Set(),      // chaves das entidades citadas como fonte
                relFinanciadores: new Set(),
                relApoiadores: new Set()
            });
        }
        return entities.get(chave);
    }

    function onTriple(sujeito, predicadoBruto, obj) {
        if (!(sujeito.startsWith('Ellas:') || sujeito.startsWith(PREFIXO_ELLAS_IRI))) return;

        const ent = getOrCreateEntity(sujeito);
        const pred = normalizarPredicado(predicadoBruto);
        const val = valorObjeto(obj);
        const ehIriEllas = obj.tipo !== 'literal' && (obj.valor.startsWith('Ellas:') || obj.valor.startsWith(PREFIXO_ELLAS_IRI));
        // Idioma dos textos da entidade: usado quando ela não tem rdfs:label com idioma
        if (obj.tipo === 'literal' && obj.idioma) ent.idiomasVistos[obj.idioma] = (ent.idiomasVistos[obj.idioma] || 0) + 1;

        if (pred === 'a') {
            if (obj.tipo !== 'literal') {
                const tipo = ehIriEllas ? cleanString(obj.valor) : obj.valor;
                if (tipo) ent.tipos.add(tipo);
            }
        } else if (pred === 'rdfs:label') {
            if (val) {
                ent.nome = val;
                ent.rotulos[obj.idioma || 'sem'] = val;
            }
        } else if (pred === 'Ellas:created_in' || pred === 'Ellas:Country') {
            const pais = limparPais(val);
            if (pais && pais !== 'Country') ent.paises.add(pais);
        } else if (pred === 'Ellas:analyzed_in') {
            const pais = limparPais(val);
            if (pais) ent.paisesAnalisados.add(pais);
        } else if (pred === 'Ellas:located_in' || pred === 'Ellas:hasCity') {
            if (val && val !== 'City') ent.cidades.add(val);
        } else if (pred === 'Ellas:hasState') {
            if (val && val !== 'State') ent.estados.add(val);
        } else if (pred === 'Ellas:focused_on' || pred === 'Ellas:target_audience') {
            if (val && !val.startsWith('Target_Audience')) ent.publicoAlvo.add(val);
        } else if (pred === 'Ellas:funded_by' || pred === 'Ellas:fundingOrganization_name') {
            if (val && val !== 'Funding_Organization') ent.financiadores.add(val);
            if (ehIriEllas) ent.relFinanciadores.add(chaveEntidade(obj.valor));
        } else if (pred === 'Ellas:supported_by') {
            if (val) ent.apoiadores.add(val);
            if (ehIriEllas) ent.relApoiadores.add(chaveEntidade(obj.valor));
        } else if (pred === 'Ellas:hasArea' || pred === 'Ellas:hasSpecificArea') {
            if (val && val !== 'Area') ent.areas.add(val);
        } else if (pred === 'Ellas:affects') {
            if (val) ent.afeta.add(val);
        } else if (pred === 'Ellas:initiative_objective' || pred === 'Ellas:policy_description' || pred === 'Ellas:article_research_objectives' || pred === 'Ellas:article_research_problem') {
            if (val && val.length > 5 && !ent.objetivos.includes(val)) ent.objetivos.push(val);
        } else if (pred === 'Ellas:from_source' || pred === 'Ellas:fromSource') {
            if (val && val !== 'Source') ent.fontes.add(val);
            if (ehIriEllas) ent.relFontes.add(chaveEntidade(obj.valor));
        } else if (pred.startsWith('Ellas:factors_') || pred.startsWith('Ellas:initiative_') || pred.startsWith('Ellas:indicator_')) {
            const prop = pred.replace(/^Ellas:/, '');
            // Sem corte por tamanho: a unidade "%" tem um caractere e era descartada
            if (val && !CAMPOS_IGNORADOS.has(prop)) {
                if (!ent.campos.has(prop)) ent.campos.set(prop, []);
                const lista = ent.campos.get(prop);
                if (!lista.includes(val)) lista.push(val);
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

    // Nome de exibição: prefere o rótulo em português, depois espanhol e inglês
    for (const ent of entities.values()) {
        // Alguns registros repetem o texto em inglês marcado como @pt; nesse caso vale o inglês
        if (ent.rotulos.pt && ent.rotulos.pt === ent.rotulos.en) delete ent.rotulos.pt;
        if (ent.rotulos.es && ent.rotulos.es === ent.rotulos.en) delete ent.rotulos.es;
        const idioma = PREFERENCIA_IDIOMA.find((i) => ent.rotulos[i]);
        if (idioma) {
            ent.nome = ent.rotulos[idioma];
            ent.idioma = idioma;
        } else {
            // Sem rótulo com idioma: usa o idioma mais frequente dos demais textos da entidade
            const [maisVisto] = Object.entries(ent.idiomasVistos).sort((a, b) => b[1] - a[1])[0] || [];
            ent.idioma = PREFERENCIA_IDIOMA.includes(maisVisto) ? maisVisto : undefined;
        }
        ent.tipoPrincipal = Array.from(ent.tipos).find((t) => !ehNamespaceW3C(t)) || Array.from(ent.tipos)[0] || 'Conhecimento';
    }

    // Descarta definições de esquema e nós de vocabulário sem conteúdo próprio
    const descartes = {};
    const entidadesFiltradas = Array.from(entities.values()).filter(ent => {
        const motivo = classificarRuido(Array.from(ent.tipos), ent.nome);
        if (motivo) {
            descartes[motivo] = (descartes[motivo] || 0) + 1;
            return false;
        }
        return true;
    });
    console.log(`🧹 Entidades descartadas: ${JSON.stringify(descartes)}`);

    // --- Une o mesmo indicador cadastrado em português, espanhol e inglês ---
    // As traduções são entidades separadas, sem ligação explícita. Mesmo valor, unidade, país, fonte,
    // população e números da observação identificam o mesmo indicador. Só une se cada idioma aparecer uma vez.
    const primeiro = (ent, prop) => (ent.campos.get(prop) || [])[0] || '';
    const numerosDe = (texto) => (String(texto).match(/\d+(?:[.,]\d+)?/g) || []).map((x) => Number(x.replace(',', '.'))).sort((a, b) => a - b).join(',');
    const grupos = new Map();
    for (const ent of entidadesFiltradas) {
        if (ent.tipoPrincipal !== 'Indicator' || !primeiro(ent, 'indicator_value')) continue;
        const chave = [
            Number(primeiro(ent, 'indicator_value')),
            semAcento(primeiro(ent, 'indicator_unit')),
            canonizarPaises([...ent.paises, ...ent.paisesAnalisados]).sort().join('+'),
            Array.from(ent.relFontes).sort().join('+'),
            primeiro(ent, 'indicator_population'),
            primeiro(ent, 'indicator_total_population'),
            numerosDe(primeiro(ent, 'indicator_complementary_information'))
        ].join('|');
        if (!grupos.has(chave)) grupos.set(chave, []);
        grupos.get(chave).push(ent);
    }
    const representante = new Map(); // chave da entidade → entidade que a representa
    let unidos = 0;
    for (const membros of grupos.values()) {
        if (membros.length < 2) continue;
        const idiomas = membros.map((m) => m.idioma || 'sem');
        if (new Set(idiomas).size !== membros.length) continue; // dois do mesmo idioma: ambíguo, mantém separados
        const rep = PREFERENCIA_IDIOMA.map((i) => membros.find((m) => m.idioma === i)).find(Boolean) || membros[0];
        rep.outrosNomes = membros.filter((m) => m !== rep).map((m) => m.nome);
        for (const m of membros) {
            representante.set(m.chave, rep);
            if (m === rep) continue;
            m.fundido = true;
            unidos++;
            for (const campo of ['paises', 'paisesAnalisados', 'fontes', 'relFontes', 'afeta']) m[campo].forEach((v) => rep[campo].add(v));
            for (const [prop, vals] of m.campos) if (!rep.campos.has(prop)) rep.campos.set(prop, vals);
        }
        rep.idiomasUnidos = idiomas;
    }

    // Segunda passada: a versão em espanhol costuma citar as fontes traduzidas, cadastradas como outras
    // entidades ("Inspirar" para Insper, "Líderes del centro" para hub leaders), e escapa da chave acima.
    // Aqui as fontes não precisam ser idênticas: basta uma com o mesmo nome, desde que dimensões e recortes
    // também coincidam e nenhum idioma se repita no grupo (dois em espanhol com o mesmo valor ficam separados).
    const recortesDe = (ent) => ['indicator_gender_variable', 'indicator_technology_variable', 'indicator_leadership_variable']
        .filter((p) => (ent.campos.get(p) || []).some(ehVerdadeiro)).join('+');
    const nomesFontes = (ent) => new Set(Array.from(ent.fontes).map((f) => semAcento(f).trim()));
    const gruposSemFonte = new Map();
    for (const ent of entidadesFiltradas) {
        if (ent.fundido || ent.tipoPrincipal !== 'Indicator' || !primeiro(ent, 'indicator_value') || ent.fontes.size === 0) continue;
        const chave = [
            Number(primeiro(ent, 'indicator_value')),
            semAcento(primeiro(ent, 'indicator_unit')),
            canonizarPaises([...ent.paises, ...ent.paisesAnalisados]).sort().join('+'),
            primeiro(ent, 'indicator_population'),
            primeiro(ent, 'indicator_total_population'),
            numerosDe(primeiro(ent, 'indicator_complementary_information')),
            canonizarDimensoes(Array.from(ent.afeta)).sort().join('+'),
            recortesDe(ent)
        ].join('|');
        if (!gruposSemFonte.has(chave)) gruposSemFonte.set(chave, []);
        gruposSemFonte.get(chave).push(ent);
    }
    let unidosPorFonteTraduzida = 0;
    for (const membros of gruposSemFonte.values()) {
        if (membros.length < 2) continue;
        const idiomas = membros.flatMap((m) => m.idiomasUnidos || [m.idioma || 'sem']);
        if (idiomas.includes('sem') || new Set(idiomas).size !== idiomas.length) continue;
        const rep = PREFERENCIA_IDIOMA.map((i) => membros.find((m) => m.idioma === i)).find(Boolean);
        const fontesRep = nomesFontes(rep);
        const outros = membros.filter((m) => m !== rep);
        if (!outros.every((m) => Array.from(nomesFontes(m)).some((f) => fontesRep.has(f)))) continue;
        rep.outrosNomes = [...(rep.outrosNomes || []), ...outros.flatMap((m) => [m.nome, ...(m.outrosNomes || [])])];
        rep.idiomasUnidos = idiomas;
        for (const m of outros) {
            // As fontes do outro registro são as mesmas, só traduzidas: fica a lista do representante
            for (const [chave, r] of representante) if (r === m) representante.set(chave, rep);
            representante.set(m.chave, rep);
            m.fundido = true;
            unidosPorFonteTraduzida++;
        }
    }
    unidos += unidosPorFonteTraduzida;
    console.log(`🌐 ${unidos} indicadores repetidos em outro idioma unidos ao registro em português/espanhol (${unidosPorFonteTraduzida} com fontes traduzidas).`);
    const nomeDe = (chave) => {
        const e = representante.get(chave) || entities.get(chave);
        return e ? e.nome : null;
    };

    // --- Relações inversas: quem usa esta fonte, quem esta organização financia ou apoia ---
    const usadoComoFonte = new Map();
    const financia = new Map();
    const apoia = new Map();
    const registrar = (mapa, alvo, nome) => {
        if (!mapa.has(alvo)) mapa.set(alvo, []);
        if (!mapa.get(alvo).includes(nome)) mapa.get(alvo).push(nome);
    };
    for (const ent of entidadesFiltradas) {
        if (ent.fundido) continue;
        for (const alvo of ent.relFontes) registrar(usadoComoFonte, (representante.get(alvo) || entities.get(alvo) || { chave: alvo }).chave, ent.nome);
        for (const alvo of ent.relFinanciadores) registrar(financia, alvo, ent.nome);
        for (const alvo of ent.relApoiadores) registrar(apoia, alvo, ent.nome);
    }

    // IRIs que só diferem em maiúsculas (ex.: W-stem / W-STEM) geravam o mesmo id
    const idsUsados = new Map();
    const idUnico = (id) => {
        const n = (idsUsados.get(id) || 0) + 1;
        idsUsados.set(id, n);
        return n === 1 ? id : `${id}_${n}`;
    };

    let paisPeloNome = 0;
    let paisPorAnalise = 0;
    const documentosFinais = entidadesFiltradas.filter((ent) => !ent.fundido).map(ent => {
        const tipoPrincipal = ent.tipoPrincipal;

        // País: created_in; senão, onde foi analisado (analyzed_in); senão, o país citado no nome
        let paises = canonizarPaises(Array.from(ent.paises));
        if (paises.length === 0 && ent.paisesAnalisados.size > 0) {
            paises = canonizarPaises(Array.from(ent.paisesAnalisados));
            paisPorAnalise++;
        }
        if (paises.length === 0) {
            paises = paisesCitadosNoNome(ent.nome);
            if (paises.length) paisPeloNome++;
        }
        const pais = paises.join(', ') || 'América Latina';

        const cidadesStr = Array.from(ent.cidades).join(', ');
        const estadosStr = Array.from(ent.estados).join(', ');
        const publicoStr = Array.from(ent.publicoAlvo).join(', ');
        const financiadoresStr = Array.from(ent.financiadores).join(', ');
        const apoiadoresStr = Array.from(ent.apoiadores).join(', ');
        const areasStr = Array.from(ent.areas).join(', ');
        const fontesStr = Array.from(ent.fontes).join(', ');
        const objetivosStr = ent.objetivos.map((o) => o.replace(/[.\s]+$/, '')).join('. ');

        // País e tipo já vão no cabeçalho do texto indexado e em campos próprios (pais, categoria);
        // repeti-los aqui duplicava "País: X. País: X." no texto e no contexto enviado ao modelo
        const partes = [];
        if (cidadesStr) partes.push(`Cidade: ${cidadesStr}`);
        if (estadosStr) partes.push(`Estado: ${estadosStr}`);

        // Indicadores: valor com unidade, observação, população e recortes em texto corrido
        if (tipoPrincipal === 'Indicator') {
            const valor = primeiro(ent, 'indicator_value');
            if (valor) partes.push(`Valor do indicador: ${formatarValorIndicador(valor, primeiro(ent, 'indicator_unit'))}`);
            const obs = primeiro(ent, 'indicator_complementary_information');
            if (obs) partes.push(`Observação do estudo: ${obs.replace(/\.$/, '')}`);
            const pop = primeiro(ent, 'indicator_population');
            const popTotal = primeiro(ent, 'indicator_total_population');
            if (pop || popTotal) partes.push(`População do indicador: ${pop ? formatarNumero(pop) : '—'}; população total: ${popTotal ? formatarNumero(popTotal) : '—'}`);
            const recortes = [
                ['indicator_gender_variable', 'gênero'],
                ['indicator_technology_variable', 'tecnologia'],
                ['indicator_leadership_variable', 'liderança']
            ].filter(([prop]) => (ent.campos.get(prop) || []).some(ehVerdadeiro)).map(([, r]) => r);
            if (recortes.length) partes.push(`Recortes do indicador: ${recortes.join(', ')}`);
        }

        if (areasStr) partes.push(`Área STEM: ${areasStr}`);
        if (publicoStr) partes.push(`Público-alvo: ${publicoStr}`);
        if (ent.afeta.size) partes.push(`Dimensão afetada: ${canonizarDimensoes(Array.from(ent.afeta)).join(', ')}`);
        if (financiadoresStr) partes.push(`Financiamento: ${financiadoresStr}`);
        if (apoiadoresStr) partes.push(`Apoio/Parcerias: ${apoiadoresStr}`);
        if (objetivosStr) partes.push(`Objetivos/Foco: ${objetivosStr.replace(/\.+$/, '')}`);

        // Demais campos técnicos com rótulo em português
        for (const [prop, valores] of ent.campos) {
            if (CAMPOS_INDICADOR.has(prop)) continue;
            const rotulo = ROTULOS_CAMPOS[prop] || prop.replace(/^(factors|initiative|indicator)_/, '').replace(/_/g, ' ');
            partes.push(`${rotulo}: ${valores.join('; ').replace(/\.+$/, '')}`);
        }

        if (fontesStr) partes.push(`Fonte: ${fontesStr}`);

        // Relações inversas vindas de outras entidades da ontologia
        const financiadas = financia.get(ent.chave);
        if (financiadas?.length) partes.push(`Financia: ${listar(financiadas)}`);
        const apoiadas = apoia.get(ent.chave);
        if (apoiadas?.length) partes.push(`Apoia: ${listar(apoiadas)}`);
        const usos = usadoComoFonte.get(ent.chave);
        if (usos?.length) partes.push(`É fonte de: ${listar(usos)}`);

        // Remove pontos finais dos valores para não gerar ".." ao juntar as partes
        const descricaoCompleta = partes.length > 0
            ? partes.map((p) => p.replace(/[.\s]+$/, '')).join('. ')
            : `Registro do tipo ${tipoPrincipal} na base do Projeto ELLAS (UFMT), sem outros detalhes cadastrados.`;
        const outrosNomes = ent.outrosNomes || [];

        // Texto completo para geração do Embedding (inclui os nomes em outros idiomas para a busca)
        const textoVetor = `Nome: ${ent.nome.replace(/[.\s]+$/, '')}. Categoria: ${tipoPrincipal}. País: ${pais}. ${descricaoCompleta}${outrosNomes.length ? `. Outros nomes: ${outrosNomes.join('; ')}` : ''}`;

        return {
            id: idUnico(ent.id),
            nome: ent.nome,
            outrosNomes: outrosNomes.length ? outrosNomes : undefined,
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

    console.log(`🗺️ País preenchido por "analisado em" em ${paisPorAnalise} documentos e pelo nome em ${paisPeloNome}.`);
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
