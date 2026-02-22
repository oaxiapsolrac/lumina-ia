// backend/descobrir.js
require('dotenv').config();

const apiKey = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

console.log("🔍 Consultando a lista de modelos disponíveis para sua chave...");

fetch(url)
  .then(response => response.json())
  .then(data => {
    if (data.error) {
        console.error("❌ Erro:", data.error.message);
    } else {
        console.log("✅ MODELOS DISPONÍVEIS (Escolha um destes):");
        console.log("-------------------------------------------");
        // Filtra apenas os que servem para gerar texto (generateContent)
        const modelosUteis = data.models.filter(m => m.supportedGenerationMethods.includes("generateContent"));
        
        modelosUteis.forEach(m => {
            // Remove o "models/" do começo para ficar fácil de copiar
            console.log(`👉 "${m.name.replace('models/', '')}"`);
        });
        console.log("-------------------------------------------");
    }
  })
  .catch(err => console.error("Erro de conexão:", err));