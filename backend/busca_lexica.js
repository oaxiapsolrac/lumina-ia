// backend/busca_lexica.js
// Busca por palavras (BM25) usada junto com a busca vetorial.
// O modelo de embeddings padrão (all-MiniLM-L6-v2) foi treinado em inglês; o BM25 casa termos
// em português/espanhol que o vetor não captura (nomes de cursos, siglas, países).

const PARADAS = new Set((
    'a o os as de da do das dos e em no na nos nas um uma uns umas para por com que qual quais quem como sobre ' +
    'ao aos à às se sua seu suas seus mais menos é são foi ser ter tem há entre the of in and to for on with ' +
    'el la los las del y en por con que es un una para al lo su sus'
).split(' '));

export const normalizar = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Tokens sem acento, sem palavras vazias e com um corte simples de plural. */
export function tokenizar(texto) {
    return normalizar(texto)
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .split(' ')
        .filter((w) => w.length > 2 && !PARADAS.has(w))
        .map((w) => w.replace(/(oes|aes|ais|eis|s)$/, ''));
}

export class IndiceBM25 {
    /** @param {string[]} textos um texto por documento, na mesma ordem do índice vetorial */
    constructor(textos, { k1 = 1.2, b = 0.75 } = {}) {
        this.k1 = k1;
        this.b = b;
        this.freqs = [];
        this.tamanhos = [];
        this.df = new Map();
        for (const texto of textos) {
            const tokens = tokenizar(texto);
            const tf = new Map();
            for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
            this.freqs.push(tf);
            this.tamanhos.push(tokens.length);
            for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
        }
        this.n = textos.length;
        this.tamanhoMedio = this.tamanhos.reduce((s, x) => s + x, 0) / Math.max(1, this.n);
    }

    /** Pontuação BM25 de cada documento para a consulta (0 quando nenhum termo casa). */
    pontuar(consulta) {
        const termos = [...new Set(tokenizar(consulta))].filter((t) => this.df.has(t));
        const pontos = new Float64Array(this.n);
        if (termos.length === 0) return pontos;
        const idf = termos.map((t) => Math.log(1 + (this.n - this.df.get(t) + 0.5) / (this.df.get(t) + 0.5)));
        for (let i = 0; i < this.n; i++) {
            const tf = this.freqs[i];
            const norma = this.k1 * (1 - this.b + (this.b * this.tamanhos[i]) / this.tamanhoMedio);
            let s = 0;
            for (let j = 0; j < termos.length; j++) {
                const f = tf.get(termos[j]);
                if (f) s += (idf[j] * f * (this.k1 + 1)) / (f + norma);
            }
            pontos[i] = s;
        }
        return pontos;
    }
}
