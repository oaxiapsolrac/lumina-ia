import { Moon, PanelLeftOpen, Sun } from 'lucide-react';
import { ControleVoz } from './ControleVoz';
import { BotaoIcone, LogoLumina } from './ui';

interface Props {
  barraAberta: boolean;
  onAbrirBarra: () => void;
  vozAtiva: boolean;
  setVozAtiva: (v: boolean) => void;
  voz: string;
  setVoz: (v: string) => void;
  falando: boolean;
  tema: 'light' | 'dark';
  alternarTema: () => void;
}

export function Cabecalho(p: Props) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 px-2 sm:px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        {!p.barraAberta && (
          <>
            <BotaoIcone rotulo="Abrir barra lateral" aria-expanded={false} aria-controls="barra-lateral" onClick={p.onAbrirBarra} ladoDica="right">
              <PanelLeftOpen className="size-5" aria-hidden />
            </BotaoIcone>
            <div className="flex items-center gap-2 pl-1">
              <LogoLumina tamanho={24} />
              <span className="font-semibold tracking-tight">Lumina</span>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <ControleVoz ativa={p.vozAtiva} setAtiva={p.setVozAtiva} voz={p.voz} setVoz={p.setVoz} falando={p.falando} />
        <BotaoIcone rotulo={p.tema === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'} onClick={p.alternarTema} ladoDica="bottom">
          {p.tema === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
        </BotaoIcone>
      </div>
    </header>
  );
}
