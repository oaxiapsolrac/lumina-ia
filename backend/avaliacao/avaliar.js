// Avaliação da Lumina com o conjunto de perguntas de avaliacao/casos.json.
//
//   npm run avaliar:validar                         confere se os alvos dos casos existem na base
//   npm run avaliar:busca                           só a busca (rápido, sem chamar modelo de IA)
//   npm run avaliar:respostas -- --modelo gemini    perguntas pelo servidor local (precisa de "npm start")
//
// Opções: --casos id1,id2  --categoria inep,paises  --url http://localhost:3001  --pausa-ms 2500  --tpm 7000
//         --sem-salvar (não grava o resultado)
// Cada rodada é salva em avaliacao/resultados/ e comparada com a rodada anterior do mesmo modo e modelo.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.dirname(__dirname);
dotenv.config({ path: path.join(RAIZ, '.env') });
const PASTA_RESULTADOS = path.join(__dirname, 'resultados');
const carregarMotor = () => import(pathToFileURL(path.join(RAIZ, 'vector_engine.js')).href);

// --- Argumentos ---
const [modo = 'busca', ...resto] = process.argv.slice(2);
const opcoes = {};
for (let i = 0; i < resto.length; i++) {
    if (!resto[i].startsWith('--')) continue;
    const chave = resto[i].slice(2);
    const valor = resto[i + 1] && !resto[i + 1].startsWith('--') ? resto[++i] : true;
    opcoes[chave] = valor;
}
const lista = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);
if (!['validar', 'busca', 'respostas', 'reavaliar'].includes(modo)) {
    console.error(`Modo desconhecido: ${modo}. Use validar, busca, respostas ou reavaliar.`);
    process.exit(1);
}

// --- Casos ---
const { casos: todosCasos } = JSON.parse(fs.readFileSync(path.join(__dirname, 'casos.json'), 'utf-8'));
const filtroIds = lista(opcoes.casos);
const filtroCategorias = lista(opcoes.categoria);
const casos = todosCasos.filter((c) => (!filtroIds || filtroIds.includes(c.id)) && (!filtroCategorias || filtroCategorias.includes(c.categoria)));
if (casos.length === 0) {
    console.error('Nenhum caso selecionado.');
    process.exit(1);
}
const regex = (s) => new RegExp(s, 'iu');

// --- Critérios ---
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const CATEGORIAS_SEM_CONTEUDO = /^(Location|Target_Audience)$/;
function ehAlvo(alvo, doc) {
    if (!alvo) return false;
    if (alvo.pais) return semAcento(doc.pais).includes(semAcento(alvo.pais)) && !CATEGORIAS_SEM_CONTEUDO.test(doc.categoria || '');
    // Perguntas genéricas: basta um documento do tipo certo (ex.: barreiras para "por que abandonam?")
    if (alvo.categoria) return regex(alvo.categoria).test(doc.categoria || '');
    const re = regex(alvo.nome);
    return [doc.nome, ...(doc.outrosNomes || [])].some((n) => re.test(n || ''));
}

