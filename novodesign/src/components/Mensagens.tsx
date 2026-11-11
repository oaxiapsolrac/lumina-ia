import { AlertTriangle, BookOpenText, Check, Copy, FileAudio, FileVideo, ImageIcon, Loader2, RotateCcw, Square, ThumbsDown, ThumbsUp, Volume2 } from 'lucide-react';
import { motion } from 'motion/react';
import { useEffect, useState } from 'react';
import type { Mensagem, MidiaSalva } from '../lib/types';
import type { EstadoLeitura } from '../lib/voz';
import { cn } from '../lib/util';
import { Markdown } from './Markdown';
import { BotaoIcone, LogoLumina } from './ui';

interface Props {
  mensagens: Mensagem[];
  lendoId: string | null;
  estadoLeitura: EstadoLeitura;
  onOuvir: (m: Mensagem) => void;
  onCopiar: (m: Mensagem) => void;
  onAvaliar: (id: string, v: 'boa' | 'ruim') => void;
  onFontes: (m: Mensagem) => void;
  onTentarNovamente: (texto: string) => void;
}

export function Mensagens(p: Props) {
  const ultimaId = [...p.mensagens].reverse().find((m) => m.papel === 'lumina')?.id;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-48 pt-6">
      <h1 className="sr-only">Conversa com a Lumina</h1>
      {p.mensagens.map((m, i) =>
        m.papel === 'user' ? (
          <MensagemUsuario key={m.id} m={m} />
        ) : (
          <MensagemLumina key={m.id} m={m} {...p} ultima={m.id === ultimaId} perguntaAnterior={p.mensagens[i - 1]?.texto ?? ''} />
        )
      )}
    </div>
  );
}

const entrada = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const } };

function MensagemUsuario({ m }: { m: Mensagem }) {
  const temMidia = Boolean(m.anexos?.length || m.midias?.length);
  return (
    <motion.article {...entrada} aria-label="Sua mensagem" className="flex flex-col items-end gap-2">
      {/* Títulos ocultos permitem pular de mensagem em mensagem pelo leitor de tela (tecla H) */}
      <h2 className="sr-only">Você disse</h2>
      {temMidia && (
        <div className="flex flex-wrap justify-end gap-2">
          {m.anexos?.length
            ? m.anexos.map((a) =>
                a.tipo === 'image' ? (
                  <img key={a.id} src={a.dataUrl} alt={`Imagem anexada: ${a.nome}`} className="max-h-48 max-w-60 rounded-2xl border border-line object-cover" />
                ) : a.tipo === 'video' ? (
                  <video key={a.id} src={a.dataUrl} controls aria-label={`Vídeo anexado: ${a.nome}`} className="max-h-48 max-w-60 rounded-2xl border border-line" />
                ) : (
                  <audio key={a.id} src={a.dataUrl} controls aria-label={`Áudio anexado: ${a.nome}`} className="max-w-60" />
                )
              )
            : m.midias?.map((f, i) => <ChipMidia key={i} f={f} />)}
        </div>
      )}
      {m.texto && (
        <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl rounded-br-lg bg-user-bubble px-5 py-3 text-[0.98rem] leading-relaxed text-fg">
          {m.texto}
        </div>
      )}
    </motion.article>
  );
}

function ChipMidia({ f }: { f: MidiaSalva }) {
  if (typeof f === 'string') {
    if (f.startsWith('data:image')) return <img src={f} alt="Imagem anexada" className="max-h-48 max-w-60 rounded-2xl border border-line object-cover" />;
    return <span className="rounded-full bg-surface-2 px-3 py-1 text-xs text-muted">Anexo</span>;
  }
  const Icone = f.tipo === 'video' ? FileVideo : f.tipo === 'audio' ? FileAudio : ImageIcon;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
      <Icone className="size-3.5" aria-hidden />
      {f.nome}
    </span>
  );
}

function Pensando() {
  // No plano gratuito o Render "dorme"; a primeira resposta pode levar até um minuto
  const [demorando, setDemorando] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDemorando(true), 8000);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className="texto-pensando py-1 text-[0.95rem] font-medium motion-safe:animate-shimmer">
      {demorando ? 'Acordando o servidor…' : 'Pensando…'}
    </p>
  );
}

