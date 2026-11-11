import type { MetadadosStream, UsoStream, VerificacaoNumeros } from './types';

const configurado = import.meta.env.VITE_API_BASE as string | undefined;
export const API_BASE = (configurado && configurado.trim() ? configurado.trim() : 'https://lumina-backend-zsak.onrender.com').replace(/\/+$/, '');

export interface PayloadChat {
  mensagem: string;
  modelo: string;
  imagens: string[];
  historico: { role: 'user' | 'assistant'; content: string }[];
  pais: string | null;
  topK: number;
}

export interface EventosChat {
  onMetadata: (m: MetadadosStream) => void;
  onToken: (t: string) => void;
  onUso: (u: UsoStream) => void;
  onErro: (mensagem: string) => void;
  onVerificacao?: (v: VerificacaoNumeros) => void;
}

/** Lê a resposta de erro do servidor ({ erro }) e devolve uma mensagem legível. */
async function mensagemDeErro(res: Response): Promise<string> {
  const texto = await res.text().catch(() => '');
  try {
    const json = JSON.parse(texto) as { erro?: string; resposta?: string };
    return json.erro || json.resposta || texto || `Erro HTTP ${res.status}`;
  } catch {
    return texto || `Erro HTTP ${res.status}`;
  }
}

/**
 * Envia a mensagem para /chat/stream e repassa os eventos SSE (metadata, token, verificacao, usage, error).
 * Lança erro em falha de rede ou resposta não OK; AbortError quando o usuário interrompe.
 */
export async function conversarStream(payload: PayloadChat, eventos: EventosChat, signal: AbortSignal): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal
  });

  if (!res.ok || !res.body) {
    throw new Error(await mensagemDeErro(res));
  }

  const leitor = res.body.getReader();
  const decodificador = new TextDecoder('utf-8');
  let buffer = '';

  const processarBloco = (bloco: string) => {
    let tipo = 'message';
    const dados: string[] = [];
    for (const linha of bloco.split('\n')) {
      if (linha.startsWith('event:')) tipo = linha.slice(6).trim();
      else if (linha.startsWith('data:')) dados.push(linha.slice(5).trimStart());
    }
    const bruto = dados.join('\n');
    if (!bruto || bruto === '[DONE]') return;
    try {
      const json = JSON.parse(bruto);
      if (tipo === 'metadata') eventos.onMetadata(json);
      else if (tipo === 'token' && json.token) eventos.onToken(json.token);
      else if (tipo === 'verificacao') eventos.onVerificacao?.(json);
      else if (tipo === 'usage') eventos.onUso(json);
      else if (tipo === 'error') eventos.onErro(json.erro || 'Falha no processamento.');
    } catch {
      /* bloco incompleto ou não-JSON: ignora */
    }
  };

  for (;;) {
    const { value, done } = await leitor.read();
    if (done) break;
    buffer += decodificador.decode(value, { stream: true });
    const blocos = buffer.split('\n\n');
    buffer = blocos.pop() ?? '';
    blocos.forEach((b) => b.trim() && processarBloco(b.trim()));
  }
  if (buffer.trim()) processarBloco(buffer.trim());
}

export async function buscarEstatisticas(): Promise<{ totalDocumentos: number } | null> {
  try {
    const res = await fetch(`${API_BASE}/stats`);
    if (!res.ok) return null;
    return (await res.json()) as { totalDocumentos: number };
  } catch {
    return null;
  }
}

export async function sintetizarVoz(texto: string, voz: string, signal: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API_BASE}/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texto, voz }),
    signal
  });
  if (!res.ok) throw new Error(await mensagemDeErro(res));
  const tipo = res.headers.get('Content-Type') || 'audio/wav';
  return new Blob([await res.arrayBuffer()], { type: tipo });
}
