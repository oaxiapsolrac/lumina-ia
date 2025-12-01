// backend/conhecimento.js

/* * BASE DE CONHECIMENTO - PROJETO ELLAS (UFMT)
 * Dados consolidados e limpos a partir de relatórios de impacto de gênero em STEM.
 * Abrangência: Brasil, México, Argentina, Chile, Uruguai, Peru e EUA (Latinas).
 */

const baseDeConhecimento = [
    // --- METADADOS DO PROJETO ---
    {
        categoria: "Metadados",
        fonte: "Plataforma ELLAS - UFMT",
        descricao: "Dados sobre liderança feminina e fatores contextuais em STEM na América Latina.",
        total_registros_processados: 350
    },

    // --- TOP BARREIRAS (Fatores Negativos Mais Frequentes) ---
    // Use isso para a IA saber o que priorizar quando perguntada sobre problemas.
    {
        categoria: "Estatística - Barreiras",
        dado: "O fator 'Lack of Support' (Falta de Apoio) é a barreira mais frequente citada no Brasil, Argentina e México, afetando diretamente a retenção feminina."
    },
    {
        categoria: "Estatística - Barreiras",
        dado: "Estereótipos de Gênero (Gender Stereotypes) são a segunda maior causa de evasão, criando a percepção de que mulheres 'não possuem os atributos necessários' para ciência."
    },
    {
        categoria: "Estatística - Barreiras",
        dado: "Assédio e Bullying Acadêmico (Academic Bullying) aparecem com alta frequência no Brasil, causando instabilidade no desempenho das alunas."
    },

    // --- FATORES POSITIVOS (O que funciona) ---
    {
        categoria: "Estatística - Soluções",
        dado: "O 'Apoio Familiar' (Family Support) é o fator positivo número 1 para a motivação e permanência de mulheres em cursos de tecnologia no México e Brasil."
    },
    {
        categoria: "Estatística - Soluções",
        dado: "A presença de Modelos Femininos (Role Models) aumenta significativamente a representação e a escolha de carreira em STEM."
    },

    // --- DETALHAMENTO: CAUSA E EFEITO (Insights Qualitativos) ---
    // Estes dados dão profundidade para a IA explicar o "Porquê".
    
    // 1. ESTEREÓTIPOS E CULTURA
    {
        contexto: "Brasil e México",
        fator: "Estereótipos de Gênero",
        impacto: "A escola é vista como uma instituição que classifica diferenças. Estratégias de trabalho para meninas muitas vezes limitam expectativas, levando à crença de que não têm atributos para serem cientistas ou engenheiras."
    },
    {
        contexto: "Brasil",
        fator: "Sexismo",
        impacto: "Mulheres não são ouvidas em discussões técnicas e recebem comentários de que 'não são brilhantes o suficiente' ou estão ali apenas 'passando tempo'. Isso causa desistência."
    },
    {
        contexto: "Brasil",
        fator: "Bullying Acadêmico e Étnico",
        impacto: "Gera danos fisiológicos e psicológicos, além de instabilidade no desempenho estudantil."
    },

    // 2. QUESTÕES ACADÊMICAS E CURRICULARES
    {
        contexto: "EUA (Estudantes Latinas)",
        fator: "Currículo Inadequado",
        impacto: "O currículo muitas vezes não é adaptado à origem das estudantes, gerando sensação de não-pertencimento."
    },
    {
        contexto: "Brasil",
        fator: "Aulas de Matemática ruins",
        impacto: "Atuam como um fator desestimulante específico para meninas na fase escolar."
    },
    {
        contexto: "Brasil",
        fator: "Características do Curso (Integral/Longa Duração)",
        impacto: "Dificulta a permanência, especialmente para mulheres que precisam trabalhar ou têm dupla jornada."
    },

    // 3. CARREIRA E MERCADO DE TRABALHO
    {
        contexto: "Argentina",
        fator: "Benefícios de Trabalho",
        impacto: "O gênero influencia negativamente a negociação de benefícios e salários."
    },
    {
        contexto: "México",
        fator: "Licença Paternidade (Ausência)",
        impacto: "A falta de licença paternidade reforça o ciclo vicioso de papéis de gênero, sobrecarregando as mulheres."
    },
    {
        contexto: "Global (Dados Ellas)",
        fator: "Gender Pay Gap (Diferença Salarial)",
        impacto: "Citada como uma barreira tanto para a entrada quanto para o sucesso de mulheres no setor STEM."
    },

    // 4. FATORES IMPULSONADORES (SOLUÇÕES)
    {
        contexto: "Uruguai",
        fator: "Métodos Educacionais",
        impacto: "Metodologias ativas geram maior engajamento e senso de pertencimento."
    },
    {
        contexto: "Brasil e México",
        fator: "Mentoria (Mentoring)",
        impacto: "Programas de mentoria e conexão com ex-alunas (Alumni) aumentam comprovadamente a retenção feminina nos cursos."
    },
    {
        contexto: "Chile e EUA",
        fator: "Autoeficácia (Self-efficacy)",
        impacto: "A crença na própria capacidade é fundamental para a construção de confiança e participação ativa em sala de aula."
    },
    {
        contexto: "Brasil",
        fator: "Acesso a Computador",
        impacto: "Ter o equipamento próprio é listado como fator crucial para a matrícula e permanência em cursos de CS (Ciência da Computação)."
    },
    {
        contexto: "México",
        fator: "Redes de Apoio (Lean In Circles)",
        impacto: "Participar de círculos de apoio cria comunidade, desenvolve habilidades e contribui para uma cultura de equidade."
    }
];

module.exports = baseDeConhecimento;