// backend/server.js - CÓDIGO COMPLETO

// 1. Carrega as variáveis de ambiente
require('dotenv').config();

// --- ÁREA DE TESTE DA CHAVE (DEBUG) ---
console.log("---------------------------------------------------");
console.log("Iniciando verificação do sistema...");
if (!process.env.GEMINI_API_KEY) {
    console.error("❌ ERRO CRÍTICO: A variável GEMINI_API_KEY não foi encontrada!");
    console.error("   Verifique se o arquivo .env existe na pasta backend.");
} else {
    // Mostra apenas os 4 primeiros caracteres da chave para segurança
    const inicioDaChave = process.env.GEMINI_API_KEY.substring(0, 4);
    console.log(`✅ Chave encontrada! Começa com: ${inicioDaChave}...`);
}
console.log("---------------------------------------------------");
// --------------------------------------

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const app = express();
app.use(express.json());
app.use(cors());

// Configuração da IA com tratamento de erro na inicialização
let model;
try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // MUDANÇA AQUI: Tirei o "const" antes de model
    model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash", // <--- Seu modelo novo e correto!
        systemInstruction: `
            Você é uma IA especialista chamada LUMINA.
            Seu foco é 'Fornecer dados sobre mulheres latinas na tecnologia'.
            Diretrizes:
            1. IDENTIDADE: Se perguntarem, você é a Lumina, assistente de inclusão na tech.
            2. CONTEXTO: Priorize dados e biografias de mulheres latinas.
            3. TOM: Inspirador e técnico.
        `
    });
} catch (error) {
    console.error("Erro ao configurar o Gemini. Verifique sua API Key.");
}

app.post('/chat', async (req, res) => {
    try {
        const { mensagem } = req.body;
        console.log("📩 Recebi pergunta:", mensagem);

        if (!model) {
            throw new Error("O modelo Gemini não foi inicializado corretamente (Problema na chave).");
        }

        const result = await model.generateContent(mensagem);
        const response = await result.response;
        const text = response.text();

        res.json({ resposta: text });

    } catch (error) {
        console.error("❌ Erro ao processar:", error.message);
        res.status(500).json({ 
            resposta: "Desculpe, tive um erro interno. Verifique o terminal do servidor." 
        });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});