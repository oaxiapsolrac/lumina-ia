// Checagem dos números da resposta.
// Cada número que a Lumina cita (porcentagens, totais, anos, valores com "mil"/"milhões") deve aparecer
// nos documentos recuperados ou no que a própria pessoa escreveu na conversa. A checagem não muda a
// resposta: devolve a lista do que não foi encontrado, para o cliente avisar "confira nas fontes".

// "mil milhões" antes de "mil"; as palavras terminam em letra ASCII, então \b funciona sem a flag u
const MULTIPLICADORES = [
    [/^\s*(?:mil\s+milh(?:ões|oes)|mil\s+millones|bilh(?:ão|ao|ões|oes)|billions?|billones?)\b/i, 1e9],
    [/^\s*(?:milh(?:ão|ao|ões|oes)|millions?|millones|mill[óo]n)\b/i, 1e6],
    [/^\s*(?:mil|thousand)\b/i, 1e3]
];
const SUFIXO_PORCENTAGEM = /^\s*(?:%|por\s*cento|por\s*ciento|percent\b|pontos?\s+percentua(?:l|is)|p\.\s?p\.)/i;

// Número sem letra, dígito ou separador colado à esquerda nem letra colada à direita: evita "M3.1",
// "gpt-oss-120b", "5G", ordinais (1º, 2ª) e o "1" de "3.1".
// Aceita milhar com ponto ou vírgula (1.234.567 / 1,234,567) e decimal com ponto ou vírgula (9,6 / 9.6).
// Espaço fino ou inseparável também separa milhar ("11 883"), como alguns modelos escrevem.
const RE_NUMERO = /(?<![\p{L}\p{N}_.,])(?:\d{1,3}(?:[.,\u00A0\u202F\u2009]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\p{N}\p{L}°])/gu;
const ESPACOS_MILHAR = /[\u00A0\u202F\u2009]/g;

/**
 * Interpretações possíveis de um número escrito. "1.234" é ambíguo (mil duzentos e trinta e quatro em
 * português, um vírgula dois em inglês), então devolve as duas; "casas" define a tolerância de arredondamento.
 */
function interpretar(escrito) {
    const token = escrito.replace(ESPACOS_MILHAR, '');
    const pontos = (token.match(/\./g) || []).length;
    const virgulas = (token.match(/,/g) || []).length;
    const casasApos = (sep) => token.length - token.lastIndexOf(sep) - 1;
    if (!pontos && !virgulas) return [{ valor: Number(token), casas: 0 }];
    if (pontos && virgulas) {
        const dec = token.lastIndexOf('.') > token.lastIndexOf(',') ? '.' : ',';
        const mil = dec === '.' ? ',' : '.';
        return [{ valor: Number(token.split(mil).join('').replace(dec, '.')), casas: casasApos(dec) }];
    }
    const sep = pontos ? '.' : ',';
    const comoMilhar = { valor: Number(token.split(sep).join('')), casas: 0 };
    if (pontos + virgulas > 1) return [comoMilhar];
    const comoDecimal = { valor: Number(token.replace(sep, '.')), casas: casasApos(sep) };
    return comoDecimal.casas === 3 ? [comoMilhar, comoDecimal] : [comoDecimal];
}

/** Lê os números de um texto com o que vem logo depois (%, mil, milhões). */
function extrairNumeros(texto) {
    const achados = [];
    for (const m of String(texto).matchAll(RE_NUMERO)) {
        const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + 40);
        const porcentagem = depois.match(SUFIXO_PORCENTAGEM);
        let multiplicador = 1;
        let sufixo = porcentagem ? porcentagem[0] : '';
        if (!porcentagem) {
            for (const [re, fator] of MULTIPLICADORES) {
                const r = depois.match(re);
                if (r) { multiplicador = fator; sufixo = r[0]; break; }
            }
        }
        achados.push({
            token: m[0],
            inicio: m.index,
            fim: m.index + m[0].length + sufixo.length,
            porcentagem: Boolean(porcentagem),
            multiplicador,
            interpretacoes: interpretar(m[0]).filter((i) => Number.isFinite(i.valor))
        });
    }
    return achados;
}

