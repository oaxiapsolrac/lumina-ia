import { Check, Copy } from 'lucide-react';
import { memo, useRef, useState, type ComponentProps } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** Bloco de código com cabeçalho e botão de copiar, como no ChatGPT. */
function BlocoCodigo(props: ComponentProps<'pre'>) {
  const ref = useRef<HTMLPreElement>(null);
  const [copiado, setCopiado] = useState(false);
  const filho = props.children as { props?: { className?: string } } | undefined;
  const linguagem = /language-(\w+)/.exec(filho?.props?.className || '')?.[1] ?? 'texto';

  const copiar = async () => {
    await navigator.clipboard.writeText(ref.current?.innerText ?? '');
    setCopiado(true);
    setTimeout(() => setCopiado(false), 1500);
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-code">
      <div className="flex items-center justify-between border-b border-line px-4 py-1.5 text-xs text-muted">
        <span>{linguagem}</span>
        <button type="button" onClick={copiar} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 hover:bg-surface-2 hover:text-fg">
          {copiado ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copiado ? 'Copiado' : 'Copiar código'}
        </button>
      </div>
      <pre ref={ref} className="overflow-x-auto p-4 font-mono text-[0.85rem] leading-relaxed">
        {props.children}
      </pre>
    </div>
  );
}

type Nivel = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Cada mensagem tem um título oculto de nível 2 ("A Lumina disse"). Os títulos da resposta
 * são deslocados para começar no nível 3, mantendo a hierarquia para leitores de tela.
 */
function criarTitulos(texto: string) {
  const niveis = [...texto.matchAll(/^(#{1,6})\s/gm)].map((m) => m[1].length);
  const deslocamento = niveis.length ? 3 - Math.min(...niveis) : 0;
  const titulo = (nivel: Nivel) =>
    function Titulo({ node: _node, ...props }: ComponentProps<'h1'> & { node?: unknown }) {
      const Tag = `h${Math.min(6, Math.max(3, nivel + deslocamento))}` as 'h3';
      return <Tag {...props} />;
    };
  return { h1: titulo(1), h2: titulo(2), h3: titulo(3), h4: titulo(4), h5: titulo(5), h6: titulo(6) };
}

/**
 * Renderiza a resposta do LLM. O react-markdown não interpreta HTML bruto
 * e filtra URLs perigosas (javascript:), então não há risco de XSS.
 */
export const Markdown = memo(function Markdown({ texto }: { texto: string }) {
  return (
    <div className="prosa">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          ...criarTitulos(texto),
          pre: BlocoCodigo,
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
          table: ({ node: _node, ...props }) => (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table {...props} />
            </div>
          )
        }}
      >
        {texto}
      </ReactMarkdown>
    </div>
  );
});
