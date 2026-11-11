import { BookOpenText, ExternalLink, MapPin, Search, Tag, X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import { useState } from 'react';
import type { Fontes } from '../hooks/useChat';
import type { Documento } from '../lib/types';
import { COR_STATUS, cn, formatarMs, formatarNumero, statusDoContexto } from '../lib/util';

interface Props {
  aberta: boolean;
  setAberta: (v: boolean) => void;
  fontes: Fontes | null;
  contexto: { usados: number; maximo: number };
  totalDocumentos: number | null;
}

/** Item da lista de métricas: <div> direto dentro do <dl>, com um <dt> e um <dd> (estrutura válida). */
function Metrica({ rotulo, valor, largo = false }: { rotulo: string; valor: string; largo?: boolean }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-surface-2/60 px-3.5 py-3', largo && 'col-span-2')}>
      <dt className="text-xs text-muted">{rotulo}</dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-fg">{valor}</dd>
    </div>
  );
}

/** Só links http(s) vindos da base viram <a>: evita "javascript:" e outros esquemas. */
function linkSeguro(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Texto curto do link: o domínio e, para consultas de API, a indicação de que é a consulta exata. */
function rotuloLink(url: string, i: number): string {
  const u = new URL(url);
  return i === 0 ? u.hostname : `${u.hostname} (consulta exata)`;
}

function CartaoDocumento({ d, posicao }: { d: Documento; posicao: number }) {
  const [expandido, setExpandido] = useState(false);
  const links = (d.urlsFonte ?? []).map(linkSeguro).filter((u): u is string => Boolean(u)).slice(0, 3);
  const longo = (d.detalhes || '').length > 220;
  const pct = Math.round(Number(d.score) * 100);
  return (
    <li className="rounded-2xl border border-line bg-surface p-4 transition hover:border-mauve/50">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold leading-snug text-fg">
          <span className="mr-1.5 text-muted">{posicao}.</span>
          {d.nome}
        </h3>
        <span
          className="shrink-0 rounded-full bg-emerald-500/12 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
          aria-label={`Relevância ${pct}%`}
        >
          {pct}%
        </span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5">
          <MapPin className="size-3" aria-hidden />
          {d.pais}
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5">
          <Tag className="size-3" aria-hidden />
          {d.categoria}
        </span>
      </div>
      <p className={cn('mt-2.5 text-sm leading-relaxed text-fg/80', !expandido && longo && 'line-clamp-4')}>{d.detalhes}</p>
      {longo && (
        <button
          type="button"
          onClick={() => setExpandido(!expandido)}
          aria-expanded={expandido}
          className="mt-1.5 text-sm font-medium text-accent underline-offset-4 hover:underline"
        >
          {expandido ? 'Mostrar menos' : 'Mostrar mais'}
        </button>
      )}
      {(d.fonte || links.length > 0) && (
        <p className="mt-2.5 border-t border-line pt-2.5 text-xs leading-relaxed text-muted">
          <span className="font-semibold text-fg/80">Fonte: </span>
          {d.fonte}
          {links.map((u, i) => (
            <span key={u}>
              {' · '}
              <a
                href={u}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 font-medium text-accent underline-offset-4 hover:underline"
              >
                {rotuloLink(u, i)}
                <ExternalLink className="size-3" aria-hidden />
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

/** Painel lateral com as fontes recuperadas e as métricas da resposta. */
export function GavetaFontes({ aberta, setAberta, fontes, contexto, totalDocumentos }: Props) {
  const m = fontes?.metricas ?? null;
  const docs = fontes?.docs ?? [];
  const pctReal = contexto.maximo > 0 ? (contexto.usados / contexto.maximo) * 100 : 0;
  const pct = Math.min(100, pctReal);
  const cor = COR_STATUS[statusDoContexto(pct)];

  return (
    <Dialog.Root open={aberta} onOpenChange={setAberta}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-[2px] animate-escurecer" />
        <Dialog.Content className="fixed inset-y-0 right-0 z-[100] flex w-[min(460px,100vw)] flex-col border-l border-line bg-app shadow-2xl outline-none animate-entrar-direita">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
            <Dialog.Title className="flex items-center gap-2 text-base font-semibold">
              <BookOpenText className="size-5 text-accent" aria-hidden />
              Fontes e métricas
            </Dialog.Title>
            <Dialog.Close
              aria-label="Fechar fontes"
              className="inline-flex size-10 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-fg"
            >
              <X className="size-5" aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Documentos da base vetorial usados na resposta e métricas da busca.</Dialog.Description>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {fontes?.query && (
              <p className="flex items-start gap-2 rounded-2xl bg-surface-2/70 px-4 py-3 text-sm">
                <Search className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
                <span>
                  <span className="text-muted">Busca usada: </span>
                  <span className="font-medium">{fontes.query}</span>
                </span>
              </p>
            )}

            <section aria-labelledby="titulo-metricas">
              <h2 id="titulo-metricas" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Métricas
              </h2>
              <dl className="grid grid-cols-2 gap-2">
                <Metrica rotulo="Modelo" valor={fontes?.modelo ?? '—'} largo />
                <Metrica rotulo="Busca vetorial" valor={formatarMs(m?.tempoBuscaVetorialMs)} />
                <Metrica rotulo="Inferência da IA" valor={formatarMs(m?.tempoLLMMs)} />
                <Metrica rotulo="Documentos" valor={m?.documentosUtilizados != null ? `${m.documentosUtilizados} de ${m.topKSolicitado ?? '—'}` : '—'} />
                <Metrica rotulo="Filtro de país" valor={m?.filtroPais ?? 'Todos'} />
                <Metrica rotulo="Base indexada" valor={totalDocumentos != null ? `${formatarNumero(totalDocumentos)} documentos` : '—'} largo />
              </dl>
              <div className="mt-2 rounded-2xl border border-line bg-surface-2/60 px-3.5 py-3">
                <div className="flex items-center justify-between text-xs">
                  <span id="rotulo-uso" className="text-muted">
                    Uso de contexto da conversa
                  </span>
                  {/* A cor do estado fica só na barra: o verde/âmbar como cor de texto não tinha contraste suficiente no tema claro */}
                  <span className="font-semibold tabular-nums text-fg">
                    {contexto.maximo ? `${pctReal.toFixed(1).replace('.', ',')}%` : '—'}
                  </span>
                </div>
                <div
                  role="progressbar"
                  aria-labelledby="rotulo-uso"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(pct)}
                  aria-valuetext={contexto.maximo ? `${formatarNumero(contexto.usados)} de ${formatarNumero(contexto.maximo)} tokens` : 'Ainda não medido'}
                  className="mt-2 h-2 overflow-hidden rounded-full bg-surface-3"
                >
                  <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: cor }} />
                </div>
                {contexto.maximo > 0 && (
                  <p className="mt-1.5 text-xs text-muted">
                    {formatarNumero(contexto.usados)} de {formatarNumero(contexto.maximo)} tokens
                    {contexto.usados > contexto.maximo && ' · janela excedida, inicie uma nova conversa'}
                  </p>
                )}
              </div>
            </section>

            <section aria-labelledby="titulo-docs">
              <h2 id="titulo-docs" className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                Documentos recuperados {docs.length > 0 && `(${docs.length})`}
              </h2>
              {docs.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
                  {fontes ? 'Nenhum documento relevante para esta pergunta com os filtros atuais.' : 'Faça uma pergunta para ver os documentos que a Lumina consultou.'}
                </p>
              ) : (
                <ol className="space-y-2.5">
                  {docs.map((d, i) => (
                    <CartaoDocumento key={`${d.id ?? d.nome}-${i}`} d={d} posicao={i + 1} />
                  ))}
                </ol>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
