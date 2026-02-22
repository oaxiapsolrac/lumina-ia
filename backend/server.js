// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const conhecimentoEllas = require('./conhecimento'); 

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Função auxiliar para esperar (evita bloqueio de IP)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 1. Configuração da Rotação Silenciosa
const keysString = process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "";
const apiKeys = keysString.split(',').map(key => key.trim()).filter(key => key !== "");
let currentKeyIndex = 0;

if (apiKeys.length === 0) {
    console.error("❌ ERRO: Nenhuma chave API configurada!");
}

// 2. Função para preparar o modelo com a chave atual
function getModelForIndex(index) {
    try {
        if (!apiKeys[index]) return null;
        const genAI = new GoogleGenerativeAI(apiKeys[index]);
        const dadosContexto = JSON.stringify(conhecimentoEllas, null, 2);

        return genAI.getGenerativeModel({ 
            model: "gemma-3-27b-it", 
            systemInstruction: `
                Você é a LUMINA, a IA especialista do Projeto ELLAS (UFMT).
                --- BASE DE DADOS EXCLUSIVA (ELLAS) ---
                ${dadosContexto}
                ---------------------------------------
                DIRETRIZES:
                1. CITAÇÃO: Sempre use "Segundo dados do Projeto ELLAS..." ou "(Fonte: Projeto ELLAS)".
                2. CONTEXTO: Use a base de dados fornecida acima como sua fonte primária.
            `
        });
    } catch (e) {
        return null;
    }
}

let model = apiKeys.length > 0 ? getModelForIndex(currentKeyIndex) : null;

app.post('/chat', async (req, res) => {
    const { mensagem } = req.body;
    
    if (!apiKeys.length) {
        return res.status(500).json({ resposta: "Erro de configuração: Sem chaves API." });
    }

    for (let i = 0; i < apiKeys.length; i++) {
        try {
            if (!model) {
                model = getModelForIndex(currentKeyIndex);
            }

            const result = await model.generateContent(mensagem);
            const response = await result.response;
            
            return res.json({ resposta: response.text() });

        } catch (error) {
            console.warn(`⚠️ Chave ${currentKeyIndex + 1} falhou (Status: ${error.status}). Tentando a próxima...`);
            
            // Se o erro for excesso de requisições, esperamos 2 segundos antes de tentar a próxima chave
            if (error.status === 429) {
                await sleep(2000); 
            }

            currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
            model = getModelForIndex(currentKeyIndex);
        }
    }

    res.status(429).json({ 
        resposta: "No momento, todas as minhas capacidades de processamento estão ocupadas. Por favor, tente novamente em instantes." 
    });
});

app.get('/status-keys', (req, res) => {
    res.json({
        total_chaves: apiKeys.length,
        chave_atual: currentKeyIndex + 1,
        status: apiKeys.length > 0 ? "Pronto para Rotação" : "Sem Chaves"
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Lumina Online com ${apiKeys.length} chaves em rotação.`);
});