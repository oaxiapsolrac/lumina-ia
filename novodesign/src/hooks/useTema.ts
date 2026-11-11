import { useCallback, useEffect, useState } from 'react';

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';
const CHAVE = 'lumina_tema';

function resolver(p: PreferenciaTema): 'light' | 'dark' {
  if (p === 'sistema') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  return p === 'escuro' ? 'dark' : 'light';
}

export function useTema() {
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(() => {
    try {
      return (localStorage.getItem(CHAVE) as PreferenciaTema) || 'sistema';
    } catch {
      return 'sistema';
    }
  });
  const [tema, setTema] = useState<'light' | 'dark'>(() => resolver(preferencia));

  useEffect(() => {
    const aplicar = () => {
      const t = resolver(preferencia);
      setTema(t);
      document.documentElement.dataset.theme = t;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0e0e11' : '#f6f5f8');
    };
    aplicar();
    try {
      localStorage.setItem(CHAVE, preferencia);
    } catch {
      /* ignora */
    }
    if (preferencia !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', aplicar);
    return () => mq.removeEventListener('change', aplicar);
  }, [preferencia]);

  const alternar = useCallback(() => setPreferencia(() => (tema === 'dark' ? 'claro' : 'escuro')), [tema]);

  return { tema, preferencia, setPreferencia, alternar };
}
