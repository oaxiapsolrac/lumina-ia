// backend/server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { GoogleGenerativeAI } = require("@google-generative-ai/generative-ai");
const conhecimentoEllas = require('./conhecimento'); 

// Inicializa o dotenv antes de qualquer coisa
dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

// Tente ler do ambiente do Render primeiro, depois do dotenv
const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("❌ ERRO CRÍTICO: Chave API não encontrada no Render!");
}

let model;

try {
    // Inicializa a IA apenas se a chave existir
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Transforma os dados JSON em texto para a IA ler
    const dadosContexto = JSON.stringify(conhecimentoEllas, null, 2);

    model = genAI.getGenerativeModel({ 

        model: "gemini-2.5-flash", 
        systemInstruction: `
            Você é a LUMINA, a IA especialista do Projeto ELLAS (UFMT).

            --- BASE DE DADOS EXCLUSIVA (ELLAS) ---
            Aqui estão dados reais sobre o impacto de gênero em STEM na América Latina.
            Use estas informações como sua fonte prioritária de verdade:
            
            ${dadosContexto}
            ---------------------------------------

            DIRETRIZES DE RESPOSTA:
            1. CITAÇÃO: Sempre que usar um dado da lista acima, inicie ou termine a frase com "Segundo dados do Projeto ELLAS..." ou "(Fonte: Projeto ELLAS)".
            2. CONTEXTO: Se a pergunta for sobre barreiras ou estatísticas, verifique primeiro na lista acima. Se a resposta estiver lá, use-a.
            3. HÍBRIDO: Se a pergunta não estiver na base de dados (ex: "O que é CSS?"), use seu conhecimento geral do Google sem citar o ELLAS.    
        `
    });
    
    console.log("✅ Servidor iniciado com a Base de Conhecimento ELLAS!");

} catch (error) {
    console.error("❌ Erro na configuração da IA:", error);
}

app.post('/chat', async (req, res) => {
    try {
        const { mensagem } = req.body;
        
        if (!model) {
            return res.status(500).json({ resposta: "IA não inicializada. Verifique a chave API." });
        }

        const result = await model.generateContent(mensagem);
        const response = await result.response;
        const text = response.text();

        res.json({ resposta: text });

    } catch (error) {
        console.error("Erro no processamento do chat:", error);
        
        // Trata o erro de limite de cota (429) de forma amigável
        if (error.status === 429) {
            return res.status(429).json({ 
                resposta: "Lumina está um pouco ocupada agora (limite de cota atingido). Por favor, tente novamente em um minuto." 
            });
        }

        res.status(500).json({ resposta: "Erro ao processar sua mensagem." });
    }
});

// Porta configurada para o Render (process.env.PORT) ou 3000 local
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
});