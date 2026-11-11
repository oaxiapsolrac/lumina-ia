import { PanelLeftClose, SquarePen, Trash2, X } from 'lucide-react';
import { useMemo } from 'react';
import type { Conversa } from '../lib/types';
import { cn } from '../lib/util';
import { BotaoIcone, LogoLumina } from './ui';

interface Props {
  conversas: Conversa[];
  conversaId: string | null;
  onNova: () => void;
  onAbrir: (id: string) => void;
  onExcluir: (id: string) => void;
  onFechar: () => void;
  modoGaveta: boolean;
}

function agrupar(conversas: Conversa[]) {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = 86_400_000;
  const grupos: { titulo: string; itens: Conversa[] }[] = [
    { titulo: 'Hoje', itens: [] },
    { titulo: 'Ontem', itens: [] },
    { titulo: 'Últimos 7 dias', itens: [] },
    { titulo: 'Mais antigas', itens: [] }
  ];
  for (const c of conversas) {
    const t = new Date(c.criadaEm).getTime() || 0;
    if (t >= hoje.getTime()) grupos[0].itens.push(c);
    else if (t >= hoje.getTime() - dia) grupos[1].itens.push(c);
    else if (t >= hoje.getTime() - 7 * dia) grupos[2].itens.push(c);
    else grupos[3].itens.push(c);
  }
  return grupos.filter((g) => g.itens.length > 0);
}

export function BarraLateral(p: Props) {
  const grupos = useMemo(() => agrupar(p.conversas), [p.conversas]);

  const excluir = (c: Conversa) => {
    if (window.confirm(`Excluir a conversa "${c.titulo}"?`)) p.onExcluir(c.id);
  };

  return (
    <nav aria-label="Conversas" className="flex h-full w-full flex-col gap-4 bg-surface p-3">
      <div className="flex items-center justify-between gap-2 px-1 pt-1">
        <div className="flex items-center gap-2.5">
          <LogoLumina tamanho={28} />
          <span className="text-lg font-semibold tracking-tight">Lumina</span>
        </div>
        <BotaoIcone rotulo="Fechar barra lateral" onClick={p.onFechar} ladoDica="right">
          {p.modoGaveta ? <X className="size-5" aria-hidden /> : <PanelLeftClose className="size-5" aria-hidden />}
        </BotaoIcone>
      </div>

      <button
        type="button"
        onClick={p.onNova}
        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-fg transition hover:bg-surface-2"
      >
        <SquarePen className="size-[18px] text-accent" aria-hidden />
        Nova conversa
      </button>

      <h2 className="sr-only">Conversas recentes</h2>
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        {grupos.map((g) => (
          <div key={g.titulo} className="mb-4">
            <h3 className="px-3 pb-1 text-xs font-medium text-muted">{g.titulo}</h3>
            <ul className="space-y-0.5">
              {g.itens.map((c) => {
                const ativa = c.id === p.conversaId;
                return (
                  <li key={c.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => p.onAbrir(c.id)}
                      aria-current={ativa ? 'page' : undefined}
                      className={cn(
                        'w-full truncate rounded-xl py-2.5 pl-3 pr-11 text-left text-sm transition-colors',
                        ativa ? 'bg-surface-3 font-medium text-fg' : 'text-fg/85 hover:bg-surface-2'
                      )}
                    >
                      {c.titulo}
                    </button>
                    <button
                      type="button"
                      onClick={() => excluir(c)}
                      aria-label={`Excluir conversa: ${c.titulo}`}
                      className="absolute right-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:bg-red-500/15 hover:text-red-500 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
