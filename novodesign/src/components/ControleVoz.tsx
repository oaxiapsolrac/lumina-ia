import { Volume2, VolumeX } from 'lucide-react';
import { Popover } from 'radix-ui';
import { useEffect, useState } from 'react';
import { VOZES_GEMINI, vozesNativasPt } from '../lib/voz';
import { cn } from '../lib/util';
import { Dica } from './ui';

interface Props {
  ativa: boolean;
  setAtiva: (v: boolean) => void;
  voz: string;
  setVoz: (v: string) => void;
  falando: boolean;
}

/** Um único ícone no cabeçalho abre as opções de voz. */
export function ControleVoz({ ativa, setAtiva, voz, setVoz, falando }: Props) {
  const [nativas, setNativas] = useState<SpeechSynthesisVoice[]>(() => vozesNativasPt());

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const atualizar = () => setNativas(vozesNativasPt());
    window.speechSynthesis.addEventListener('voiceschanged', atualizar);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', atualizar);
  }, []);

  return (
    <Popover.Root>
      <Dica texto="Voz" lado="bottom">
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={`Opções de voz (leitura automática ${ativa ? 'ligada' : 'desligada'})`}
            className={cn(
              'inline-flex size-10 items-center justify-center rounded-full transition hover:bg-surface-2',
              ativa ? 'text-accent' : 'text-muted hover:text-fg',
              falando && 'bg-mauve/15 shadow-[0_0_18px_-4px] shadow-coral/70'
            )}
          >
            {ativa ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
          </button>
        </Popover.Trigger>
      </Dica>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Opções de voz"
          className="z-[150] w-72 space-y-4 rounded-2xl border border-line bg-surface/95 p-4 shadow-2xl backdrop-blur-xl animate-surgir"
        >
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="chave-voz" className="text-sm font-medium">
              Ler respostas em voz alta
            </label>
            <button
              id="chave-voz"
              type="button"
              role="switch"
              aria-checked={ativa}
              onClick={() => setAtiva(!ativa)}
              className={cn(
                'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
                ativa ? 'bg-linear-to-r from-brand-1 to-brand-3' : 'bg-surface-3'
              )}
            >
              <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', ativa ? 'translate-x-5.5' : 'translate-x-0.5')} />
            </button>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="seletor-voz" className="text-sm text-muted">
              Voz
            </label>
            <select
              id="seletor-voz"
              value={voz}
              onChange={(e) => setVoz(e.target.value)}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg"
            >
              <optgroup label="Gemini">
                {VOZES_GEMINI.map((v) => (
                  <option key={v.id} value={`gemini:${v.id}`}>
                    {v.rotulo}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Navegador">
                <option value="auto">Automática</option>
                {nativas.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          <Popover.Arrow className="fill-line" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
