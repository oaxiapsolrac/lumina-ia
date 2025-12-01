# Lumina: IA Especialista em Mulheres na Tecnologia (LATAM) 👩‍💻🌎

![Project Status](https://img.shields.io/badge/status-active-success)
![License](https://img.shields.io/badge/license-MIT-blue)

> Uma aplicação Full Stack de Inteligência Artificial desenvolvida para dar visibilidade ao protagonismo feminino na tecnologia na América Latina, integrada ao modelo Gemini 2.0 do Google.

## 🔗 Links do Projeto (Demo)

* **Frontend (Interface Web):** [Acesse a Lumina aqui](https://lumina-fq9wo25gc-carlos-projects-5b17412f.vercel.app/)
* **Repositório:** [github.com/oaxiapsolrac/lumina-ia](https://github.com/oaxiapsolrac/lumina-ia)

---

## 🛠️ Tecnologias Utilizadas

Este projeto foi construído utilizando uma arquitetura cliente-servidor robusta:

**Backend & IA:**
* ![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white) **Node.js** (Ambiente de execução)
* ![Express](https://img.shields.io/badge/Express.js-404D59?style=flat) **Express** (Servidor Web)
* ![Google Gemini](https://img.shields.io/badge/Google%20AI-Gemini%202.0-4285F4?style=flat&logo=google) **Google Gemini API** (Modelo `gemini-2.0-flash`)
* **Render** (Hospedagem do Servidor)

**Frontend:**
* ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white) **HTML5 Semântico**
* ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat&logo=css3&logoColor=white) **CSS3 Responsivo**
* ![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black) **Vanilla JavaScript** (Sem frameworks pesados)
* **Vercel** (Hospedagem da Interface)
* **Marked.js** (Renderização de Markdown para HTML)

---

## ⚡ Funcionalidades

* **Chat Interativo:** Conversa fluida com respostas em tempo real.
* **Contexto Especializado:** "System Instructions" configuradas para focar em biografias, dados e feitos de mulheres latinas na tecnologia.
* **Histórico Persistente:** Salva as conversas no `localStorage` do navegador.
* **Formatação Rica:** Suporte a **negrito**, *listas* e blocos de código na resposta da IA.
* **Arquitetura Segura:** A chave da API (`API Key`) fica protegida no Backend, nunca exposta no Frontend.

---

## 🚀 Como Rodar Localmente

Siga estas instruções para rodar o projeto no seu computador:

### Pré-requisitos
* [Node.js](https://nodejs.org/) instalado.
* Uma chave de API do [Google AI Studio](https://aistudio.google.com/).

### Passo a Passo

1.  **Clone o repositório:**
    ```bash
    git clone [https://github.com/oaxiapsolrac/lumina-ia.git](https://github.com/oaxiapsolrac/lumina-ia.git)
    cd lumina-ia
    ```

2.  **Configure o Backend:**
    Entre na pasta do servidor e instale as dependências.
    ```bash
    cd backend
    npm install
    ```

3.  **Configure as Variáveis de Ambiente:**
    Crie um arquivo `.env` dentro da pasta `backend` e adicione sua chave:
    ```env
    GEMINI_API_KEY=Sua_Chave_AIza_Aqui
    ```

4.  **Inicie o Servidor:**
    ```bash
    node server.js
    ```
    *O terminal deve mostrar: `🚀 Servidor rodando em http://localhost:3000`*

5.  **Rode o Frontend:**
    Abra o arquivo `index.html` (que está na raiz do projeto) diretamente no seu navegador.
    *(Nota: Para testar localmente, lembre-se de alterar a URL do `fetch` no `index.html` para `http://localhost:3000/chat`).*

---

## 🌐 Guia de Deploy (Como colocar no ar)

Este projeto utiliza duas plataformas gratuitas para hospedagem.

### 1. Backend (Render)
O servidor Node.js é hospedado no [Render.com](https://render.com).

1.  Crie um novo **Web Service** no Render conectado ao seu GitHub.
2.  Configure o **Root Directory** para `backend`.
3.  Defina o **Build Command** como `npm install`.
4.  Defina o **Start Command** como `node server.js`.
5.  Adicione a variável de ambiente:
    * Key: `GEMINI_API_KEY`
    * Value: `Sua chave do Google`

### 2. Frontend (Vercel)
A interface web é hospedada na [Vercel.com](https://vercel.com).

1.  Importe o projeto do GitHub na Vercel.
2.  Mantenha o **Root Directory** como a raiz (`./`).
3.  O deploy é automático e gera a URL pública do site.
4.  **Importante:** No arquivo `index.html`, a URL do `fetch` deve apontar para o endereço do Render (ex: `https://lumina-backend.onrender.com/chat`).

---

## 📂 Estrutura de Pastas

```text
lumina-ia/
├── backend/           # Lógica do Servidor (Node.js)
│   ├── .env           # (Não enviado ao Git) Chaves de segurança
│   ├── server.js      # Configuração do Express e Gemini
│   └── package.json   # Dependências do Backend
├── index.html         # Interface do Usuário (Chat)
├── lumina-logo.svg    # Logotipo
└── README.md          # Documentação
