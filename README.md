🧬 LUMINA - Inteligência Artificial do Projeto ELLAS
A Lumina é a assistente virtual e embaixadora do Projeto ELLAS (Equality in Leadership for Latin American STEM). Desenvolvida sob a liderança da UFMT (Universidade Federal de Mato Grosso), ela utiliza modelos de linguagem de última geração para democratizar o acesso a dados sobre a presença feminina nas áreas de Ciência, Tecnologia, Engenharia e Matemática na América Latina.

🚀 Visão Geral
Este repositório contém o backend da Lumina, estruturado em Node.js com integração via Groq SDK. A IA foi projetada para atuar como uma especialista em políticas públicas e estatísticas de gênero, conectando pesquisadores, estudantes e formuladores de políticas aos dados colhidos pelo projeto no Brasil, Bolívia e Peru.

🛠️ Tecnologias Utilizadas
Runtime: Node.js

Framework: Express

Engine de IA: Groq Cloud SDK

Modelo: meta-llama/llama-4-scout-17b-16e-instruct

Arquitetura de Prompt: Instrução por tags XML (Modo Pro) para maior precisão e redução de alucinações.

🧠 Arquitetura de Inteligência (RAG)
A Lumina opera com um sistema de Geração Aumentada de Recuperação (RAG) simplificado. O motor de resposta segue uma hierarquia rígida:

Nível 1 (Base ELLAS): Prioridade absoluta para o arquivo conhecimento.js.

Nível 2 (Contexto Geral): Conhecimento acadêmico pré-treinado para definições teóricas.

Guardrails: Bloqueios automáticos para perguntas fora de escopo (culinária, política partidária, etc.) e protocolos anti-alucinação.

⚙️ Configuração e Instalação
Pré-requisitos
Node.js instalado (v16 ou superior).

Uma chave de API da Groq Cloud.

Passo a Passo
Clonar o repositório:

Bash
git clone https://github.com/oaxiapsolrac/lumina-ia
cd lumina-ellas
Instalar dependências:

Bash
npm install
Configurar variáveis de ambiente:
Crie um arquivo .env na raiz do projeto:

Snippet de código
GROQ_API_KEY=sua_chave_aqui
PORT=3000
Executar o servidor:

Bash
node backend/server.js
📡 Endpoints da API
POST /chat
Envia uma mensagem para a Lumina e recebe uma resposta processada conforme a base de dados do projeto.

Corpo da Requisição:

JSON
{
  "mensagem": "Quais são os principais fatores que impedem mulheres em STEM na Bolívia?"
}
Resposta de Sucesso:

JSON
{
  "resposta": "De acordo com os dados mapeados pelo Projeto ELLAS, as principais barreiras na Bolívia incluem... (Fonte: Base de Dados ELLAS/UFMT)"
}
🛡️ Diretrizes de Resposta (System Prompt)
A Lumina é regida por um System Directive estruturado em XML que garante:

Citação de Fonte: Identificação obrigatória do Projeto ELLAS.

Foco Regional: Prioridade para dados da América Latina.

Neutralidade: Foco técnico em políticas públicas, evitando debates partidários.

Acessibilidade: Tom acadêmico pautado pela empatia e clareza.

🤝 Contribuição e Parceria
O Projeto ELLAS é uma iniciativa internacional.

Brasil: UFMT

Bolívia: UMSA

Peru: ULima

Apoio: IDRC / CRDI

Desenvolvido para fortalecer a equidade de gênero na ciência latino-americana.
