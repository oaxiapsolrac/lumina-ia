import { ArrowUp, FileAudio, FileVideo, ImageIcon, Paperclip, Square, X } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react';
import { ACEITE_MIDIA, LIMITE_ANEXOS, LIMITE_TOTAL_ANEXOS_MB, ROTULO_MIDIA, type Modelo } from '../lib/modelos';
import type { Anexo, TipoMidia } from '../lib/types';
import { cn, lerArquivoComoDataUrl } from '../lib/util';
import { AnelContexto } from './AnelContexto';
import { Filtros } from './Filtros';
import { SeletorModelo } from './SeletorModelo';
import { BotaoIcone, Dica } from './ui';

export interface CompositorHandle {
  focar: () => void;
  preencher: (texto: string) => void;
}

interface Props {
  gerando: boolean;
  /** Degradê atrás do compositor para o texto da conversa sumir suavemente; desligado na tela inicial. */
  comFundo: boolean;
  onEnviar: (texto: string, anexos: Anexo[]) => void;
  onParar: () => void;
  modelo: Modelo;
  setModelo: (m: Modelo) => void;
  contexto: { usados: number; maximo: number };
  onAbrirFontes: () => void;
  anunciar: (t: string) => void;
  pais: string;
  setPais: (v: string) => void;
  topK: number;
  setTopK: (v: number) => void;
}

const ICONE_MIDIA = { image: ImageIcon, video: FileVideo, audio: FileAudio } as const;
const LIMITE_CURTO: Record<TipoMidia, string> = { image: 'Até 8', video: 'Até 1', audio: 'Até 1' };

let seq = 0;

