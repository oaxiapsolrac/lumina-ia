export type TipoMidia = 'image' | 'video' | 'audio';

export interface Documento {
  id?: string;
  nome: string;
  pais: string;
  categoria: string;
  tipo?: string;
  detalhes: string;
  score: number;
  /** Citação formal (ex.: "UNESCO UIS Data API (..., CC BY-SA 4.0)"); só nos documentos que a têm. */
  fonte?: string | null;
  /** Links da fonte: primeiro a página pública, depois a consulta exata. */
  urlsFonte?: string[] | null;
}

export interface Contexto {
  porcentagem?: number;
  usados: number;
  maximo: number;
  status?: 'seguro' | 'alerta' | 'critico';
  estimado?: boolean;
  truncado?: boolean;
}

export interface Metricas {
  tempoBuscaVetorialMs?: number;
  tempoLLMMs?: number;
  tempoTotalMs?: number;
  totalDocumentosNoBanco?: number;
  topKSolicitado?: number;
  filtroPais?: string;
  documentosUtilizados?: number;
  contexto?: Contexto;
}

/** Anexo selecionado na sessão atual (tem o conteúdo em base64). */
export interface Anexo {
  id: string;
  tipo: TipoMidia;
  nome: string;
  tamanho: number;
  dataUrl: string;
}

/** Anexo salvo no histórico: só tipo e nome. Históricos antigos guardavam o data URL (string). */
export type MidiaSalva = { tipo: string; nome: string } | string;

export type StatusMensagem = 'gerando' | 'pronta' | 'erro' | 'interrompida';

/** Evento 'verificacao' do servidor: números da resposta que não aparecem nos documentos consultados. */
export interface VerificacaoNumeros {
  status: 'ok' | 'alerta' | 'sem_numeros' | 'nao_verificado';
  total: number;
  verificados: number;
  naoEncontrados: { numero: string; trecho: string }[];
  motivo?: string;
}

export interface Mensagem {
  id: string;
  papel: 'user' | 'lumina';
  texto: string;
  midias?: MidiaSalva[];
  /** Miniaturas dos anexos enviados nesta sessão (não vão para o localStorage). */
  anexos?: Anexo[];
  modelo?: string;
  docs?: Documento[];
  metricas?: Metricas | null;
  query?: string;
  status?: StatusMensagem;
  avaliacao?: 'boa' | 'ruim' | null;
  /** Só é guardada quando há alerta. */
  verificacao?: VerificacaoNumeros | null;
}

export interface Conversa {
  id: string;
  titulo: string;
  modelo: string;
  modeloNome: string;
  criadaEm: string;
  mensagens: Mensagem[];
}

export interface MetadadosStream {
  documentosRecuperados?: Documento[];
  modeloUtilizado?: string;
  queryUtilizada?: string;
  metricas?: Metricas;
}

export interface UsoStream {
  contexto?: Contexto;
  metricas?: Pick<Metricas, 'tempoLLMMs' | 'tempoTotalMs'>;
}
