// backend/extrair_inep.js
// Gera base_inep_extraida.json a partir do repositório ELLAS-INEP-V1 (GraphDB), somente leitura.
//
// Por que a consulta antiga estava errada:
//  - Cada curso guarda vários valores anuais em enrolled_female/enrolled_male, mas sem o ano associado.
//    Somar todos os valores dava o acumulado de vários anos (ex.: 31 milhões de matrículas em
//    Engenharia Mecânica, mais que os 9,9 milhões de alunos do ensino superior brasileiro em 2023).
//  - Cada curso tem dois rdfs:label (com e sem acento); agrupar pelo label contava o mesmo curso duas vezes.
//
// O que esta versão faz:
//  - Agrupa pela classificação CINE do curso (course_ISCED_label), sem duplicar por label.
//  - Usa a MÉDIA dos valores anuais de cada curso (um "ano típico") e soma entre os cursos/campi.
//  - Deixa claro no texto que são estimativas, já que a base não identifica o ano de cada registro.
//
// Uso: node extrair_inep.js   (lê ELLAS_AUTH_BASE64 e, opcionalmente, ELLAS_INEP_ENDPOINT do .env)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const ENDPOINT = process.env.ELLAS_INEP_ENDPOINT || 'https://app.ellas.ufmt.br/repositories/ELLAS-INEP-V1';
const SAIDA = path.join(__dirname, 'base_inep_extraida.json');
const LOTE = 8; // rótulos CINE por consulta (consultas grandes estouram o tempo do gateway)

function cabecalhoAuth() {
    const b64 = (process.env.ELLAS_AUTH_BASE64 || '').replace(/^Basic\s+/i, '').trim();
    if (!b64) throw new Error('Defina ELLAS_AUTH_BASE64 no .env para acessar o GraphDB do ELLAS.');
    return `Basic ${b64}`;
}

