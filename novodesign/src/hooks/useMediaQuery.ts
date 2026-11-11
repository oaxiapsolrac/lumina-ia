import { useEffect, useState } from 'react';

export function useMediaQuery(consulta: string): boolean {
  const [corresponde, setCorresponde] = useState(() => window.matchMedia(consulta).matches);
  useEffect(() => {
    const mq = window.matchMedia(consulta);
    const atualizar = () => setCorresponde(mq.matches);
    atualizar();
    mq.addEventListener('change', atualizar);
    return () => mq.removeEventListener('change', atualizar);
  }, [consulta]);
  return corresponde;
}