// A Lumina responde no idioma da pergunta: as frases fixas podem vir em português, espanhol ou inglês
const RE_ESCOPO = /meu escopo [ée] restrito|mi (alcance|[áa]mbito) (est[áa] |se )?(restringido|limitado|restrito)|my scope is (restricted|limited)/i;
const RE_ABSTENCAO = /^[\s*_>#"“]*(n[ãa]o encontrei|no encontr[ée]|i (could not|couldn't|did not|didn't) find)/i;
const RE_CONTESTA = /n[ãa]o h[áa] (evid[êe]ncia|dado|comprova|base)|n[ãa]o existe|n[ãa]o [ée] verdade|n[ãa]o procede|n[ãa]o comprova|mito|estere[óo]tipo|premissa|premessa|falsa|n[ãa]o confirma|n[ãa]o (se )?sustenta|respaldo|no (se )?sustenta|premisa|does not support|premise/i;
const RE_CITACAO = /\[\d+(?:\s*[,;\u2010-\u2015-]\s*\d+)*\]/;

/** Confere a resposta contra o esperado do caso. Retorna a lista de problemas (vazia = passou). */
function conferirResposta(caso, resposta) {
    const problemas = [];
    const recusou = RE_ESCOPO.test(resposta);
    const absteve = RE_ABSTENCAO.test(resposta);
    switch (caso.esperado) {
        case 'responder':
            if (recusou) problemas.push('recusou como fora do escopo');
            else if (absteve) problemas.push('disse que não encontrou');
            break;
        case 'abster':
            if (recusou) problemas.push('usou a mensagem de escopo em vez de "Não encontrei"');
            else if (!absteve) problemas.push('não começou com "Não encontrei esse dado"');
            break;
        case 'recusar':
            if (!recusou) problemas.push('não usou a mensagem de escopo');
            break;
        case 'nao_confirmar':
            if (!recusou && !RE_CONTESTA.test(resposta)) problemas.push('não recusou nem contestou a premissa');
            break;
        default:
            break;
    }
    for (const p of caso.deveConter || []) if (!regex(p).test(resposta)) problemas.push(`faltou /${p}/`);
    for (const p of caso.naoDeveConter || []) if (regex(p).test(resposta)) problemas.push(`contém /${p}/`);
    return problemas;
}

// --- Utilidades ---
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '—');
const curto = (s, n = 110) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

function resumir(resultados) {
    const r = { casos: resultados.length, passaram: resultados.filter((x) => x.ok).length, porCategoria: {} };
    for (const x of resultados) {
        const c = (r.porCategoria[x.categoria] ||= { casos: 0, passaram: 0 });
        c.casos++;
        if (x.ok) c.passaram++;
    }
    const comAlvo = resultados.filter((x) => x.posicao !== undefined);
    if (comAlvo.length) {
        r.busca = {
            casos: comAlvo.length,
            primeiro: comAlvo.filter((x) => x.posicao === 1).length,
            top4: comAlvo.filter((x) => x.posicao >= 1 && x.posicao <= 4).length,
            mrr: Number((comAlvo.reduce((s, x) => s + (x.posicao ? 1 / x.posicao : 0), 0) / comAlvo.length).toFixed(3))
        };
    }
    const respondidos = resultados.filter((x) => x.resposta !== undefined && !x.erro);
    if (respondidos.length) {
        const deveCitar = respondidos.filter((x) => x.esperado === 'responder');
        r.respostas = {
            casos: respondidos.length,
            erros: resultados.filter((x) => x.erro).length,
            comCitacao: deveCitar.filter((x) => RE_CITACAO.test(x.resposta)).length,
            deviamCitar: deveCitar.length,
            comNumeroSemFonte: respondidos.filter((x) => x.verificacao?.status === 'alerta').length,
            tempoMedioMs: Math.round(respondidos.reduce((s, x) => s + x.ms, 0) / respondidos.length)
        };
    }
    return r;
}

function imprimirResumo(r) {
    console.log(`\n=== Resultado: ${r.passaram}/${r.casos} casos passaram (${pct(r.passaram, r.casos)})${r.interrompida ? ` — rodada incompleta (${r.interrompida.executados} de ${r.interrompida.previstos})` : ''}`);
    for (const [cat, c] of Object.entries(r.porCategoria)) console.log(`   ${cat.padEnd(13)} ${c.passaram}/${c.casos}`);
    if (r.busca) console.log(`   busca: documento certo em 1º ${r.busca.primeiro}/${r.busca.casos} | entre os 4 primeiros ${r.busca.top4}/${r.busca.casos} | MRR ${r.busca.mrr}`);
    if (r.respostas) {
        console.log(`   respostas: citam a fonte [n] ${r.respostas.comCitacao}/${r.respostas.deviamCitar} | com número sem fonte ${r.respostas.comNumeroSemFonte} | erros ${r.respostas.erros} | tempo médio ${r.respostas.tempoMedioMs} ms`);
    }
}