async function sparql(consulta, tentativas = 3) {
    for (let i = 1; ; i++) {
        try {
            const res = await fetch(ENDPOINT, {
                method: 'POST',
                headers: { Authorization: cabecalhoAuth(), 'Content-Type': 'application/sparql-query', Accept: 'application/sparql-results+json' },
                body: consulta,
                signal: AbortSignal.timeout(180000)
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            return json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
        } catch (e) {
            if (i >= tentativas) throw e;
            console.warn(`⚠️ ${e.message}; tentando de novo (${i}/${tentativas - 1})...`);
            await new Promise((r) => setTimeout(r, 3000 * i));
        }
    }
}

const PREFIXOS = `PREFIX Ellas: <https://ellas.ufmt.br/Ontology/Ellas/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>`;

const literal = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Para cada rótulo CINE: nº de cursos e soma das médias anuais de mulheres e homens na métrica pedida. */
async function agregar(rotulos, metrica) {
    const filtro = `FILTER(?isced IN (${rotulos.map(literal).join(', ')}))`;
    const linhas = await sparql(`${PREFIXOS}
SELECT ?isced (COUNT(?c) AS ?cursos) (SUM(?f) AS ?fem) (SUM(?m) AS ?masc) WHERE {
  { SELECT ?c ?isced (AVG(xsd:float(?fv)) AS ?f) WHERE { ?c Ellas:course_ISCED_label ?isced ; Ellas:${metrica}_female ?fv . ${filtro} } GROUP BY ?c ?isced }
  { SELECT ?c (AVG(xsd:float(?mv)) AS ?m) WHERE { ?c Ellas:course_ISCED_label ?isced ; Ellas:${metrica}_male ?mv . ${filtro} } GROUP BY ?c }
} GROUP BY ?isced`);
    return new Map(linhas.map((l) => [l.isced, { cursos: Number(l.cursos), fem: Number(l.fem), masc: Number(l.masc) }]));
}

// A base guarda os rótulos CINE sem acento; restaura os acentos das palavras mais comuns para exibição
const ACENTOS = {
    informacao: 'Informação', gestao: 'Gestão', tecnologia: 'Tecnologia', eletrica: 'Elétrica', mecanica: 'Mecânica', ciencia: 'Ciência',
    ciencias: 'Ciências', computacao: 'Computação', quimica: 'Química', matematica: 'Matemática', fisica: 'Física', automacao: 'Automação',
    estatistica: 'Estatística', comunicacao: 'Comunicação', seguranca: 'Segurança', cibernetica: 'Cibernética', mecatronica: 'Mecatrônica',
    renovaveis: 'Renováveis', biomedica: 'Biomédica', manutencao: 'Manutenção', inteligencia: 'Inteligência', eletrica_: 'Elétrica',
    eletronica: 'Eletrônica', residuos: 'Resíduos', biociencias: 'Biociências', saude: 'Saúde', fabricacao: 'Fabricação', telecomunicacoes: 'Telecomunicações',
    eletrotecnica: 'Eletrotécnica', metalurgica: 'Metalúrgica', metalurgicos: 'Metalúrgicos', biomedicos: 'Biomédicos', atuariais: 'Atuariais',
    precisao: 'Precisão', aeronautica: 'Aeronáutica', aeronaves: 'Aeronaves', medica: 'Médica', construcao: 'Construção', automotiva: 'Automotiva',
    biocombustiveis: 'Biocombustíveis', refrigeracao: 'Refrigeração', climatizacao: 'Climatização', criacao: 'Criação', telematica: 'Telemática',
    bioquimica: 'Bioquímica', ferroviaria: 'Ferroviária', metroviaria: 'Metroviária', bioenergetica: 'Bioenergética', navegacao: 'Navegação',
    acustica: 'Acústica', geofisica: 'Geofísica', oceanografia: 'Oceanografia', energias: 'Energias', saneamento: 'Saneamento',
    interdisciplinares: 'Interdisciplinares', sanitaria: 'Sanitária', tecnologica: 'Tecnológica', tic: 'TIC', dcn: 'DCN'
};
const acentuar = (rotulo) => rotulo.replace(/[\p{L}_]+/gu, (p) => ACENTOS[p.toLowerCase()] ?? p);

const pct = (a, total) => (total > 0 ? ((a / total) * 100).toFixed(1).replace('.', ',') : '0');
const num = (n) => Math.round(n).toLocaleString('pt-BR');
const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function extrairCursos() {
    const rotulos = (await sparql(`${PREFIXOS}
SELECT ?isced (COUNT(DISTINCT ?c) AS ?n) WHERE { ?c Ellas:course_ISCED_label ?isced } GROUP BY ?isced ORDER BY DESC(?n)`)).map((l) => l.isced);
    console.log(`📚 ${rotulos.length} cursos na classificação CINE.`);

    const dados = { enrolled: new Map(), fresher: new Map(), completed: new Map() };
    for (let i = 0; i < rotulos.length; i += LOTE) {
        const lote = rotulos.slice(i, i + LOTE);
        for (const metrica of Object.keys(dados)) {
            for (const [k, v] of await agregar(lote, metrica)) dados[metrica].set(k, v);
        }
        console.log(`⏳ ${Math.min(i + LOTE, rotulos.length)}/${rotulos.length} cursos agregados`);
    }

    const docs = [];
    for (const rotulo of rotulos) {
        const m = dados.enrolled.get(rotulo);
        if (!m) continue;
        const total = m.fem + m.masc;
        if (total < 1) continue;
        const nome = acentuar(rotulo);
        const partes = [
            `Censo da Educação Superior (INEP/MEC), base ELLAS-INEP. Curso (classificação CINE): ${nome}.`,
            `Em um ano típico, somando ${num(m.cursos)} ${m.cursos === 1 ? 'curso/campus' : 'cursos/campi'}: cerca de ${num(total)} matrículas, sendo ${num(m.fem)} de mulheres (${pct(m.fem, total)}%) e ${num(m.masc)} de homens (${pct(m.masc, total)}%).`
        ];
        const ing = dados.fresher.get(rotulo);
        if (ing && ing.fem + ing.masc > 0) partes.push(`Ingressantes: ${pct(ing.fem, ing.fem + ing.masc)}% mulheres (cerca de ${num(ing.fem)} de ${num(ing.fem + ing.masc)}).`);
        const con = dados.completed.get(rotulo);
        if (con && con.fem + con.masc > 0) partes.push(`Concluintes: ${pct(con.fem, con.fem + con.masc)}% mulheres (cerca de ${num(con.fem)} de ${num(con.fem + con.masc)}).`);
        partes.push('Valores estimados pela média dos anos disponíveis em cada curso; a base não identifica o ano de cada registro.');
        const detalhes = partes.join(' ');

        docs.push({
            id: `inep-cine-${slug(rotulo)}`,
            nome: `Censo INEP: ${nome}`,
            pais: 'Brasil',
            tipo: 'Estatística Educacional INEP',
            categoria: 'Indicador / Censo INEP',
            cidades: 'Nacional (Brasil)',
            estados: 'Todos os Estados',
            publicoAlvo: 'Estudantes de Ensino Superior',
            financiamento: 'MEC / INEP',
            apoio: 'Ministério da Educação',
            areas: nome,
            objetivos: `Medir a participação feminina nas matrículas, ingressos e conclusões do curso de ${nome} no Brasil.`,
            detalhes,
            texto: `Nome: Censo INEP: ${nome}. País: Brasil. Categoria: Indicador / Censo INEP. Participação de mulheres no curso de ${nome}. ${detalhes}`
        });
    }
    return docs;
}

async function extrairInstituicoes() {
    const linhas = await sparql(`${PREFIXOS}
SELECT DISTINCT ?ies ?nomeIES ?tipoIES WHERE {
  ?ies a ?tipoIES ; rdfs:label ?nomeIES .
  FILTER(?tipoIES IN (Ellas:University, Ellas:UniversityCenter, Ellas:FederalInstitute, Ellas:College))
} LIMIT 200`);
    return linhas.map((l) => {
        const tipo = l.tipoIES.split('/').pop();
        return {
            id: `inep-ies-${l.nomeIES.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
            nome: l.nomeIES,
            pais: 'Brasil',
            tipo,
            categoria: 'Instituição de Ensino Superior',
            cidades: null,
            estados: null,
            publicoAlvo: 'Comunidade Acadêmica / Ensino Superior',
            financiamento: 'Público / Privado (INEP)',
            apoio: 'MEC',
            areas: 'Ensino Superior e Pesquisa',
            objetivos: 'Instituição de Ensino Superior cadastrada no Censo INEP com cursos de graduação e tecnologia.',
            detalhes: `Instituição do tipo ${tipo} mapeada na base INEP/MEC com oferta de cursos superiores no Brasil.`,
            texto: `Nome: ${l.nomeIES}. País: Brasil. Categoria: Instituição de Ensino Superior. Tipo: ${tipo}.`
        };
    });
}

async function main() {
    console.log(`🎓 Extraindo de ${ENDPOINT}`);
    const cursos = await extrairCursos();
    const ies = await extrairInstituicoes();
    const docs = [...cursos, ...ies];
    const tmp = `${SAIDA}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(docs, null, 2), 'utf-8');
    fs.renameSync(tmp, SAIDA);
    console.log(`💾 ${cursos.length} cursos + ${ies.length} instituições salvos em ${SAIDA}`);
}

if (process.argv[1] && process.argv[1].endsWith('extrair_inep.js')) {
    main().catch((e) => {
        console.error(`❌ ${e.message}`);
        process.exit(1);
    });
}
