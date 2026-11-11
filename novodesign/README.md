# Lumina — novo design (3.0)

Interface da Lumina em React + TypeScript + Tailwind, separada do backend (`../backend`) e do cliente antigo (`../index.html`).
Ela conversa com o backend pelas mesmas rotas do cliente antigo (`/chat/stream`, `/stats`, `/tts`).

## Rodar na máquina

```bash
cd novodesign
npm install
VITE_API_BASE=http://localhost:3001 npm run dev
```

Abra http://localhost:5173. Sem `VITE_API_BASE`, a interface usa o backend do Render (`https://lumina-backend-zsak.onrender.com`).
O backend local sobe com `cd backend && npm start`.

## Gerar a versão de produção

```bash
npm run build
```

A saída fica em `dist/` (fora do repositório).

## Publicar no Vercel

Num projeto do Vercel ligado a este repositório:

- **Root Directory:** `novodesign`
- **Framework Preset:** Vite (build `npm run build`, saída `dist`)
- **Variável de ambiente:** `VITE_API_BASE` com o endereço do backend

No backend, inclua o endereço publicado em `CORS_ORIGINS`.

## O que tem

- Conversa com streaming, histórico no navegador (mesmo formato do cliente antigo) e 👍/👎 salvos só no navegador.
- Painel de fontes com relevância, citação da fonte, licença e link (ex.: UNESCO UIS, CC BY-SA 4.0).
- Aviso quando um número da resposta não aparece nos documentos consultados.
- Leitura em voz, anexos de imagem, vídeo e áudio conforme o modelo, temas claro e escuro.
- Acessibilidade conferida com axe (WCAG 2.2 AA) nos dois temas.