/** Todos os valores numéricos presentes nos textos permitidos, já com multiplicadores e proporções. */
function valoresPermitidos(textos) {
    const valores = [];
    for (const texto of textos) {
        for (const n of extrairNumeros(texto)) {
            for (const { valor, casas } of n.interpretacoes) {
                valores.push(valor);
                if (n.multiplicador !== 1) valores.push(valor * n.multiplicador);
                // Proporção escrita como fração (0,49) pode virar 49% na resposta
                if (casas > 0 && valor <= 1) valores.push(valor * 100);
            }
        }
    }
    return valores;
}

/** Tira da resposta o que tem dígito mas não é dado: links, citações [1], "documento 2" e marcadores de lista. */
function limparResposta(texto) {
    return String(texto)
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/\[\s*\d+(?:\s*[,;\u2010-\u2015-]\s*\d+)*\s*\]/g, ' ')
        .replace(/\bdoc(?:umento)?s?\s*(?:n[º°.]?\s*)?\d+/gi, ' ')
        .replace(/^\s*(?:\d+[.)]|[-*•])\s+/gm, ' ');
}

const textoDoDocumento = (d) => [d?.nome, ...(d?.outrosNomes || []), d?.pais, d?.categoria, d?.detalhes].filter(Boolean).join(' . ');

/**
 * @param {object} p
 * @param {string} p.resposta texto gerado pelo modelo
 * @param {object[]} p.docs documentos recuperados enviados no contexto
 * @param {string[]} [p.textosConversa] pergunta atual e histórico enviado ao modelo (números citados pela pessoa)
 * @returns {{ status: 'ok'|'alerta'|'sem_numeros', total: number, verificados: number, naoEncontrados: { numero: string, trecho: string }[] }}
 */
export function verificarNumeros({ resposta, docs = [], textosConversa = [] }) {
    const limpa = limparResposta(resposta);
    const permitidos = valoresPermitidos([...docs.map(textoDoDocumento), ...textosConversa.filter((t) => typeof t === 'string')]);

    const naoEncontrados = [];
    const vistos = new Set();
    let total = 0;
    let faltando = 0;
    for (const n of extrairNumeros(limpa)) {
        // Inteiros pequenos sem % nem "mil" costumam ser contagens ("3 iniciativas") e não dados da base
        const semSeparador = !/[.,\u00A0\u202F\u2009]/.test(n.token);
        if (semSeparador && Number(n.token) < 10 && !n.porcentagem && n.multiplicador === 1) continue;
        if (n.interpretacoes.length === 0) continue;
        total++;

        const encontrado = n.interpretacoes.some(({ valor, casas }) => {
            const v = valor * n.multiplicador;
            // Aceita arredondamento: "49%" cobre 48,5 a 49,5; "9,9 milhões" cobre 9,85 a 9,95 milhões
            const tolerancia = 0.5 * 10 ** -casas * n.multiplicador;
            return permitidos.some((d) => Math.abs(v - d) <= tolerancia + 1e-9 * Math.max(1, Math.abs(d)));
        });
        if (encontrado) continue;
        faltando++;

        const numero = limpa.slice(n.inicio, n.fim).replace(/\s+/g, ' ').trim();
        if (vistos.has(numero)) continue;
        vistos.add(numero);
        const trecho = limpa.slice(Math.max(0, n.inicio - 60), Math.min(limpa.length, n.fim + 40))
            .replace(/[*_#>`]/g, '').replace(/\s+/g, ' ').trim();
        naoEncontrados.push({ numero, trecho });
    }

    return {
        status: total === 0 ? 'sem_numeros' : naoEncontrados.length ? 'alerta' : 'ok',
        total,
        verificados: total - faltando,
        naoEncontrados
    };
}
