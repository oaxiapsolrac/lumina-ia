import { BarChart3, Globe2, Landmark, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

const SUGESTOES = [
  {
    icone: BarChart3,
    rotulo: 'Mulheres na Engenharia',
    pergunta: 'Segundo os microdados do INEP, qual a porcentagem de mulheres na Engenharia Mecânica e Automação?'
  },
  {
    icone: Globe2,
    rotulo: 'Iniciativas no Peru e na Bolívia',
    pergunta: 'Quais iniciativas existem no Peru e na Bolívia mapeadas pelo Projeto ELLAS?'
  },
  {
    icone: Sparkles,
    rotulo: 'Quem foi Sonia Guimarães?',
    pergunta: 'Quem foi Sonia Guimarães e quais foram suas contribuições para a física e ciência no Brasil?'
  },
  {
    icone: Landmark,
    rotulo: 'Políticas de igualdade',
    pergunta: 'Quais são as principais políticas públicas e fatores que afetam a igualdade de gênero na ciência?'
  }
];

export function BoasVindas({ onEscolher }: { onEscolher: (pergunta: string) => void }) {
  return (
    // justify-center-safe: se não couber (celular com zoom), alinha ao topo em vez de cortar a saudação
    <section aria-labelledby="titulo-boas-vindas" className="flex min-h-full flex-col items-center justify-center-safe px-4 pb-44 pt-10">
      <motion.h1
        id="titulo-boas-vindas"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mb-8 text-center font-display text-4xl font-medium tracking-tight sm:text-5xl"
      >
        <span className="texto-gradiente motion-safe:animate-shimmer">Olá!</span> Como posso ajudar?
      </motion.h1>

      <ul className="flex max-w-2xl flex-wrap justify-center gap-2" aria-label="Sugestões de perguntas">
        {SUGESTOES.map((s, i) => (
          <motion.li
            key={s.rotulo}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.05, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              type="button"
              onClick={() => onEscolher(s.pergunta)}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-surface/70 px-4 text-sm text-fg backdrop-blur transition hover:-translate-y-0.5 hover:border-mauve/60 hover:shadow-[0_8px_24px_-10px] hover:shadow-mauve/50"
            >
              <s.icone className="size-4 text-accent" aria-hidden />
              {s.rotulo}
            </button>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}

/** Fundo animado em gradiente (estilo aurora), só na tela inicial. */
export function Aurora() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -left-1/4 -top-1/3 size-[70vmax] rounded-full bg-plum/20 blur-[120px] motion-safe:animate-aurora dark:bg-plum/30" />
      <div className="absolute -right-1/4 top-1/4 size-[55vmax] rounded-full bg-coral/12 blur-[120px] [animation-delay:-6s] motion-safe:animate-aurora dark:bg-coral/20" />
      <div className="absolute -bottom-1/3 left-1/4 size-[50vmax] rounded-full bg-teal/15 blur-[120px] [animation-delay:-12s] motion-safe:animate-aurora dark:bg-teal/25" />
    </div>
  );
}
