// backend/descobrir-groq.js
require('dotenv').config();

const apiKey = process.env.GROQ_API_KEY;
const url = "https://api.groq.com/openai/v1/models";

console.log("🔍 Consultando a lista de modelos disponíveis na Groq...");

if (!apiKey) {
    console.error("❌ Erro: A variável GROQ_API_KEY não está definida no arquivo .env");
    process.exit(1);
}

fetch(url, {
    method: "GET",
    headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
    }
})
.then(response => response.json())
.then(data => {
    if (data.error) {
        console.error("❌ Erro na API:", data.error.message);
    } else {
        console.log("✅ MODELOS DISPONÍVEIS NA GROQ:");
        console.log("-------------------------------------------");
        
        // A API da Groq retorna uma lista em 'data'
        data.data.forEach(model => {
            console.log(`👉 "${model.id}"`);
        });
        
        console.log("-------------------------------------------");
        console.log("Dica: Copie um dos IDs acima (ex: 'llama-3.3-70b-versatile') e coloque no seu server.js");
    }
})
.catch(err => console.error("❌ Erro de conexão:", err.message));