/** Checagem de números do servidor: avisa quando algum número da resposta não aparece nos documentos consultados. */
function AvisoNumeros({ m }: { m: Mensagem }) {
  const faltando = m.verificacao?.status === 'alerta' ? m.verificacao.naoEncontrados : [];
  if (!faltando.length) return null;
  return (
    <p
      role="note"
      className="mt-3 flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm leading-relaxed text-amber-900 dark:text-amber-200"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {faltando.length === 1 ? 'Este número não aparece' : 'Estes números não aparecem'} nos documentos consultados:{' '}
        {faltando.map((n, i) => (
          <span key={n.numero}>
            {i > 0 && ', '}
            <strong className="font-semibold">{n.numero}</strong>
          </span>
        ))}
        . Pode ser um cálculo do modelo ou um erro; confira nas fontes.
      </span>
    </p>
  );
}

function MensagemLumina({ m, perguntaAnterior, ultima, ...p }: Props & { m: Mensagem; perguntaAnterior: string; ultima: boolean }) {
  const [copiado, setCopiado] = useState(false);
  const gerando = m.status === 'gerando';
  const lendo = p.lendoId === m.id;
  const qtdDocs = m.docs?.length ?? 0;

  const copiar = () => {
    p.onCopiar(m);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  return (
    <motion.article {...entrada} aria-label="Resposta da Lumina" aria-busy={gerando} className="group/msg flex gap-3 sm:gap-4">
      <LogoLumina tamanho={30} animado={gerando} className="mt-0.5" />
      <div className="min-w-0 flex-1 pt-0.5">
        <h2 className="sr-only">A Lumina disse</h2>
        {m.status === 'erro' ? (
          <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
            <p className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
              <span>{m.texto}</span>
            </p>
            {perguntaAnterior && (
              <button
                type="button"
                onClick={() => p.onTentarNovamente(perguntaAnterior)}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 font-medium hover:bg-surface-2"
              >
                <RotateCcw className="size-4" aria-hidden />
                Tentar novamente
              </button>
            )}
          </div>
        ) : gerando && !m.texto ? (
          <Pensando />
        ) : (
          <>
            <Markdown texto={m.texto} />
            {gerando && <span aria-hidden className="ml-0.5 inline-block h-4 w-2 translate-y-0.5 rounded-sm bg-coral motion-safe:animate-pulse" />}
            {m.status === 'interrompida' && <p className="mt-2 text-sm italic text-muted">Interrompida.</p>}
            {!gerando && <AvisoNumeros m={m} />}
          </>
        )}

        {!gerando && m.status !== 'erro' && (
          <div
            className={cn(
              'mt-2 flex flex-wrap items-center gap-0.5 transition-opacity',
              // Só a última resposta mostra as ações o tempo todo; as anteriores, ao passar o mouse ou focar
              !ultima && '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover/msg:opacity-100 group-focus-within/msg:opacity-100'
            )}
          >
            <BotaoIcone rotulo={lendo ? 'Parar leitura' : 'Ouvir'} aria-pressed={lendo} onClick={() => p.onOuvir(m)} className="size-9">
              {lendo && p.estadoLeitura === 'carregando' ? (
                <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden />
              ) : lendo ? (
                <Square className="size-3.5 fill-current" aria-hidden />
              ) : (
                <Volume2 className="size-4" aria-hidden />
              )}
            </BotaoIcone>
            <BotaoIcone rotulo={copiado ? 'Copiado' : 'Copiar'} onClick={copiar} className="size-9">
              {copiado ? <Check className="size-4 text-green-500" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            </BotaoIcone>
            <BotaoIcone rotulo="Boa resposta" aria-pressed={m.avaliacao === 'boa'} onClick={() => p.onAvaliar(m.id, 'boa')} className="size-9">
              <ThumbsUp className={cn('size-4', m.avaliacao === 'boa' && 'fill-current')} aria-hidden />
            </BotaoIcone>
            <BotaoIcone rotulo="Resposta ruim" aria-pressed={m.avaliacao === 'ruim'} onClick={() => p.onAvaliar(m.id, 'ruim')} className="size-9">
              <ThumbsDown className={cn('size-4', m.avaliacao === 'ruim' && 'fill-current')} aria-hidden />
            </BotaoIcone>
            {qtdDocs > 0 && (
              <button
                type="button"
                onClick={() => p.onFontes(m)}
                aria-haspopup="dialog"
                className="ml-1 inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted transition hover:bg-surface-2 hover:text-fg"
              >
                <BookOpenText className="size-4" aria-hidden />
                {qtdDocs} {qtdDocs === 1 ? 'fonte' : 'fontes'}
              </button>
            )}
          </div>
        )}

      </div>
    </motion.article>
  );
}