function salvarEComparar(dados) {
    if (opcoes['sem-salvar']) return;
    fs.mkdirSync(PASTA_RESULTADOS, { recursive: true });
    const sufixo = dados.modelo ? `${dados.modo}_${String(dados.modelo).replace(/[^A-Za-z0-9.-]+/g, '-')}` : dados.modo;
    const anteriores = fs.readdirSync(PASTA_RESULTADOS).filter((f) => f.endsWith(`_${sufixo}.json`)).sort();
    const nome = `${new Date().toISOString().slice(0, 16).replace(/:/g, '-')}_${sufixo}.json`;
    fs.writeFileSync(path.join(PASTA_RESULTADOS, nome), JSON.stringify(dados, null, 1));
    console.log(`\n💾 Resultado salvo em avaliacao/resultados/${nome}`);

    const ultimo = anteriores.filter((f) => f !== nome).pop();
    if (!ultimo) return;
    const antes = JSON.parse(fs.readFileSync(path.join(PASTA_RESULTADOS, ultimo), 'utf-8'));
    const porId = new Map(antes.resultados.map((x) => [x.id, x]));
    const pioraram = [];
    const melhoraram = [];
    for (const x of dados.resultados) {
        const a = porId.get(x.id);
        if (!a) continue;
        if (a.ok && !x.ok) pioraram.push(x.id);
        if (!a.ok && x.ok) melhoraram.push(x.id);
    }
    console.log(`\n↔️  Comparação com ${ultimo}: antes ${antes.resumo.passaram}/${antes.resumo.casos}, agora ${dados.resumo.passaram}/${dados.resumo.casos}`);
    if (antes.resumo.busca && dados.resumo.busca) console.log(`   MRR da busca: ${antes.resumo.busca.mrr} → ${dados.resumo.busca.mrr}`);
    if (melhoraram.length) console.log(`   passaram a acertar: ${melhoraram.join(', ')}`);
    if (pioraram.length) console.log(`   passaram a errar: ${pioraram.join(', ')}`);
    if (!melhoraram.length && !pioraram.length) console.log('   nenhum caso mudou de resultado');
}