export const Compositor = forwardRef<CompositorHandle, Props>(function Compositor(p, ref) {
  const [texto, setTexto] = useState('');
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const entradas = useRef<Partial<Record<TipoMidia, HTMLInputElement | null>>>({});
  const midias = p.modelo.midias;

  useImperativeHandle(ref, () => ({
    focar: () => areaRef.current?.focus(),
    preencher: (t: string) => {
      setTexto(t);
      requestAnimationFrame(() => areaRef.current?.focus());
    }
  }));

  // Ajusta a altura do campo ao conteúdo (até ~8 linhas)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [texto]);

  // Ao trocar de modelo, descarta anexos que o novo modelo não aceita
  useEffect(() => {
    setAnexos((prev) => prev.filter((a) => midias.includes(a.tipo)));
  }, [midias]);

  const adicionarArquivos = async (arquivos: File[], tipo: TipoMidia) => {
    const avisos: string[] = [];
    const novos: Anexo[] = [];
    let total = anexos.reduce((s, a) => s + a.tamanho, 0);
    for (const arq of arquivos) {
      const jaTem = anexos.filter((a) => a.tipo === tipo).length + novos.length;
      if (jaTem >= LIMITE_ANEXOS[tipo]) {
        avisos.push(`Limite de ${LIMITE_ANEXOS[tipo]} ${ROTULO_MIDIA[tipo].toLowerCase()}(s) por mensagem.`);
        break;
      }
      if (total + arq.size > LIMITE_TOTAL_ANEXOS_MB * 1024 * 1024) {
        avisos.push(`"${arq.name}" ultrapassa o limite total de ${LIMITE_TOTAL_ANEXOS_MB} MB.`);
        continue;
      }
      total += arq.size;
      novos.push({ id: `a${seq++}`, tipo, nome: arq.name, tamanho: arq.size, dataUrl: await lerArquivoComoDataUrl(arq) });
    }
    if (novos.length) {
      setAnexos((prev) => [...prev, ...novos]);
      p.anunciar(`${novos.length} anexo(s) adicionado(s).`);
    }
    setAviso(avisos.length ? avisos.join(' ') : null);
  };

  const enviar = () => {
    if (p.gerando || (!texto.trim() && anexos.length === 0)) return;
    p.onEnviar(texto, anexos);
    setTexto('');
    setAnexos([]);
    setAviso(null);
  };

  const aoTeclar = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter envia; Shift+Enter quebra linha; não envia durante composição de acentos (IME)
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      enviar();
    }
  };

  const podeEnviar = !p.gerando && (texto.trim().length > 0 || anexos.length > 0);

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-8 sm:px-4',
        p.comFundo && 'bg-linear-to-t from-app via-app/95 to-transparent'
      )}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-3xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar();
          }}
          aria-label="Enviar mensagem para a Lumina"
          className="group/compositor rounded-[28px] bg-line p-px transition-[background] focus-within:bg-linear-to-r focus-within:from-plum focus-within:via-mauve focus-within:to-coral"
          style={{ boxShadow: 'var(--shadow-composer)' }}
          onPaste={(e) => {
            const imagens = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
            if (imagens.length && midias.includes('image')) {
              e.preventDefault();
              void adicionarArquivos(imagens, 'image');
            }
          }}
        >
          <div className="rounded-[27px] bg-surface/95 backdrop-blur-xl">
            <AnimatePresence initial={false}>
              {anexos.length > 0 && (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  aria-label="Anexos selecionados"
                  className="flex flex-wrap gap-2 overflow-hidden px-4 pt-3"
                >
                  {anexos.map((a) => {
                    const Icone = ICONE_MIDIA[a.tipo];
                    return (
                      <li key={a.id} className="relative">
                        {a.tipo === 'image' ? (
                          <img src={a.dataUrl} alt={a.nome} className="size-16 rounded-xl border border-line object-cover" />
                        ) : (
                          <span className="flex h-16 w-36 items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 text-xs text-muted">
                            <Icone className="size-5 shrink-0 text-accent" aria-hidden />
                            <span className="truncate">{a.nome}</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => setAnexos((prev) => prev.filter((x) => x.id !== a.id))}
                          aria-label={`Remover anexo ${a.nome}`}
                          className="absolute -right-2 -top-2 inline-flex size-6 items-center justify-center rounded-full border border-line bg-surface text-fg shadow hover:bg-red-500 hover:text-white"
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </motion.ul>
              )}
            </AnimatePresence>

            <label htmlFor="caixa-mensagem" className="sr-only">
              Mensagem para a Lumina
            </label>
            <textarea
              id="caixa-mensagem"
              ref={areaRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={aoTeclar}
              rows={1}
              placeholder="Pergunte à Lumina"
              aria-describedby="dica-teclado"
              className="block max-h-[220px] w-full resize-none bg-transparent px-5 pb-1 pt-4 text-base leading-relaxed text-fg outline-none placeholder:text-muted focus-visible:outline-none"
            />

            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
              <div className="flex items-center gap-1">
                {midias.length > 0 && (
                  <DropdownMenu.Root modal={false}>
                    <Dica texto="Anexar arquivo">
                      <DropdownMenu.Trigger asChild>
                        <button
                          type="button"
                          aria-label="Anexar arquivo"
                          className={cn(
                            'inline-flex size-9 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-fg',
                            anexos.length > 0 && 'text-accent'
                          )}
                        >
                          <Paperclip className="size-[18px]" aria-hidden />
                        </button>
                      </DropdownMenu.Trigger>
                    </Dica>
                    <DropdownMenu.Portal>
                      <DropdownMenu.Content
                        side="top"
                        align="start"
                        sideOffset={10}
                        className="z-[150] w-64 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-2xl backdrop-blur-xl animate-surgir"
                      >
                        {midias.map((tipo) => {
                          const Icone = ICONE_MIDIA[tipo];
                          return (
                            <DropdownMenu.Item
                              key={tipo}
                              onSelect={() => entradas.current[tipo]?.click()}
                              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 outline-none data-[highlighted]:bg-surface-2"
                            >
                              <Icone className="size-[18px] text-accent" aria-hidden />
                              <span>
                                <span className="block text-sm font-medium">{ROTULO_MIDIA[tipo]}</span>
                                <span className="block text-xs text-muted">{LIMITE_CURTO[tipo]}</span>
                              </span>
                            </DropdownMenu.Item>
                          );
                        })}
                      </DropdownMenu.Content>
                    </DropdownMenu.Portal>
                  </DropdownMenu.Root>
                )}
                {midias.map((tipo) => (
                  <input
                    key={tipo}
                    ref={(el) => {
                      entradas.current[tipo] = el;
                    }}
                    type="file"
                    accept={ACEITE_MIDIA[tipo]}
                    multiple={tipo === 'image'}
                    hidden
                    tabIndex={-1}
                    aria-hidden="true"
                    onChange={(e) => {
                      const arquivos = Array.from(e.target.files ?? []);
                      e.target.value = '';
                      void adicionarArquivos(arquivos, tipo);
                    }}
                  />
                ))}
                <Filtros pais={p.pais} setPais={p.setPais} topK={p.topK} setTopK={p.setTopK} />
                <SeletorModelo modelo={p.modelo} setModelo={p.setModelo} desabilitado={p.gerando} />
              </div>

              <div className="flex items-center gap-1">
                <AnelContexto usados={p.contexto.usados} maximo={p.contexto.maximo} onClick={p.onAbrirFontes} />
                {p.gerando ? (
                  <BotaoIcone rotulo="Parar resposta" onClick={p.onParar} className="size-9 bg-fg text-app hover:bg-fg/85 hover:text-app">
                    <Square className="size-3.5 fill-current" aria-hidden />
                  </BotaoIcone>
                ) : (
                  <BotaoIcone
                    rotulo="Enviar mensagem"
                    type="submit"
                    disabled={!podeEnviar}
                    className={cn(
                      'size-9 text-white disabled:opacity-100',
                      podeEnviar
                        ? 'bg-linear-135 from-brand-1 via-brand-2 to-brand-3 shadow-[0_6px_20px_-6px] shadow-mauve hover:brightness-110 hover:text-white'
                        : 'bg-surface-3 text-muted'
                    )}
                  >
                    <ArrowUp className="size-[18px]" strokeWidth={2.5} aria-hidden />
                  </BotaoIcone>
                )}
              </div>
            </div>
          </div>
        </form>

        {aviso && (
          <p role="alert" className="mt-2 text-center text-sm text-red-500">
            {aviso}
          </p>
        )}
        <p className="mt-2 text-center text-xs text-muted">
          A Lumina pode cometer erros.
          <span id="dica-teclado" className="sr-only">
            Enter envia a mensagem. Shift mais Enter quebra a linha.
          </span>
        </p>
      </div>
    </div>
  );
});
