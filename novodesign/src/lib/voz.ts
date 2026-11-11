import { sintetizarVoz } from './api';

export const VOZES_GEMINI = [
  { id: 'pt-br-assistant-5', rotulo: 'PT-BR Clara (fem.)' },
  { id: 'pt-br-assistant-6', rotulo: 'PT-BR Calorosa (fem.)' },
  { id: 'pt-br-concierge-4', rotulo: 'PT-BR Jovem (fem.)' },
  { id: 'pt-br-assistant-11', rotulo: 'PT-BR Grave (masc.)' },
  { id: 'Kore', rotulo: 'Studio Kore (fem.)' },
  { id: 'Aoede', rotulo: 'Studio Aoede (leve)' },
  { id: 'Puck', rotulo: 'Studio Puck (masc.)' }
];

// Mesmas chaves do index.html antigo
const LS_ATIVA = 'lumina_voice_enabled';
const LS_VOZ = 'lumina_voice_name';

export function lerPreferenciasVoz(): { ativa: boolean; voz: string } {
  try {
    return { ativa: localStorage.getItem(LS_ATIVA) === 'true', voz: localStorage.getItem(LS_VOZ) || 'auto' };
  } catch {
    return { ativa: false, voz: 'auto' };
  }
}

export function salvarPreferenciasVoz(ativa: boolean, voz: string): void {
  try {
    localStorage.setItem(LS_ATIVA, String(ativa));
    localStorage.setItem(LS_VOZ, voz);
  } catch {
    /* ignora */
  }
}

/** Remove Markdown, links e tabelas para a leitura soar natural. */
export function limparTextoParaFala(texto: string): string {
  return String(texto || '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*#_`~>]/g, '')
    .replace(/(\d+)\s*%/g, '$1 por cento')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Divide em blocos de até 200 caracteres: o Chrome corta falas longas da voz do Google. */
function fatiar(texto: string, max = 200): string[] {
  const sentencas = texto.match(/[^.!?;\n]+[.!?;]?/g) || [texto];
  const blocos: string[] = [];
  let atual = '';
  for (const s of sentencas) {
    const trecho = s.trim();
    if (!trecho) continue;
    if (`${atual} ${trecho}`.trim().length <= max) {
      atual = `${atual} ${trecho}`.trim();
      continue;
    }
    if (atual) blocos.push(atual);
    if (trecho.length <= max) {
      atual = trecho;
      continue;
    }
    atual = '';
    for (const p of trecho.split(/\s+/)) {
      if (`${atual} ${p}`.trim().length <= max) atual = `${atual} ${p}`.trim();
      else {
        if (atual) blocos.push(atual);
        atual = p;
      }
    }
  }
  if (atual) blocos.push(atual);
  return blocos;
}

function prioridade(v: SpeechSynthesisVoice): number {
  const lang = (v.lang || '').replace('_', '-').toLowerCase();
  const nome = (v.name || '').toLowerCase();
  if (!lang.startsWith('pt')) return -1;
  let p = 0;
  if (lang === 'pt-br') p += 50;
  if (nome.includes('google')) p += 100;
  if (/natural|neural|online/.test(nome)) p += 40;
  if (/luciana|felipe|francisca|antonio|maria/.test(nome)) p += 20;
  if (!v.localService) p += 10;
  return p;
}

export function vozesNativasPt(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => prioridade(v) >= 0)
    .sort((a, b) => prioridade(b) - prioridade(a));
}

export type EstadoLeitura = 'carregando' | 'falando' | 'parado';

/**
 * Leitor único da página: só uma resposta é lida por vez.
 * Voz "gemini:<id>" usa o /tts do servidor; as demais usam a síntese do navegador.
 */
class Leitor {
  private sessao = 0;
  private abort: AbortController | null = null;
  private audio = new Audio();
  private contexto: AudioContext | null = null;
  private fonte: AudioBufferSourceNode | null = null;
  private aoMudar: ((estado: EstadoLeitura) => void) | null = null;

  /** Navegadores só liberam áudio depois de um gesto do usuário. */
  desbloquear(): void {
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!this.contexto && AC) this.contexto = new AC();
      if (this.contexto?.state === 'suspended') void this.contexto.resume();
    } catch {
      /* ignora */
    }
  }

  parar(): void {
    this.sessao++;
    this.abort?.abort();
    this.abort = null;
    try {
      this.fonte?.stop();
    } catch {
      /* já parado */
    }
    this.fonte = null;
    this.audio.onended = null;
    this.audio.pause();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.emitir('parado');
  }

  async falar(texto: string, voz: string, aoMudar: (estado: EstadoLeitura) => void): Promise<void> {
    this.parar();
    this.aoMudar = aoMudar;
    const sessao = this.sessao;
    if (voz.startsWith('gemini:')) await this.falarGemini(texto, voz.slice(7) || 'pt-br-assistant-5', sessao);
    else this.falarNativo(texto, voz, sessao);
  }

  private emitir(estado: EstadoLeitura) {
    const cb = this.aoMudar;
    if (estado === 'parado') this.aoMudar = null;
    cb?.(estado);
  }

  private async falarGemini(texto: string, vozId: string, sessao: number) {
    this.emitir('carregando');
    this.abort = new AbortController();
    try {
      const blob = await sintetizarVoz(texto, vozId, this.abort.signal);
      if (sessao !== this.sessao) return;
      const url = URL.createObjectURL(blob);
      this.audio.src = url;
      this.audio.onended = () => {
        URL.revokeObjectURL(url);
        if (sessao === this.sessao) this.parar();
      };
      this.emitir('falando');
      try {
        await this.audio.play();
      } catch {
        // Autoplay bloqueado depois de uma espera longa: toca pelo AudioContext liberado no clique
        URL.revokeObjectURL(url);
        if (!this.contexto) this.desbloquear();
        if (!this.contexto) throw new Error('Áudio bloqueado pelo navegador');
        const decodificado = await this.contexto.decodeAudioData(await blob.arrayBuffer());
        if (sessao !== this.sessao) return;
        const fonte = this.contexto.createBufferSource();
        fonte.buffer = decodificado;
        fonte.connect(this.contexto.destination);
        fonte.onended = () => sessao === this.sessao && this.parar();
        this.fonte = fonte;
        fonte.start(0);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') console.warn('Gemini TTS indisponível:', e);
      if (sessao === this.sessao) this.parar();
    }
  }

  private falarNativo(texto: string, vozNome: string, sessao: number) {
    if (!('speechSynthesis' in window)) return this.parar();
    const blocos = fatiar(limparTextoParaFala(texto));
    if (blocos.length === 0) return this.parar();
    const vozes = vozesNativasPt();
    const escolhida = (vozNome !== 'auto' && window.speechSynthesis.getVoices().find((v) => v.name === vozNome)) || vozes[0] || null;
    let i = 0;
    this.emitir('falando');
    const proximo = () => {
      if (sessao !== this.sessao) return;
      if (i >= blocos.length) return this.parar();
      const fala = new SpeechSynthesisUtterance(blocos[i]);
      if (escolhida) {
        fala.voice = escolhida;
        fala.lang = escolhida.lang;
      } else fala.lang = 'pt-BR';
      fala.rate = 1.05;
      fala.onend = () => {
        i++;
        proximo();
      };
      fala.onerror = () => sessao === this.sessao && this.parar();
      window.speechSynthesis.speak(fala);
    };
    proximo();
  }
}

export const leitor = new Leitor();
