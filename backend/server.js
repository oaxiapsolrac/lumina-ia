// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const Groq = require("groq-sdk"); // Importa a SDK da Groq
const conhecimentoEllas = require('./conhecimento'); 

// Inicializa o dotenv
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Configuração da API Key
const apiKey = process.env.GROQ_API_KEY; // Alterado para GROQ_API_KEY

if (!apiKey) {
    console.error("❌ ERRO CRÍTICO: Chave API (GROQ_API_KEY) não encontrada!");
}

// Inicializa o cliente Groq
const groq = new Groq({ apiKey: apiKey });

console.log("✅ Servidor iniciado. Aguardando requisições...");

app.post('/chat', async (req, res) => {
    try {
        const { mensagem } = req.body;
        
        // Prepara a base de conhecimento
        const dadosContexto = JSON.stringify(conhecimentoEllas, null, 2);

        // Define a instrução do sistema (System Prompt)
        const systemInstruction = `
            Você é a LUMINA, a IA especialista do Projeto ELLAS (UFMT).
            --- BASE DE DADOS EXCLUSIVA (ELLAS) ---
            Aqui estão dados reais sobre o impacto de gênero em STEM na América Latina:
            ${dadosContexto}
            ---------------------------------------
            DIRETRIZES DE RESPOSTA:
            1. CITAÇÃO: Sempre use "Segundo dados do Projeto ELLAS..." ou "(Fonte: Projeto ELLAS)".
            2. CONTEXTO: Use a base de dados como prioridade.
            3. HÍBRIDO: Use conhecimento geral apenas se o tema não estiver na base.
            4. IDIOMA: Responda sempre em Português do Brasil.
        `;

        // Chamada à API da Groq
        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemInstruction },
                { role: "user", content: mensagem }
            ],
            model: "meta-llama/llama-4-scout-17b-16e-instruct", // Modelo recomendado (rápido e inteligente)
            temperature: 0.5, // Controla a criatividade (0.5 é balanceado)
            max_tokens: 1024,
        });

        const respostaTexto = chatCompletion.choices[0]?.message?.content || "Desculpe, não consegui processar a resposta.";

        res.json({ resposta: respostaTexto });

    } catch (error) {
        console.error("Erro no processamento:", error);
        res.status(500).json({ resposta: "Erro ao conectar com a Lumina (Groq). Tente novamente." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});