// --- Modo validar: todo alvo precisa existir na base e toda regex precisa compilar ---
async function validar() {
    const { vectorEngine } = await carregarMotor();
    await vectorEngine.init();
    const docs = vectorEngine.documents;
    let problemas = 0;
    const ids = new Set();
    for (const c of todosCasos) {
        if (ids.has(c.id)) { console.log(`❌ ${c.id}: id repetido`); problemas++; }
        ids.add(c.id);
        try {
            [...(c.deveConter || []), ...(c.naoDeveConter || []), ...(c.alvo?.nome ? [c.alvo.nome] : []), ...(c.alvo?.categoria ? [c.alvo.categoria] : [])].forEach(regex);
        } catch (e) {
            console.log(`❌ ${c.id}: regex inválida (${e.message})`);
            problemas++;
            continue;
        }
        if (!['responder', 'abster', 'recusar', 'nao_confirmar', 'qualquer'].includes(c.esperado)) { console.log(`❌ ${c.id}: esperado "${c.esperado}" desconhecido`); problemas++; }
        if (c.alvo) {
            const n = docs.filter((d) => ehAlvo(c.alvo, d)).length;
            if (n === 0) { console.log(`❌ ${c.id}: nenhum documento corresponde ao alvo ${JSON.stringify(c.alvo)}`); problemas++; }
        }
    }
    const porCategoria = {};
    for (const c of todosCasos) porCategoria[c.categoria] = (porCategoria[c.categoria] || 0) + 1;
    console.log(`\n${todosCasos.length} casos em ${Object.keys(porCategoria).length} categorias: ${Object.entries(porCategoria).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    console.log(problemas ? `\n${problemas} problema(s) encontrados.` : `\n✅ Todos os alvos existem na base (${docs.length} documentos).`);
    process.exitCode = problemas ? 1 : 0;
}

// --- Modo busca: posição do documento certo nos resultados da busca híbrida (sem modelo de IA) ---
async function avaliarBusca() {
    const { vectorEngine } = await carregarMotor();
    await vectorEngine.init();
    const selecionados = casos.filter((c) => c.alvo && !c.historico?.length);
    const pulados = casos.length - selecionados.length;
    console.log(`\n🔎 Busca: ${selecionados.length} casos com alvo${pulados ? ` (${pulados} sem alvo ou de seguimento ficam para o modo respostas)` : ''}\n`);
    const resultados = [];
    for (const c of selecionados) {
        // Posição do documento certo: lista longa e sem corte de relevância
        const r = await vectorEngine.search(c.pergunta, { topK: 200, pais: c.pais || null, corteRelativo: 0 });
        const posicao = r.resultados.findIndex((d) => ehAlvo(c.alvo, d)) + 1;
        // O que de fato vai para o modelo: 4 documentos com o corte de relevância configurado
        const enviados = (await vectorEngine.search(c.pergunta, { topK: 4, pais: c.pais || null })).resultados;
        const alvoEnviado = enviados.some((d) => ehAlvo(c.alvo, d));
        const ok = posicao >= 1 && posicao <= 4 && alvoEnviado;
        resultados.push({ id: c.id, categoria: c.categoria, ok, posicao, enviados: enviados.length, alvoEnviado, top4: r.resultados.slice(0, 4).map((d) => d.nome) });
        const motivo = !alvoEnviado && posicao >= 1 && posicao <= 4 ? 'cortado pelo corte de relevância' : `top-4: ${r.resultados.slice(0, 4).map((d) => curto(d.nome, 40)).join(' | ')}`;
        console.log(`${ok ? '✅' : '❌'} ${String(posicao || '—').padStart(3)}º  ${c.id.padEnd(28)} ${enviados.length} enviado(s) ${ok ? '' : motivo}`);
    }
    // Perguntas sem documento-alvo (sem dados, fora do escopo, armadilhas): quantos documentos ainda vão para o modelo
    const semAlvo = casos.filter((c) => !c.alvo && !c.historico?.length);
    let enviadosSemAlvo = 0;
    for (const c of semAlvo) enviadosSemAlvo += (await vectorEngine.search(c.pergunta, { topK: 4, pais: c.pais || null })).resultados.length;
    const resumo = resumir(resultados);
    resumo.corte = {
        mediaEnviadosComAlvo: Number((resultados.reduce((s, x) => s + x.enviados, 0) / Math.max(1, resultados.length)).toFixed(2)),
        mediaEnviadosSemAlvo: semAlvo.length ? Number((enviadosSemAlvo / semAlvo.length).toFixed(2)) : null,
        alvoCortado: resultados.filter((x) => x.posicao >= 1 && x.posicao <= 4 && !x.alvoEnviado).length
    };
    imprimirResumo(resumo);
    console.log(`   documentos enviados ao modelo (de 4): ${resumo.corte.mediaEnviadosComAlvo} em média nas perguntas com alvo, ${resumo.corte.mediaEnviadosSemAlvo ?? '—'} nas sem dados/fora do escopo | documento certo cortado: ${resumo.corte.alvoCortado}`);
    console.log(`   embeddings: ${vectorEngine.getStats().modeloEmbeddings}`);
    // Um histórico de resultados por modelo de embeddings (local e API não se misturam na comparação)
    const embeddings = (process.env.EMBEDDING_PROVIDER || 'local').trim().toLowerCase() === 'nvidia' ? 'api-nvidia' : null;
    salvarEComparar({ modo: 'busca', modelo: embeddings, data: new Date().toISOString(), totalDocumentos: vectorEngine.documents.length, resumo, resultados });
}

// --- Modo respostas: pergunta pelo servidor (mesmo caminho do site: /chat/stream) ---
const MODELOS_GROQ = new Set(['groq', 'gpt-oss-120b', 'gpt-oss-120b-nvidia', 'nvidia-gpt-oss-120b']);

async function perguntar(url, caso, modelo) {
    const res = await fetch(`${url}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensagem: caso.pergunta, modelo, topK: 4, pais: caso.pais || null, historico: caso.historico || [] })
    });
    if (res.status === 429) return { limite: Number(res.headers.get('retry-after') || 30) };
    if (!res.ok) return { erro: `HTTP ${res.status}: ${curto(await res.text(), 200)}` };
    const corpo = await res.text();
    const eventos = corpo.split('\n\n').filter(Boolean).map((b) => [(b.match(/^event: (.*)$/m) || [])[1], (b.match(/^data: (.*)$/m) || [])[1]]);
    const dados = (tipo) => eventos.filter((e) => e[0] === tipo).map((e) => { try { return JSON.parse(e[1]); } catch { return e[1]; } });
    const erros = dados('error').map((e) => e?.erro || String(e));
    return {
        resposta: dados('token').map((t) => t.token).join(''),
        meta: dados('metadata')[0] || {},
        verificacao: dados('verificacao')[0] || null,
        uso: dados('usage')[0]?.usage || null,
        erros
    };
}

