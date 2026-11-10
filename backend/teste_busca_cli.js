// backend/teste-lumina/teste_busca_cli.js
import { vectorEngine } from './vector_engine.js';
import dotenv from 'dotenv';
import Groq from 'groq-sdk';

dotenv.config();

const pergunta = process.argv.slice(2).join(' ') || "Quais iniciativas para mulheres existem na Bolívia e no Brasil?";

console.log(`\n======================================================`);
console.log(`🔍 PERGUNTA DE TESTE: "${pergunta}"`);
console.log(`======================================================\n`);

await vectorEngine.init();

console.log(`\n⚡ Realizando Busca Vetorial Semântica...`);
const resultadoBusca = await vectorEngine.search(pergunta, { topK: 4 });

console.log(`\n📄 DOCUMENTOS RECUPERADOS (${resultadoBusca.tempoBuscaMs} ms):`);
resultadoBusca.resultados.forEach((doc, i) => {
    console.log(`\n[${i + 1}] Score: ${(doc.score * 100).toFixed(1)}% | País: ${doc.pais} | Tipo: ${doc.categoria}`);
    console.log(`    👉 Nome: ${doc.nome}`);
    console.log(`    ℹ️ Detalhes: ${doc.detalhes}`);
});

const GROQ_KEY = process.env.GROQ_API_KEY;
if (GROQ_KEY) {
    console.log(`\n🤖 Chamando Groq com o contexto cirúrgico...`);
    const groq = new Groq({ apiKey: GROQ_KEY });
    
    const contexto = resultadoBusca.resultados.map(d => `[${d.pais}] ${d.categoria}: ${d.nome} - ${d.detalhes}`).join('\n');
    
    const modelName = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
    const resposta = await groq.chat.completions.create({
        model: modelName,
        messages: [
            {
                role: "system",
                content: `Você é a LUMINA (Projeto ELLAS/UFMT). Responda com base ESTRITAMENTE no contexto vetorial abaixo:\n\n${contexto}`
            },
            { role: "user", content: pergunta }
        ],
        temperature: 0.3
    });
    
    console.log(`\n💬 RESPOSTA DA LUMINA:`);
    console.log(`------------------------------------------------------`);
    console.log(resposta.choices[0].message.content);
    console.log(`------------------------------------------------------\n`);
} else {
    console.log(`\n⚠️ Configure GROQ_API_KEY no .env para testar a resposta da LLM.`);
}
