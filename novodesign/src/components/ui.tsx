import type { ComponentProps, ReactNode } from 'react';
import { Tooltip } from 'radix-ui';
import { cn } from '../lib/util';

/** Dica acessível: aparece no foco do teclado e no hover, sem substituir o aria-label. */
export function Dica({ texto, children, lado = 'top' }: { texto: string; children: ReactNode; lado?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={lado}
          sideOffset={6}
          className="z-[200] max-w-xs rounded-lg bg-fg px-2.5 py-1.5 text-xs font-medium text-app shadow-lg animate-surgir"
        >
          {texto}
          <Tooltip.Arrow className="fill-fg" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

type BotaoIconeProps = ComponentProps<'button'> & { rotulo: string; dica?: string; ladoDica?: 'top' | 'bottom' | 'left' | 'right' };

/** Botão só com ícone: nome acessível via aria-label e alvo de toque de 40px. */
export function BotaoIcone({ rotulo, dica, ladoDica, className, children, ...props }: BotaoIconeProps) {
  return (
    <Dica texto={dica ?? rotulo} lado={ladoDica}>
      <button
        type="button"
        aria-label={rotulo}
        className={cn(
          'inline-flex size-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors',
          'hover:bg-surface-2 hover:text-fg disabled:pointer-events-none disabled:opacity-40',
          'aria-pressed:text-accent',
          className
        )}
        {...props}
      >
        {children}
      </button>
    </Dica>
  );
}

/** Estrela da Lumina com o gradiente do Projeto ELLAS. Gira quando está gerando. */
export function LogoLumina({ tamanho = 32, animado = false, className }: { tamanho?: number; animado?: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full', className)}
      style={{ width: tamanho, height: tamanho }}
    >
      {animado && (
        <span className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,#6c567b,#c06c84,#f67280,#355c7d,#6c567b)] opacity-80 blur-[3px] motion-safe:animate-spin-slow" />
      )}
      <span className="absolute inset-[2px] rounded-full bg-linear-135 from-brand-1 via-brand-2 to-brand-3" />
      <svg viewBox="0 0 24 24" className="relative size-[55%] fill-white" focusable="false">
        <path d="M12 2.5l2.3 6.6 6.7 2.4-6.7 2.4L12 20.5l-2.3-6.6L3 11.5l6.7-2.4z" />
      </svg>
    </span>
  );
}

export function TextoOculto({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span id={id} className="sr-only">
      {children}
    </span>
  );
}
