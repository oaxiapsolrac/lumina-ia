import { clsx, type ClassValue } from 'clsx';

export const cn = (...classes: ClassValue[]) => clsx(classes);

export function lerArquivoComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result));
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

export const formatarNumero = (n: number) => n.toLocaleString('pt-BR');

export function formatarMs(ms: number | undefined | null): string {
  if (ms == null) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1).replace('.', ',')} s` : `${ms} ms`;
}

export function statusDoContexto(pct: number): 'seguro' | 'alerta' | 'critico' {
  if (pct > 80) return 'critico';
  if (pct > 60) return 'alerta';
  return 'seguro';
}

export const COR_STATUS = { seguro: '#22c55e', alerta: '#f59e0b', critico: '#ef4444' } as const;
