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

// 1. Configuração da Rotação Silenciosa
// No Render, configure GEMINI_KEYS com as chaves separadas por vírgula (ex: chave1,chave2,chave3)
const keysString = process.env.GEMINI_KEYS || process.env.GEMINI_API_KEY || "";
const apiKeys = keysString.split(',').map(key => key.trim()).filter(key => key !== "");
let currentKeyIndex = 0;

if (apiKeys.length === 0) {
    console.error("❌ ERRO: Nenhuma chave API configurada!");
}

// 2. Função para preparar o modelo com a chave atual
function getModelForIndex(index) {
    try {
        const genAI = new GoogleGenerativeAI(apiKeys[index]);
        const dadosContexto = JSON.stringify(conhecimentoEllas, null, 2);

        return genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", 
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

// Inicializa o primeiro modelo da lista
let model = apiKeys.length > 0 ? getModelForIndex(currentKeyIndex) : null;

app.post('/chat', async (req, res) => {
    const { mensagem } = req.body;
    
    if (!apiKeys.length) {
        return res.status(500).json({ resposta: "Erro de configuração: Sem chaves API." });
    }

    // Tenta as chaves uma por uma sem avisar o usuário
    for (let i = 0; i < apiKeys.length; i++) {
        try {
            // Se o modelo não estiver pronto ou falhou antes, tenta inicializar
            if (!model) {
                model = getModelForIndex(currentKeyIndex);
            }

            const result = await model.generateContent(mensagem);
            const response = await result.response;
            
            // Se chegou aqui, a chave funcionou. Retorna a resposta e encerra a função.
            return res.json({ resposta: response.text() });

        } catch (error) {
            console.warn(`⚠️ Chave ${currentKeyIndex + 1} falhou (Status: ${error.status}). Tentando a próxima...`);
            
            // Rotaciona o índice para a próxima chave
            currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
            model = getModelForIndex(currentKeyIndex);
            
            // O loop 'for' continuará para a próxima tentativa
        }
    }

    // Se o código chegar aqui, significa que percorreu TODAS as chaves e todas falharam
    res.status(429).json({ 
        resposta: "No momento, todas as minhas capacidades de processamento estão ocupadas. Por favor, tente novamente em instantes." 
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Lumina Online com ${apiKeys.length} chaves em rotação.`);
});