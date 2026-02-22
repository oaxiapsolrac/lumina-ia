// backend/conhecimento.js

/* * BASE DE CONHECIMENTO - PROJETO ELLAS (UFMT)
 * Dados consolidados sobre impacto de gênero em STEM na América Latina.
 * CONTÉM: Estatísticas detalhadas + Políticas Públicas Completas.
 */

const baseDeConhecimento = [
    // =================================================================
    // 1. BIOGRAFIAS (REFERÊNCIAS)
    // =================================================================
    {
        categoria: "Biografia",
        nome: "Nina da Hora",
        pais: "Brasil",
        bio: "Cientista da computação, hacker antirracista e pesquisadora. Referência em ética algorítmica e fundadora do Instituto da Hora."
    },
    {
        categoria: "Biografia",
        nome: "Sonia Guimarães",
        pais: "Brasil",
        bio: "Primeira mulher negra doutora em física no Brasil, professora do ITA e defensora da diversidade nas ciências exatas."
    },

    // =================================================================
    // 2. ESTATÍSTICAS E BARREIRAS (DIAGNÓSTICO DETALHADO)
    // =================================================================
    {
        categoria: "Estatística - Barreiras",
        fator: "Falta de Apoio (Lack of Support)",
        dado: "É a barreira mais frequente citada no Brasil, Argentina e México, afetando diretamente a retenção feminina. A ausência de suporte familiar e institucional desencoraja a continuidade no curso."
    },
    {
        categoria: "Estatística - Barreiras",
        fator: "Estereótipos de Gênero",
        dado: "Segunda maior causa de evasão. Cria a percepção cultural de que mulheres 'não possuem os atributos necessários' (como genialidade inata) para ciência e tecnologia."
    },
    {
        categoria: "Estatística - Barreiras",
        fator: "Assédio e Bullying Acadêmico",
        dado: "Aparecem com alta frequência no Brasil. O ambiente hostil e piadas machistas causam instabilidade emocional e queda no desempenho das alunas."
    },
    {
        categoria: "Estatística - Soluções",
        fator: "Apoio Familiar",
        dado: "É o fator positivo número 1 para a motivação e permanência de mulheres em cursos de tecnologia no México e Brasil. Quando a família apoia, a chance de evasão cai drasticamente."
    },
    {
        categoria: "Estatística - Soluções",
        fator: "Role Models (Modelos Femininos)",
        dado: "A presença de professoras e palestrantes mulheres aumenta significativamente a representação e a escolha de carreira em STEM, gerando o efeito 'eu posso ser ela'."
    },

    // =================================================================
    // 3. CAUSA E EFEITO (INSIGHTS QUALITATIVOS)
    // =================================================================
    {
        contexto: "Brasil e México",
        fator: "Estereótipos na Escola",
        impacto: "A escola é vista como uma instituição que classifica diferenças. Estratégias de ensino muitas vezes limitam expectativas para meninas, levando-as a crer que exatas 'é coisa de menino'."
    },
    {
        contexto: "Brasil",
        fator: "Sexismo em Sala",
        impacto: "Mulheres relatam não serem ouvidas em discussões técnicas e recebem comentários de que 'estão ali apenas passando tempo' ou procurando marido, o que causa isolamento."
    },
    {
        contexto: "Brasil",
        fator: "Aulas de Matemática",
        impacto: "Métodos de ensino tradicionais e pouco engajadores em matemática atuam como um fator desestimulante específico para meninas ainda na fase escolar."
    },
    {
        contexto: "Argentina",
        fator: "Negociação de Benefícios",
        impacto: "O gênero influencia negativamente a negociação de salários e benefícios. Mulheres tendem a pedir menos ou receber propostas inferiores para os mesmos cargos."
    },
    {
        contexto: "México",
        fator: "Licença Paternidade (Ausência)",
        impacto: "A falta de licença paternidade equitativa reforça o ciclo vicioso onde a mulher é a única responsável pelo cuidado, prejudicando sua carreira em momentos chave."
    },
    {
        contexto: "Global (Dados Ellas)",
        fator: "Gender Pay Gap (Diferença Salarial)",
        impacto: "Citada consistentemente como uma barreira tanto para a atração quanto para a valorização de mulheres seniores no setor STEM."
    },

    // =================================================================
    // 4. POLÍTICAS PÚBLICAS E INICIATIVAS (DETALHADAS)
    // =================================================================
    {
        categoria: "Política Pública - Regional",
        nome: "W-STEM Project",
        pais: "América Latina (Colômbia, México, Chile, Costa Rica, Equador)",
        ano_inicio: "2019",
        tipo: "Programa de Atração e Retenção",
        detalhes: "Projeto internacional focado em medir a igualdade de gênero na matrícula e retenção em cursos STEM. Ações incluem: criação de apps para orientação vocacional e campanhas multimídia para meninas no ensino médio."
    },
    {
        categoria: "Política Pública - Regional",
        nome: "Projeto SAGA (STEM and Gender Advancement)",
        pais: "Regional (UNESCO)",
        tipo: "Monitoramento de Dados",
        detalhes: "Focado no desenho de indicadores para medir impulsionadores e barreiras de gênero. O objetivo é criar políticas baseadas em evidências (evidence-based policies)."
    },
    {
        categoria: "Iniciativa Corporativa",
        nome: "Políticas de Diversidade no Setor Privado",
        pais: "Brasil",
        tipo: "Ação Afirmativa",
        detalhes: "Estratégias sugeridas e aplicadas por mulheres em empresas de tecnologia: 1) Contratação afirmativa de mulheres e minorias; 2) Apoio ao equilíbrio vida-trabalho (Work-Life Balance); 3) Suporte ao crescimento de carreira."
    },
    {
        categoria: "Pesquisa/Iniciativa",
        nome: "Parenting and Scientific Career Survey",
        pais: "Brasil",
        tipo: "Pesquisa de Base",
        detalhes: "Levantamento com mais de 2000 respostas sobre maternidade e carreira científica. Os dados são usados para criar políticas que protejam a produtividade de cientistas mães."
    },
    {
        categoria: "Iniciativa Educacional",
        nome: "Meninas Digitais",
        pais: "Brasil",
        tipo: "Incentivo Educacional",
        detalhes: "Programa da Sociedade Brasileira de Computação (SBC) focado em divulgar a área de computação para meninas do ensino fundamental e médio."
    },
    {
        categoria: "Política Pública",
        nome: "Política Nacional de Ciberseguridad (Enfoque de Gênero)",
        pais: "Chile",
        ano_inicio: "2018",
        tipo: "Marco Regulatório",
        detalhes: "O Chile incluiu o gênero na estratégia de segurança nacional. Metas: identificar a escassez de mulheres em cibersegurança e tolerância zero ao assédio sexual no ambiente digital."
    },
    {
        categoria: "Política Educacional",
        nome: "Policy Change on Questions Skipped (Mudança em Testes)",
        pais: "Chile",
        tipo: "Reforma Avaliativa",
        detalhes: "Remoção de penalidades por respostas erradas em testes competitivos. O estudo mostrou que isso reduz a brecha de gênero nas notas, pois mulheres tendiam a pular mais questões por aversão ao risco da penalidade."
    },
    {
        categoria: "Política Pública",
        nome: "Política Nacional para Igualdade em Ciência e Tecnologia (2018-2027)",
        pais: "Costa Rica",
        ano_inicio: "2017",
        tipo: "Plano Decenal",
        detalhes: "Plano de longo prazo com 5 pilares, incluindo: melhorar a percepção social da mulher na ciência e fomentar o emprego em P&D com perspectiva de gênero."
    },
    {
        categoria: "Política Pública",
        nome: "Programa PICT & L'Oréal-Unesco Awards",
        pais: "Argentina",
        ano_inicio: "2018",
        tipo: "Financiamento e Reconhecimento",
        detalhes: "Análise da brecha de gênero na alocação de verbas (grants) de ciência e tecnologia e criação de prêmios exclusivos para visibilidade feminina."
    },
    {
        categoria: "Iniciativa Educacional",
        nome: "Niñas Talento Digital & Girls4Tech",
        pais: "Peru",
        ano_inicio: "2018-2022",
        tipo: "Alfabetização Digital",
        detalhes: "Programas focados no ensino de tecnologia para iniciantes ('Tech Beginners'), visando a inclusão digital de meninas desde a base."
    },
    {
        categoria: "Iniciativa Comunitária",
        nome: "WarmiLab & Women in STEM Peru",
        pais: "Peru",
        ano_inicio: "2016-2020",
        tipo: "Comunidade",
        detalhes: "Criação de laboratórios e redes de contato (networking) para fortalecer a permanência de mulheres na área."
    },
    {
        categoria: "Legislação",
        nome: "Cotas de Gênero e Paridade",
        pais: "México",
        tipo: "Lei",
        detalhes: "Implementação de paridade de gênero em cargos de liderança política e representação, influenciando a gestão de instituições públicas e científicas."
    },
    {
        categoria: "Iniciativa Educacional",
        nome: "Technovation Girls & Science for Girls",
        pais: "México",
        tipo: "Mentoria Prática",
        detalhes: "Programas práticos para ensinar desenvolvimento de aplicativos e resolução de problemas reais, focados em aumentar matrículas no ensino superior."
    },
    {
        categoria: "Política Educacional",
        nome: "BootCamps STEM",
        pais: "Equador",
        ano_inicio: "2019",
        tipo: "Treinamento Intensivo",
        detalhes: "Planejamento de BootCamps por estudantes do ensino médio com apoio de professores e universidades para promover inclinações e habilidades STEM em jovens."
    },
    {
        categoria: "Política Institucional",
        nome: "Think Tank de Liderança Feminina (UNAL)",
        pais: "Colômbia",
        ano_inicio: "2020",
        tipo: "Empoderamento Universitário",
        detalhes: "Criação de um escritório inter-campus para questões de gênero e fortalecimento de grupos de pesquisa sobre brechas de gênero."
    }
];

module.exports = baseDeConhecimento;