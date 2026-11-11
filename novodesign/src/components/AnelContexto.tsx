import { COR_STATUS, formatarNumero, statusDoContexto } from '../lib/util';
import { Dica } from './ui';

interface Props {
  usados: number;
  maximo: number;
  onClick: () => void;
}

const CIRCUNFERENCIA = 2 * Math.PI * 9;

/** Só o anel; os números ficam na dica e no nome acessível. Aparece depois da primeira resposta. */
export function AnelContexto({ usados, maximo, onClick }: Props) {
  if (maximo <= 0) return null;
  const pctReal = Number(((usados / maximo) * 100).toFixed(1));
  const pct = Math.min(100, pctReal);
  const cor = COR_STATUS[statusDoContexto(pct)];
  const descricao = `Contexto usado: ${pctReal.toLocaleString('pt-BR')}% (${formatarNumero(usados)} de ${formatarNumero(maximo)} tokens)${
    usados > maximo ? '. Janela excedida, inicie uma nova conversa' : ''
  }`;

  return (
    <Dica texto={descricao}>
      <button
        type="button"
        onClick={onClick}
        aria-label={descricao}
        className="inline-flex size-9 items-center justify-center rounded-full transition hover:bg-surface-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false" className="-rotate-90">
          <circle cx="12" cy="12" r="9" fill="none" strokeWidth="3" className="stroke-surface-3" />
          <circle
            cx="12"
            cy="12"
            r="9"
            fill="none"
            strokeWidth="3"
            strokeLinecap="round"
            stroke={cor}
            strokeDasharray={CIRCUNFERENCIA}
            strokeDashoffset={CIRCUNFERENCIA - (pct / 100) * CIRCUNFERENCIA}
            style={{ transition: 'stroke-dashoffset .4s ease, stroke .4s ease' }}
          />
        </svg>
      </button>
    </Dica>
  );
}
