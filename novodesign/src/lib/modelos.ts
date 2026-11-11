import type { TipoMidia } from './types';

export interface Modelo {
  /** Valor enviado ao backend no campo "modelo". */
  valor: string;
  /** Rótulo curto exibido no botão do seletor. */
  rotulo: string;
  nome: string;
  descricao: string;
  selo: string;
  grupo: 'nuvem' | 'local';
  /** Tipos de anexo aceitos (espelha backend/anexos.js). */
  midias: TipoMidia[];
}

export const MODELOS: Modelo[] = [
  { valor: 'groq', rotulo: 'Groq', nome: 'Groq (GPT-OSS 120B)', descricao: 'Respostas mais rápidas', selo: 'Rápido', grupo: 'nuvem', midias: [] },
  { valor: 'gemini', rotulo: 'Flash', nome: 'Gemini 2.5 Flash', descricao: 'Ajuda para tudo', selo: 'Google', grupo: 'nuvem', midias: [] },
  { valor: 'nemotron-3-nano-omni', rotulo: 'Nano Omni', nome: 'Nemotron 3 Nano Omni', descricao: 'Visão e análise de arquivos', selo: 'Multimodal', grupo: 'nuvem', midias: ['image', 'video', 'audio'] },
  { valor: 'nemotron-3-super-120b', rotulo: 'Nemotron 120B', nome: 'Nemotron 3.5 Super 120B', descricao: 'Raciocínio avançado MoE', selo: 'NVIDIA', grupo: 'nuvem', midias: [] },
  { valor: 'mistral-large', rotulo: 'Mistral 4', nome: 'Mistral Large 4', descricao: '1T MoE multimodal e raciocínio', selo: 'Multimodal', grupo: 'nuvem', midias: ['image'] },
  { valor: 'gpt-oss-120b', rotulo: 'GPT-OSS 120B', nome: 'GPT-OSS 120B', descricao: 'Raciocínio complexo open-source', selo: 'Groq', grupo: 'nuvem', midias: [] },
  { valor: 'minimax-m3.1-flash', rotulo: 'MiniMax 3.1', nome: 'MiniMax M3.1 Flash', descricao: 'Rápido com raciocínio', selo: 'NVIDIA', grupo: 'nuvem', midias: [] },
  { valor: 'gpt-oss-20b', rotulo: 'GPT-OSS 20B', nome: 'GPT-OSS 20B', descricao: 'Raciocínio open-source leve', selo: 'NVIDIA', grupo: 'nuvem', midias: [] },
  { valor: 'phi-3-mini', rotulo: 'Phi-3', nome: 'Phi-3 Mini', descricao: 'Processamento local eficiente', selo: 'Local', grupo: 'local', midias: [] },
  { valor: 'gemma-2-2b', rotulo: 'Gemma 2', nome: 'Gemma 2 2B', descricao: 'Execução local ultraleve', selo: 'Local', grupo: 'local', midias: [] },
  { valor: 'qwen', rotulo: 'Qwen 2.5', nome: 'Qwen 2.5 1.5B', descricao: 'SLM local ou remoto via Ollama', selo: 'SLM', grupo: 'local', midias: [] }
];

export const MODELO_PADRAO = MODELOS[0];

export function acharModelo(valor: string | undefined | null): Modelo {
  return MODELOS.find((m) => m.valor === valor) ?? MODELO_PADRAO;
}

export const LIMITE_ANEXOS: Record<TipoMidia, number> = { image: 8, video: 1, audio: 1 };
/** O servidor aceita 25 MB por requisição; base64 aumenta ~33%. */
export const LIMITE_TOTAL_ANEXOS_MB = 18;

export const ROTULO_MIDIA: Record<TipoMidia, string> = { image: 'Imagem', video: 'Vídeo', audio: 'Áudio' };

export const ACEITE_MIDIA: Record<TipoMidia, string> = {
  image: 'image/png,image/jpeg,image/webp',
  video: 'video/mp4,video/quicktime,video/webm',
  audio: 'audio/wav,audio/mpeg,audio/mp3'
};

export const PAISES = [
  { valor: '', nome: 'Todos os países' },
  { valor: 'Brasil', nome: 'Brasil' },
  { valor: 'Bolivia', nome: 'Bolívia' },
  { valor: 'Peru', nome: 'Peru' },
  { valor: 'Mexico', nome: 'México' },
  { valor: 'Chile', nome: 'Chile' },
  { valor: 'Argentina', nome: 'Argentina' },
  { valor: 'Colombia', nome: 'Colômbia' }
];

export const OPCOES_TOPK = [3, 4, 6, 8];