async function avaliarRespostas() {
    const modelo = typeof opcoes.modelo === 'string' ? opcoes.modelo : 'groq';
    const url = String(typeof opcoes.url === 'string' ? opcoes.url : `http://localhost:${process.env.PORT || process.env.PORT_TESTE || 3001}`).replace(/\/+$/, '');
    const pausa = Number(opcoes['pausa-ms'] ?? 2500);
    const tpm = Number(opcoes.tpm ?? (MODELOS_GROQ.has(modelo) ? 7000 : 0));

    try {
        await fetch(`${url}/stats`);
    } catch {
        console.error(`❌ Servidor não encontrado em ${url}. Rode "npm start" em outro terminal (ou passe --url).`);
        process.exit(1);
    }
    console.log(`\n💬 Respostas: ${casos.length} casos com o modelo "${modelo}" em ${url}`);
    if (MODELOS_GROQ.has(modelo)) {
        console.log(`   ⚠️ Usa a mesma chave do site. Estimativa: ~${Math.round((casos.length * 2.2))} mil tokens da cota diária do Groq (200 mil/dia no plano gratuito).`);
        console.log(`   Ritmo limitado a ${tpm} tokens/min para não estourar o limite por minuto (8 mil).`);
    }

    const janelaTokens = []; // [instante, tokens] do último minuto, para respeitar o limite por minuto
    let mediaTokens = 2200;
    let interrompida = false;
    const resultados = [];
    for (const [i, c] of casos.entries()) {
        if (tpm > 0) {
            for (;;) {
                const agora = Date.now();
                while (janelaTokens.length && agora - janelaTokens[0][0] > 60000) janelaTokens.shift();
                const usados = janelaTokens.reduce((s, [, t]) => s + t, 0);
                if (usados + mediaTokens <= tpm || !janelaTokens.length) break;
                await espera(60000 - (agora - janelaTokens[0][0]) + 200);
            }
        }
        const inicio = Date.now();
        let r = null;
        let cotaDiaria = false;
        for (let tentativa = 0; tentativa < 3; tentativa++) {
            r = await perguntar(url, c, modelo);
            const limiteModelo = r.erros?.some((e) => /429|rate.?limit|quota|too many/i.test(e));
            // Cota do dia esgotada: esperar não adianta e insistir só gasta tempo
            cotaDiaria = Boolean(r.erros?.some((e) => /per ?day|perday|daily|requests per day|tokens per day|retry in \d+h/i.test(e)));
            if (cotaDiaria || (!r.limite && !limiteModelo)) break;
            const segundos = r.limite || 30;
            console.log(`   ⏳ limite de requisições (${r.limite ? 'servidor local' : 'API do modelo'}); esperando ${segundos} s...`);
            await espera(segundos * 1000);
        }
        const ms = Date.now() - inicio;
        if (cotaDiaria) {
            console.log(`\n⛔ A cota diária do modelo "${modelo}" acabou no caso ${c.id}. Rodada interrompida em ${i}/${casos.length}.`);
            console.log(`   ${curto(r.erros.join(' '), 300)}`);
            interrompida = true;
            break;
        }
        if (r.uso) {
            const t = (r.uso.prompt_tokens || 0) + (r.uso.completion_tokens || 0);
            janelaTokens.push([Date.now(), t]);
            mediaTokens = Math.round(mediaTokens * 0.7 + t * 0.3);
        }

        const erro = r.erro || (r.erros?.length && !r.resposta ? r.erros.join(' | ') : null);
        const docs = r.meta?.documentosRecuperados || [];
        const posicao = c.alvo ? docs.findIndex((d) => ehAlvo(c.alvo, d)) + 1 : undefined;
        const problemas = erro ? [`erro: ${curto(erro, 150)}`] : conferirResposta(c, r.resposta || '');
        if (!erro && c.alvo && !posicao) problemas.push('documento certo não veio entre os 4 consultados');
        const ok = problemas.length === 0;
        resultados.push({
            id: c.id, categoria: c.categoria, esperado: c.esperado, ok, problemas, ms,
            ...(posicao !== undefined ? { posicao } : {}),
            ...(erro ? { erro } : {}),
            resposta: r.resposta || '',
            consulta: r.meta?.queryUtilizada,
            documentos: docs.map((d) => d.nome),
            verificacao: r.verificacao
        });
        const alerta = r.verificacao?.status === 'alerta' ? `  🔢 sem fonte: ${r.verificacao.naoEncontrados.map((n) => n.numero).join(', ')}` : '';
        console.log(`${ok ? '✅' : '❌'} [${i + 1}/${casos.length}] ${c.id.padEnd(28)} ${String(ms).padStart(6)} ms${alerta}`);
        if (!ok) {
            console.log(`      ${problemas.join('; ')}`);
            console.log(`      resposta: ${curto(r.resposta || erro, 220)}`);
        }
        if (i < casos.length - 1) await espera(pausa);
    }
    if (resultados.length === 0) return;
    const resumo = resumir(resultados);
    if (interrompida) resumo.interrompida = { executados: resultados.length, previstos: casos.length };
    imprimirResumo(resumo);
    salvarEComparar({ modo: 'respostas', modelo, data: new Date().toISOString(), resumo, resultados });
}

