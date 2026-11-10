// backend/anexos.js
// Converte anexos (data URLs) nas partes de conteúdo OpenAI-compatíveis aceitas por cada modelo.
// Fontes: model cards da NVIDIA NIM (nov/2026)
//  - Nemotron 3 Nano Omni: imagem, vídeo e áudio (image_url, video_url, audio_url)
//  - Nemotron 3.5 Super VL 120B: imagem e vídeo, sem áudio
//  - Mistral Large 4: até 8 imagens; vídeo e áudio não suportados

const MIDIAS_POR_MODELO = [
    { aliases: ['nemotron-3-nano-omni', 'nemotron-omni', 'nano-omni'], midias: ['image', 'video', 'audio'] },
    { aliases: ['nemotron-3-super-120b', 'nemotron-120b', 'nemotron', 'nemotron-3-ultra-550b'], midias: ['image', 'video'] },
    { aliases: ['mistral-large', 'mistral', 'mistral-large-4', 'mistralai/mistral-large-4-1t-a52b'], midias: ['image'], maxImagens: 8 }
];

const ROTULO_MIDIA = { image: 'imagem', video: 'vídeo', audio: 'áudio' };

function capacidades(modelo) {
    const m = String(modelo || '').trim().toLowerCase();
    return MIDIAS_POR_MODELO.find(c => c.aliases.includes(m)) || { midias: [] };
}

function tipoDaMidia(dataUrl) {
    const m = /^data:([a-z]+)\//i.exec(dataUrl);
    const tipo = m ? m[1].toLowerCase() : null;
    return ['image', 'video', 'audio'].includes(tipo) ? tipo : null;
}

/** Junta os campos `imagens` e `arquivos` do corpo da requisição em uma lista de data URLs. */
export function coletarAnexos(imagens, arquivos) {
    const lista = [];
    if (Array.isArray(imagens)) {
        for (const img of imagens) {
            if (typeof img === 'string' && img.startsWith('data:')) lista.push(img);
        }
    }
    if (Array.isArray(arquivos)) {
        for (const arq of arquivos) {
            const url = typeof arq === 'string' ? arq : (arq?.url || arq?.data || null);
            if (typeof url === 'string' && url.startsWith('data:')) lista.push(url);
        }
    }
    return lista;
}

/**
 * Monta image_url / video_url / audio_url conforme o tipo MIME de cada anexo.
 * Retorna { partes } ou { erro } quando o modelo não aceita algum dos tipos enviados.
 */
export function montarPartesMidia(modelo, anexos) {
    const cap = capacidades(modelo);
    const partes = [];
    let imagens = 0;

    for (const url of anexos) {
        const tipo = tipoDaMidia(url);
        if (!tipo) {
            return { erro: 'Formato de anexo não reconhecido. Envie imagem, vídeo ou áudio.' };
        }
        if (!cap.midias.includes(tipo)) {
            const aceitos = cap.midias.map(t => ROTULO_MIDIA[t]).join(', ');
            return {
                erro: aceitos
                    ? `O modelo "${modelo}" aceita apenas: ${aceitos}. Anexo de ${ROTULO_MIDIA[tipo]} não é suportado.`
                    : `O modelo "${modelo}" não aceita anexos. Escolha um modelo multimodal (Nemotron 3 Nano Omni ou Mistral Large 4).`
            };
        }
        if (tipo === 'image') {
            imagens++;
            if (cap.maxImagens && imagens > cap.maxImagens) {
                return { erro: `O modelo "${modelo}" aceita no máximo ${cap.maxImagens} imagens por mensagem.` };
            }
            partes.push({ type: 'image_url', image_url: { url } });
        } else if (tipo === 'video') {
            partes.push({ type: 'video_url', video_url: { url } });
        } else {
            partes.push({ type: 'audio_url', audio_url: { url } });
        }
    }
    return { partes };
}
