import { ArrowDown } from 'lucide-react';
import { MotionConfig } from 'motion/react';
import { Dialog, Tooltip } from 'radix-ui';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Aurora, BoasVindas } from './components/BoasVindas';
import { BarraLateral } from './components/BarraLateral';
import { Cabecalho } from './components/Cabecalho';
import { Compositor, type CompositorHandle } from './components/Compositor';
import { GavetaFontes } from './components/GavetaFontes';
import { Mensagens } from './components/Mensagens';
import { useChat } from './hooks/useChat';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useTema } from './hooks/useTema';
import { buscarEstatisticas } from './lib/api';
import { carregarPreferencias, salvarPreferencias } from './lib/historico';
import { acharModelo, type Modelo } from './lib/modelos';
import type { Anexo, Mensagem } from './lib/types';
import { leitor, lerPreferenciasVoz, salvarPreferenciasVoz, type EstadoLeitura } from './lib/voz';

const prefsIniciais = carregarPreferencias();
const vozInicial = lerPreferenciasVoz();

export default function App() {
  const { tema, alternar: alternarTema } = useTema();
  const largo = useMediaQuery('(min-width: 1024px)');

  const [modelo, setModelo] = useState<Modelo>(() => acharModelo(prefsIniciais.modelo));
  const [pais, setPais] = useState(prefsIniciais.pais ?? '');
  const [topK, setTopK] = useState(prefsIniciais.topK ?? 4);
  const [barraDesktop, setBarraDesktop] = useState(prefsIniciais.barraLateralAberta ?? true);
  const [barraMovel, setBarraMovel] = useState(false);
  const [fontesAbertas, setFontesAbertas] = useState(false);

  const [vozAtiva, setVozAtiva] = useState(vozInicial.ativa);
  const [voz, setVoz] = useState(vozInicial.voz);
  const [lendoId, setLendoId] = useState<string | null>(null);
  const [estadoLeitura, setEstadoLeitura] = useState<EstadoLeitura>('parado');

  const [anuncio, setAnuncio] = useState('');
  const [noFim, setNoFim] = useState(true);
  const noFimRef = useRef(true);
  const rolagemRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<CompositorHandle>(null);

  // Região "ao vivo" para leitores de tela: limpa antes para repetir anúncios iguais
  const anunciar = useCallback((texto: string) => {
    setAnuncio('');
    window.setTimeout(() => setAnuncio(texto), 80);
  }, []);

  const ouvir = useCallback(
    (m: Mensagem) => {
      if (lendoId === m.id) return leitor.parar();
      void leitor.falar(m.texto, voz, (estado) => {
        setEstadoLeitura(estado);
        setLendoId(estado === 'parado' ? null : m.id);
      });
    },
    [lendoId, voz]
  );

  const chat = useChat({
    anunciar,
    aoConcluirResposta: (m) => {
      if (vozAtiva) ouvir(m);
    }
  });

  const barraAberta = largo ? barraDesktop : barraMovel;
  const vazio = chat.mensagens.length === 0;

  useEffect(() => {
    salvarPreferencias({ modelo: modelo.valor, pais, topK, barraLateralAberta: barraDesktop });
  }, [modelo, pais, topK, barraDesktop]);

  useEffect(() => {
    salvarPreferenciasVoz(vozAtiva, voz);
  }, [vozAtiva, voz]);

  useEffect(() => {
    void buscarEstatisticas().then((s) => s && chat.setTotalDocumentos(s.totalDocumentos));
    // Navegadores só liberam áudio depois de um gesto do usuário
    const desbloquear = () => leitor.desbloquear();
    window.addEventListener('pointerdown', desbloquear, { once: true });
    window.addEventListener('keydown', desbloquear, { once: true });
    return () => {
      window.removeEventListener('pointerdown', desbloquear);
      window.removeEventListener('keydown', desbloquear);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Acompanha a resposta enquanto ela é escrita, a menos que o usuário tenha rolado para cima
  useEffect(() => {
    const el = rolagemRef.current;
    if (el && noFimRef.current) el.scrollTop = el.scrollHeight;
  }, [chat.mensagens]);

  const aoRolar = () => {
    const el = rolagemRef.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    noFimRef.current = perto;
    setNoFim(perto);
  };

  const irParaFim = () => {
    const el = rolagemRef.current;
    if (!el) return;
    noFimRef.current = true;
    setNoFim(true);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const enviar = (texto: string, anexos: Anexo[]) => {
    if (chat.gerando) return;
    leitor.parar();
    noFimRef.current = true;
    setNoFim(true);
    void chat.enviar(texto, anexos, { modelo, pais, topK });
  };

  const novaConversa = () => {
    leitor.parar();
    chat.novaConversa();
    setBarraMovel(false);
    compositorRef.current?.focar();
  };

  const abrirConversa = (id: string) => {
    leitor.parar();
    const conv = chat.abrirConversa(id);
    if (conv?.modelo) setModelo(acharModelo(conv.modelo));
    setBarraMovel(false);
    noFimRef.current = true;
    requestAnimationFrame(irParaFim);
  };

  const copiar = async (m: Mensagem) => {
    try {
      await navigator.clipboard.writeText(m.texto);
      anunciar('Resposta copiada.');
    } catch {
      anunciar('Não foi possível copiar.');
    }
  };

  const alternarVoz = (ativa: boolean) => {
    setVozAtiva(ativa);
    if (!ativa) leitor.parar();
    anunciar(ativa ? 'Leitura automática ligada.' : 'Leitura automática desligada.');
  };

  const barra = (modoGaveta: boolean) => (
    <BarraLateral
      conversas={chat.conversas}
      conversaId={chat.conversaId}
      onNova={novaConversa}
      onAbrir={abrirConversa}
      onExcluir={chat.excluirConversa}
      onFechar={() => (modoGaveta ? setBarraMovel(false) : setBarraDesktop(false))}
      modoGaveta={modoGaveta}
    />
  );

  return (
    <Tooltip.Provider delayDuration={350}>
      <MotionConfig reducedMotion="user">
        <a
          href="#caixa-mensagem"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[300] focus:rounded-full focus:bg-fg focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-app"
        >
          Pular para a caixa de mensagem
        </a>

        <div className="flex h-dvh overflow-hidden bg-app text-fg">
          {largo && barraDesktop && (
            <aside id="barra-lateral" aria-label="Barra lateral" className="w-[280px] shrink-0 border-r border-line">
              {barra(false)}
            </aside>
          )}

          {!largo && (
            <Dialog.Root open={barraMovel} onOpenChange={setBarraMovel}>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-[2px] animate-escurecer" />
                <Dialog.Content
                  id="barra-lateral"
                  aria-describedby={undefined}
                  className="fixed inset-y-0 left-0 z-[100] w-[min(320px,88vw)] border-r border-line shadow-2xl outline-none animate-entrar-esquerda"
                >
                  <Dialog.Title className="sr-only">Barra lateral</Dialog.Title>
                  {barra(true)}
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )}

          <div className="relative flex min-w-0 flex-1 flex-col">
            {/* A aurora cobre também o cabeçalho, para não formar uma faixa escura no topo */}
            {vazio && <Aurora />}
            <Cabecalho
              barraAberta={barraAberta}
              onAbrirBarra={() => (largo ? setBarraDesktop(true) : setBarraMovel(true))}
              vozAtiva={vozAtiva}
              setVozAtiva={alternarVoz}
              voz={voz}
              setVoz={setVoz}
              falando={lendoId !== null}
              tema={tema}
              alternarTema={alternarTema}
            />

            <main id="conteudo" className="relative flex min-h-0 flex-1 flex-col">
              <div ref={rolagemRef} onScroll={aoRolar} className="relative min-h-0 flex-1 overflow-y-auto">
                {vazio ? (
                  <BoasVindas onEscolher={(pergunta) => enviar(pergunta, [])} />
                ) : (
                  <Mensagens
                    mensagens={chat.mensagens}
                    lendoId={lendoId}
                    estadoLeitura={estadoLeitura}
                    onOuvir={ouvir}
                    onCopiar={copiar}
                    onAvaliar={chat.avaliar}
                    onFontes={(m) => {
                      chat.selecionarFontes(m);
                      setFontesAbertas(true);
                    }}
                    onTentarNovamente={(t) => enviar(t, [])}
                  />
                )}
              </div>

              {!vazio && !noFim && (
                <button
                  type="button"
                  onClick={irParaFim}
                  aria-label="Ir para a última mensagem"
                  className="absolute bottom-40 left-1/2 z-30 inline-flex size-10 -translate-x-1/2 items-center justify-center rounded-full border border-line bg-surface text-fg shadow-lg transition hover:bg-surface-2"
                >
                  <ArrowDown className="size-5" aria-hidden />
                </button>
              )}

              <Compositor
                ref={compositorRef}
                gerando={chat.gerando}
                comFundo={!vazio}
                onEnviar={enviar}
                onParar={chat.parar}
                modelo={modelo}
                setModelo={(m) => {
                  setModelo(m);
                  anunciar(`Modelo selecionado: ${m.nome}.`);
                }}
                contexto={chat.contexto}
                onAbrirFontes={() => setFontesAbertas(true)}
                anunciar={anunciar}
                pais={pais}
                setPais={setPais}
                topK={topK}
                setTopK={setTopK}
              />
            </main>
          </div>
        </div>

        <GavetaFontes
          aberta={fontesAbertas}
          setAberta={setFontesAbertas}
          fontes={chat.fontes}
          contexto={chat.contexto}
          totalDocumentos={chat.totalDocumentos}
        />

        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {anuncio}
        </div>
      </MotionConfig>
    </Tooltip.Provider>
  );
}
