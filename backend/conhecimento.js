// backend/conhecimento.js

/* * BASE DE CONHECIMENTO - PROJETO ELLAS (UFMT)
 * Dados consolidados sobre impacto de gênero em STEM na América Latina.
 * CONTÉM: Estatísticas detalhadas + Políticas Públicas Regionais.
 */

const baseDeConhecimento = [
    // --- 1. ESTATÍSTICAS E BARREIRAS ---
    {
        categoria: "Estatística - Barreiras",
        fator: "Falta de Apoio (Lack of Support)",
        dado: "É a barreira mais frequente citada no Brasil, Argentina e México, afetando diretamente a retenção feminina."
    },
    {
        categoria: "Estatística - Barreiras",
        fator: "Estereótipos de Gênero",
        dado: "Segunda maior causa de evasão. Cria a percepção cultural de que mulheres 'não possuem os atributos necessários' para ciência."
    },
    {
        categoria: "Estatística - Soluções",
        fator: "Apoio Familiar",
        dado: "É o fator positivo número 1 para a motivação e permanência de mulheres em cursos de tecnologia no México e Brasil."
    },

    // --- 2. POLÍTICAS PÚBLICAS E PROJETOS REGIONAIS ---
    {
        categoria: "Política Pública - Regional",
        nome: "W-STEM Project",
        pais: "América Latina (Colômbia, México, Chile, Costa Rica, Equador)",
        ano_inicio: "2019",
        tipo: "Programa de Atração e Retenção",
        foco: "Transformar processos de atração em cursos de engenharia e ciências com apps vocacionais e campanhas."
    },
    {
        categoria: "Política Pública - Regional",
        nome: "Projeto SAGA (STEM and Gender Advancement)",
        pais: "Regional (UNESCO)",
        tipo: "Monitoramento de Dados",
        foco: "Reduzir o gap de gênero através de políticas baseadas em evidências e indicadores precisos."
    },
    {
        categoria: "Iniciativa Educacional",
        nome: "Meninas Digitais",
        pais: "Brasil",
        instituicao: "SBC",
        foco: "Incentivar alunas do ensino fundamental e médio a conhecerem a computação através de oficinas."
    },
    {
        categoria: "Política Pública",
        nome: "Política Nacional de Ciberseguridad (Enfoque de Gênero)",
        pais: "Chile",
        ano: "2018",
        foco: "Incluir a perspectiva de gênero na segurança nacional e combater o ciberassédio."
    },
    {
        categoria: "Política Educacional",
        nome: "Mudança em Testes (Questions Skipped)",
        pais: "Chile",
        tipo: "Reforma Avaliativa",
        foco: "Eliminar a punição por respostas erradas em testes, o que aumentou a nota média das mulheres."
    },
    {
        categoria: "Financiamento",
        nome: "Programa PICT & L'Oréal-Unesco Awards",
        pais: "Argentina",
        foco: "Dar visibilidade e recursos financeiros para mulheres cientistas que lideram pesquisas."
    },
    {
        categoria: "Iniciativa",
        nome: "Niñas Talento Digital",
        pais: "Peru",
        foco: "Alfabetização digital focada em meninas para reduzir a brecha tecnológica desde a infância."
    },
    {
        categoria: "Lei",
        nome: "Cotas de Gênero e Paridade",
        pais: "México",
        foco: "Garantir a presença de mulheres em cargos de decisão e política."
    }
];

module.exports = baseDeConhecimento;