// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
// O nome correto do pacote é @google/generative-ai
const { GoogleGenerativeAI } = require("@google/generative-ai");
const conhecimentoEllas = require('./conhecimento'); 

// Inicializa o dotenv antes de ler as variáveis
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Tente ler do ambiente do Render primeiro
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("❌ ERRO CRÍTICO: Chave API não encontrada no Render ou .env!");
}

let model;

try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const dadosContexto = JSON.stringify(conhecimentoEllas, null, 2);

    model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash-lite", 
        systemInstruction: `
            Você é a LUMINA, a IA especialista do Projeto ELLAS (UFMT).
            --- BASE DE DADOS EXCLUSIVA (ELLAS) ---
            Aqui estão dados reais sobre o impacto de gênero em STEM na América Latina:
            ${dadosContexto}
            ---------------------------------------
            DIRETRIZES DE RESPOSTA:
            1. CITAÇÃO: Sempre use "Segundo dados do Projeto ELLAS..." ou "(Fonte: Projeto ELLAS)".
            2. CONTEXTO: Use a base de dados como prioridade.
            3. HÍBRIDO: Use conhecimento geral apenas se o tema não estiver na base.
        `
    });
    
    console.log("✅ Servidor iniciado com a Base de Conhecimento ELLAS!");

} catch (error) {
    console.error("❌ Erro na configuração da IA:", error);
}

app.post('/chat', async (req, res) => {
    try {
        const { mensagem } = req.body;
        if (!model) return res.status(500).json({ resposta: "IA não inicializada." });

        const result = await model.generateContent(mensagem);
        const response = await result.response;
        const text = response.text();

        res.json({ resposta: text });

    } catch (error) {
        console.error("Erro no processamento:", error);
        if (error.status === 429) {
            return res.status(429).json({ resposta: "Lumina está ocupada (limite de cota). Tente em 1 minuto." });
        }
        res.status(500).json({ resposta: "Erro ao processar sua mensagem." });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});