import { Check, ChevronDown, Cloud, Cpu } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { MODELOS, type Modelo } from '../lib/modelos';
import { Dica } from './ui';

interface Props {
  modelo: Modelo;
  setModelo: (m: Modelo) => void;
  desabilitado?: boolean;
}

/** Menu de modelos com navegação por setas, Enter e Esc (Radix DropdownMenu). */
export function SeletorModelo({ modelo, setModelo, desabilitado }: Props) {
  const grupos = [
    { titulo: 'Nuvem', icone: Cloud, itens: MODELOS.filter((m) => m.grupo === 'nuvem') },
    { titulo: 'Local (Ollama)', icone: Cpu, itens: MODELOS.filter((m) => m.grupo === 'local') }
  ];

  return (
    // modal={false}: não esconde o resto da página do leitor de tela enquanto o menu está aberto
    <DropdownMenu.Root modal={false}>
      <Dica texto="Trocar modelo de IA">
        <DropdownMenu.Trigger asChild disabled={desabilitado}>
          <button
            type="button"
            aria-label={`Modelo: ${modelo.nome}. Trocar modelo`}
            className="group inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-3 text-sm font-medium text-fg transition hover:border-mauve/50 disabled:opacity-50 data-[state=open]:border-mauve/70"
          >
            <span className="size-2 rounded-full bg-linear-135 from-plum to-coral" aria-hidden />
            {modelo.rotulo}
            <ChevronDown className="size-4 text-muted transition-transform group-data-[state=open]:rotate-180" aria-hidden />
          </button>
        </DropdownMenu.Trigger>
      </Dica>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={10}
          collisionPadding={12}
          className="z-[150] max-h-[min(70vh,560px)] w-[min(92vw,360px)] overflow-y-auto rounded-3xl border border-line bg-surface/95 p-2 shadow-2xl backdrop-blur-xl animate-surgir"
        >
          <DropdownMenu.RadioGroup
            value={modelo.valor}
            onValueChange={(v) => {
              const m = MODELOS.find((x) => x.valor === v);
              if (m) setModelo(m);
            }}
          >
            {grupos.map((g, gi) => (
              <div key={g.titulo}>
                {gi > 0 && <DropdownMenu.Separator className="mx-2 my-1.5 h-px bg-line" />}
                <DropdownMenu.Label className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  <g.icone className="size-3.5" aria-hidden />
                  {g.titulo}
                </DropdownMenu.Label>
                {g.itens.map((m) => (
                  <DropdownMenu.RadioItem
                    key={m.valor}
                    value={m.valor}
                    className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 outline-none transition-colors data-[highlighted]:bg-surface-2 data-[state=checked]:bg-mauve/10"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center">
                      <DropdownMenu.ItemIndicator>
                        <Check className="size-4 text-accent" aria-hidden />
                      </DropdownMenu.ItemIndicator>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">{m.nome}</span>
                      <span className="block text-xs text-muted">{m.descricao}</span>
                    </span>
                    <span className="shrink-0 rounded-full bg-surface-3 px-2 py-0.5 text-[0.7rem] font-medium text-fg/80">{m.selo}</span>
                  </DropdownMenu.RadioItem>
                ))}
              </div>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
