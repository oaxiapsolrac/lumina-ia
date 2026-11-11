import { SlidersHorizontal } from 'lucide-react';
import { Popover } from 'radix-ui';
import { OPCOES_TOPK, PAISES } from '../lib/modelos';
import { cn } from '../lib/util';
import { Dica } from './ui';

interface Props {
  pais: string;
  setPais: (v: string) => void;
  topK: number;
  setTopK: (v: number) => void;
}

const classeSelect = 'w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm text-fg';

/** Filtros da busca escondidos atrás de um ícone; o ícone ganha um ponto quando há país filtrado. */
export function Filtros({ pais, setPais, topK, setTopK }: Props) {
  const nomePais = PAISES.find((x) => x.valor === pais)?.nome;
  const ativo = Boolean(pais);

  return (
    <Popover.Root>
      <Dica texto={ativo ? `Filtro: ${nomePais}` : 'Filtros da busca'}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-label={ativo ? `Filtros da busca (país: ${nomePais})` : 'Filtros da busca'}
            className={cn(
              'relative inline-flex size-9 items-center justify-center rounded-full transition hover:bg-surface-2',
              ativo ? 'text-accent' : 'text-muted hover:text-fg'
            )}
          >
            <SlidersHorizontal className="size-[18px]" aria-hidden />
            {ativo && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-coral ring-2 ring-surface" aria-hidden />}
          </button>
        </Popover.Trigger>
      </Dica>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          aria-label="Filtros da busca"
          className="z-[150] w-64 space-y-3 rounded-2xl border border-line bg-surface/95 p-4 shadow-2xl backdrop-blur-xl animate-surgir"
        >
          <div className="space-y-1.5">
            <label htmlFor="filtro-pais" className="text-sm text-muted">
              País
            </label>
            <select id="filtro-pais" className={classeSelect} value={pais} onChange={(e) => setPais(e.target.value)}>
              {PAISES.map((x) => (
                <option key={x.valor} value={x.valor}>
                  {x.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="filtro-topk" className="text-sm text-muted">
              Documentos por resposta
            </label>
            <select id="filtro-topk" className={classeSelect} value={topK} onChange={(e) => setTopK(Number(e.target.value))}>
              {OPCOES_TOPK.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
