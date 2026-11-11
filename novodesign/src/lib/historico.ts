import type { Conversa, Documento, Mensagem, Metricas, MidiaSalva, VerificacaoNumeros } from './types';

/**
 * Usa a mesma chave e o mesmo formato do index.html antigo, para que as duas versões
 * leiam o histórico uma da outra quando estiverem no mesmo domínio.
 */
const CHAVE = 'lumina_chat_history_v3';

interface MensagemSalva {
  role: 'user' | 'lumina';
  text?: string;
  media?: MidiaSalva[];
  html?: string;
  rawText?: string;
  modelName?: string;
  modeloUtilizado?: string;
  docs?: Documento[];
  metricas?: Metricas | null;
  query?: string;
  avaliacao?: 'boa' | 'ruim' | null;
  verificacao?: VerificacaoNumeros | null;
  status?: string;
}

interface ConversaSalva {
  id: string;
  title: string;
  model: string;
  modelName: string;
  createdAt: string;
  messages: MensagemSalva[];
}

let contador = 0;
export const novoId = (prefixo: string) => `${prefixo}_${Date.now().toString(36)}_${(contador++).toString(36)}`;

function deSalva(c: ConversaSalva): Conversa {
  return {
    id: c.id,
    titulo: c.title || 'Conversa sem título',
    modelo: c.model,
    modeloNome: c.modelName,
    criadaEm: c.createdAt,
    mensagens: (c.messages || []).map((m, i): Mensagem => {
      if (m.role === 'user') {
        return { id: `${c.id}_${i}`, papel: 'user', texto: m.text || '', midias: m.media };
      }
      return {
        id: `${c.id}_${i}`,
        papel: 'lumina',
        texto: m.rawText || '',
        modelo: m.modeloUtilizado || m.modelName,
        docs: m.docs,
        metricas: m.metricas,
        query: m.query,
        avaliacao: m.avaliacao ?? null,
        verificacao: m.verificacao ?? null,
        status: m.status === 'interrompida' ? 'interrompida' : m.status === 'erro' ? 'erro' : 'pronta'
      };
    })
  };
}

function paraSalva(c: Conversa): ConversaSalva {
  return {
    id: c.id,
    title: c.titulo,
    model: c.modelo,
    modelName: c.modeloNome,
    createdAt: c.criadaEm,
    messages: c.mensagens
      .filter((m) => m.status !== 'gerando')
      .map((m): MensagemSalva =>
        m.papel === 'user'
          ? { role: 'user', text: m.texto, media: m.midias }
          : {
              role: 'lumina',
              rawText: m.texto,
              modelName: m.modelo,
              modeloUtilizado: m.modelo,
              docs: m.docs,
              metricas: m.metricas ?? null,
              query: m.query,
              avaliacao: m.avaliacao ?? null,
              verificacao: m.verificacao ?? null,
              status: m.status
            }
      )
  };
}

export function carregarConversas(): Conversa[] {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) || '[]') as ConversaSalva[];
    return Array.isArray(bruto) ? bruto.map(deSalva) : [];
  } catch {
    return [];
  }
}

export function salvarConversas(conversas: Conversa[]): void {
  const dados = conversas.map(paraSalva);
  try {
    localStorage.setItem(CHAVE, JSON.stringify(dados));
  } catch {
    // Cota do localStorage (~5 MB) estourada: remove mídias antigas em base64 e tenta de novo
    const semMidia = dados.map((c) => ({
      ...c,
      messages: c.messages.map((m) =>
        Array.isArray(m.media)
          ? { ...m, media: m.media.map((f) => (typeof f === 'string' ? { tipo: (/^data:([a-z]+)\//.exec(f) || [])[1] || 'arquivo', nome: 'anexo' } : f)) }
          : m
      )
    }));
    try {
      localStorage.setItem(CHAVE, JSON.stringify(semMidia));
    } catch (e) {
      console.error('Não foi possível salvar o histórico:', e);
    }
  }
}

// Preferências da interface (modelo, filtros, barra lateral)
const CHAVE_PREFS = 'lumina_prefs_v1';

export interface Preferencias {
  modelo: string;
  pais: string;
  topK: number;
  barraLateralAberta: boolean;
}

export function carregarPreferencias(): Partial<Preferencias> {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_PREFS) || '{}');
  } catch {
    return {};
  }
}

export function salvarPreferencias(p: Preferencias): void {
  try {
    localStorage.setItem(CHAVE_PREFS, JSON.stringify(p));
  } catch {
    /* ignora */
  }
}
