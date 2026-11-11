import { useCallback, useEffect, useRef, useState } from 'react';
import { conversarStream } from '../lib/api';
import { carregarConversas, novoId, salvarConversas } from '../lib/historico';
import type { Modelo } from '../lib/modelos';
import type { Anexo, Contexto, Conversa, Documento, Mensagem, Metricas } from '../lib/types';
import { limparTextoParaFala } from '../lib/voz';

export interface Fontes {
  mensagemId: string;
  docs: Documento[];
  metricas: Metricas | null;
  modelo?: string;
  query?: string;
}

export interface ConfigEnvio {
  modelo: Modelo;
  pais: string;
  topK: number;
}

interface Opcoes {
  anunciar: (texto: string) => void;
  aoConcluirResposta?: (mensagem: Mensagem) => void;
}

const CONTEXTO_VAZIO: Pick<Contexto, 'usados' | 'maximo'> = { usados: 0, maximo: 0 };

export function useChat({ anunciar, aoConcluirResposta }: Opcoes) {
  const [conversas, setConversas] = useState<Conversa[]>(() => carregarConversas());
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [gerando, setGerando] = useState(false);
  const [contexto, setContexto] = useState(CONTEXTO_VAZIO);
  const [fontes, setFontes] = useState<Fontes | null>(null);
  const [totalDocumentos, setTotalDocumentos] = useState<number | null>(null);

  // Refs como fonte de verdade síncrona (o streaming atualiza muitas vezes por segundo)
  const mensagensRef = useRef<Mensagem[]>([]);
  const conversasRef = useRef<Conversa[]>(conversas);
  const conversaIdRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef('');
  const rafRef = useRef<number | null>(null);
  const callbacks = useRef({ anunciar, aoConcluirResposta });
  useEffect(() => {
    callbacks.current = { anunciar, aoConcluirResposta };
  });

  const aplicarMensagens = useCallback((fn: (prev: Mensagem[]) => Mensagem[]) => {
    const proximo = fn(mensagensRef.current);
    mensagensRef.current = proximo;
    setMensagens(proximo);
  }, []);

  const atualizarMensagem = useCallback(
    (id: string, fn: (m: Mensagem) => Mensagem) => aplicarMensagens((prev) => prev.map((m) => (m.id === id ? fn(m) : m))),
    [aplicarMensagens]
  );

  const aplicarConversas = useCallback((fn: (prev: Conversa[]) => Conversa[]) => {
    const proximo = fn(conversasRef.current);
    conversasRef.current = proximo;
    setConversas(proximo);
    salvarConversas(proximo);
  }, []);

  const persistir = useCallback(
    (id: string, meta: Omit<Conversa, 'id' | 'mensagens'>) => {
      aplicarConversas((prev) => {
        const existente = prev.find((c) => c.id === id);
        const atual: Conversa = { ...(existente ?? { id, ...meta }), mensagens: mensagensRef.current };
        return existente ? prev.map((c) => (c.id === id ? atual : c)) : [atual, ...prev];
      });
    },
    [aplicarConversas]
  );

  const atualizarContexto = useCallback((c: Pick<Contexto, 'usados' | 'maximo'>) => {
    setContexto((prev) => {
      const usados = Number(c.usados) || 0;
      // Na mesma janela de contexto, o uso da conversa só cresce
      return { usados: c.maximo === prev.maximo ? Math.max(usados, prev.usados) : usados, maximo: c.maximo };
    });
  }, []);

  /** Histórico enviado ao backend: só pares pergunta/resposta concluídos. */
  const montarHistorico = () => {
    const h: { role: 'user' | 'assistant'; content: string }[] = [];
    const msgs = mensagensRef.current;
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      const r = msgs[i + 1];
      if (m.papel === 'user' && r?.papel === 'lumina' && r.texto && r.status !== 'erro' && r.status !== 'gerando') {
        h.push({ role: 'user', content: m.texto || 'Imagem/mídia anexada' }, { role: 'assistant', content: r.texto });
        i++;
      }
    }
    return h;
  };

  const enviar = useCallback(
    async (textoBruto: string, anexos: Anexo[], cfg: ConfigEnvio) => {
      const texto = textoBruto.trim();
      if (abortRef.current || (!texto && anexos.length === 0)) return;

      let id = conversaIdRef.current;
      const nova = !id;
      if (!id) {
        id = novoId('chat');
        conversaIdRef.current = id;
        setConversaId(id);
      }
      const existente = conversasRef.current.find((c) => c.id === id);
      const meta = {
        titulo: existente?.titulo ?? (texto || 'Análise de mídia').slice(0, 48),
        modelo: cfg.modelo.valor,
        modeloNome: cfg.modelo.nome,
        criadaEm: existente?.criadaEm ?? new Date().toISOString()
      };
      if (nova) setContexto(CONTEXTO_VAZIO);

      const historico = montarHistorico();
      const msgUsuario: Mensagem = {
        id: novoId('m'),
        papel: 'user',
        texto,
        midias: anexos.map((a) => ({ tipo: a.tipo, nome: a.nome })),
        anexos
      };
      const idResposta = novoId('m');
      const msgResposta: Mensagem = { id: idResposta, papel: 'lumina', texto: '', modelo: cfg.modelo.nome, status: 'gerando', docs: [], metricas: null };
      aplicarMensagens((prev) => [...prev, msgUsuario, msgResposta]);
      persistir(id, meta);

      setGerando(true);
      callbacks.current.anunciar('Lumina está respondendo.');
      const controle = new AbortController();
      abortRef.current = controle;

      let textoFinal = '';
      let erro: string | null = null;
      let interrompida = false;
      let metricas: Metricas | null = null;

      const descarregar = () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        const pedaco = bufferRef.current;
        bufferRef.current = '';
        if (pedaco) atualizarMensagem(idResposta, (m) => ({ ...m, texto: m.texto + pedaco }));
      };

      try {
        await conversarStream(
          {
            mensagem: texto,
            modelo: cfg.modelo.valor,
            imagens: anexos.map((a) => a.dataUrl),
            historico,
            pais: cfg.pais || null,
            topK: cfg.topK
          },
          {
            onMetadata: (m) => {
              metricas = m.metricas ?? null;
              const docs = m.documentosRecuperados ?? [];
              atualizarMensagem(idResposta, (x) => ({ ...x, docs, metricas, modelo: m.modeloUtilizado || x.modelo, query: m.queryUtilizada }));
              setFontes({ mensagemId: idResposta, docs, metricas, modelo: m.modeloUtilizado, query: m.queryUtilizada });
              if (m.metricas?.totalDocumentosNoBanco) setTotalDocumentos(m.metricas.totalDocumentosNoBanco);
            },
            onToken: (t) => {
              textoFinal += t;
              bufferRef.current += t;
              // Agrupa os tokens por quadro de animação para não renderizar o Markdown a cada token
              if (rafRef.current == null) rafRef.current = requestAnimationFrame(descarregar);
            },
            onUso: (u) => {
              if (u.contexto) atualizarContexto(u.contexto);
              metricas = { ...(metricas ?? {}), ...(u.metricas ?? {}), ...(u.contexto ? { contexto: u.contexto } : {}) };
              const final = metricas;
              atualizarMensagem(idResposta, (x) => ({ ...x, metricas: final }));
              setFontes((f) => (f && f.mensagemId === idResposta ? { ...f, metricas: final } : f));
            },
            onVerificacao: (v) => {
              // Só o alerta interessa na tela e no histórico salvo
              if (v.status === 'alerta' && v.naoEncontrados.length) atualizarMensagem(idResposta, (x) => ({ ...x, verificacao: v }));
            },
            onErro: (msg) => {
              erro = msg;
            }
          },
          controle.signal
        );
      } catch (e) {
        if ((e as Error).name === 'AbortError') interrompida = true;
        else erro = (e as Error).message || 'Erro ao conectar com o servidor.';
      } finally {
        descarregar();
      }

      const status = interrompida ? 'interrompida' : erro && !textoFinal ? 'erro' : 'pronta';
      const textoMsg = status === 'erro' ? (erro as string) : erro ? `${textoFinal}\n\n> ⚠️ **Erro:** ${erro}` : textoFinal;
      atualizarMensagem(idResposta, (m) => ({ ...m, texto: textoMsg, status }));
      persistir(id, meta);

      abortRef.current = null;
      setGerando(false);

      const final = mensagensRef.current.find((m) => m.id === idResposta);
      if (status === 'pronta') {
        callbacks.current.anunciar(`Resposta da Lumina: ${limparTextoParaFala(textoFinal).slice(0, 1500)}`);
        if (final) callbacks.current.aoConcluirResposta?.(final);
      } else if (status === 'erro') {
        callbacks.current.anunciar(`Erro: ${erro}`);
      } else {
        callbacks.current.anunciar('Resposta interrompida.');
      }
    },
    [aplicarMensagens, atualizarContexto, atualizarMensagem, persistir]
  );

  const parar = useCallback(() => abortRef.current?.abort(), []);

  const novaConversa = useCallback(() => {
    abortRef.current?.abort();
    conversaIdRef.current = null;
    setConversaId(null);
    aplicarMensagens(() => []);
    setContexto(CONTEXTO_VAZIO);
    setFontes(null);
  }, [aplicarMensagens]);

  const abrirConversa = useCallback(
    (id: string) => {
      const conv = conversasRef.current.find((c) => c.id === id);
      if (!conv) return;
      abortRef.current?.abort();
      conversaIdRef.current = id;
      setConversaId(id);
      aplicarMensagens(() => conv.mensagens.map((m) => ({ ...m })));
      setContexto(CONTEXTO_VAZIO);
      const ultima = [...conv.mensagens].reverse().find((m) => m.papel === 'lumina' && m.docs && m.docs.length > 0);
      setFontes(ultima ? { mensagemId: ultima.id, docs: ultima.docs ?? [], metricas: ultima.metricas ?? null, modelo: ultima.modelo, query: ultima.query } : null);
      return conv;
    },
    [aplicarMensagens]
  );

  const excluirConversa = useCallback(
    (id: string) => {
      aplicarConversas((prev) => prev.filter((c) => c.id !== id));
      if (conversaIdRef.current === id) novaConversa();
    },
    [aplicarConversas, novaConversa]
  );

  const avaliar = useCallback(
    (mensagemId: string, valor: 'boa' | 'ruim') => {
      atualizarMensagem(mensagemId, (m) => ({ ...m, avaliacao: m.avaliacao === valor ? null : valor }));
      const id = conversaIdRef.current;
      const conv = conversasRef.current.find((c) => c.id === id);
      if (id && conv) persistir(id, conv);
    },
    [atualizarMensagem, persistir]
  );

  const selecionarFontes = useCallback((m: Mensagem) => {
    setFontes({ mensagemId: m.id, docs: m.docs ?? [], metricas: m.metricas ?? null, modelo: m.modelo, query: m.query });
  }, []);

  return {
    conversas,
    conversaId,
    mensagens,
    gerando,
    contexto,
    fontes,
    totalDocumentos,
    setTotalDocumentos,
    enviar,
    parar,
    novaConversa,
    abrirConversa,
    excluirConversa,
    avaliar,
    selecionarFontes
  };
}
