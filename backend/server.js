// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// --- IMPORTANTE: Importa o ficheiro com os dados do ELLAS ---
// Certifique-se de que o arquivo 'conhecimento.js' está na mesma pasta que este arquivo
const conhecimentoEllas = require('./conhecimento'); 

const app = express();
app.use(express.json());
app.use(cors());

let model;

try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Transforma os dados JSON em texto para a IA ler
    const dadosContexto = JSON.stringify(conhecimentoEllas, null, 2);

    model = genAI.getGenerativeModel({ 
        model: "gemini-2.0-flash", 
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
    console.error("Erro na configuração da IA:", error);
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
        console.error("Erro:", error);
        res.status(500).json({ resposta: "Erro ao processar." });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});