// --- Modo reavaliar: aplica os critérios atuais a uma rodada salva, sem chamar o modelo de novo ---
//   node avaliacao/avaliar.js reavaliar avaliacao/resultados/<arquivo>.json [outro.json ...]
function reavaliar() {
    const arquivos = resto.filter((a) => !a.startsWith('--'));
    if (!arquivos.length) {
        console.error('Informe o arquivo da rodada: node avaliacao/avaliar.js reavaliar avaliacao/resultados/<arquivo>.json');
        process.exit(1);
    }
    const porId = new Map(todosCasos.map((c) => [c.id, c]));
    for (const arq of arquivos) {
        const dados = JSON.parse(fs.readFileSync(arq, 'utf-8'));
        if (dados.modo !== 'respostas') { console.log(`${arq}: só rodadas de respostas podem ser reavaliadas`); continue; }
        const mudaram = [];
        for (const x of dados.resultados) {
            const c = porId.get(x.id);
            if (!c || x.erro) continue;
            // A busca não é refeita: mantém o problema de documento ausente que a rodada original registrou
            const problemas = [...conferirResposta(c, x.resposta || ''), ...(x.problemas || []).filter((p) => p.startsWith('documento certo'))];
            const ok = problemas.length === 0;
            if (ok !== x.ok) mudaram.push(`${x.id}: ${x.ok ? '✅→❌' : '❌→✅'}`);
            Object.assign(x, { ok, problemas });
        }
        const resumo = resumir(dados.resultados);
        console.log(`\n${path.basename(arq)} (${dados.modelo}) com os critérios atuais:`);
        imprimirResumo(resumo);
        console.log(`   mudaram: ${mudaram.join(' | ') || 'nenhum'}`);
        console.log(`   ainda erram: ${dados.resultados.filter((x) => !x.ok).map((x) => x.id).join(', ') || 'nenhum'}`);
    }
}

if (modo === 'validar') await validar();
else if (modo === 'busca') await avaliarBusca();
else if (modo === 'reavaliar') reavaliar();
else await avaliarRespostas();
