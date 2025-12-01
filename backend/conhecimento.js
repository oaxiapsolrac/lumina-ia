// backend/conhecimento.js

const baseDeConhecimento = [
    {
        "categoria": "Biografia",
        "nome": "Nina da Hora",
        "pais": "Brasil",
        "bio": "Cientista da computação, hacker antirracista e pesquisadora. Referência em ética algorítmica e fundadora do Instituto da Hora."
    },
    {
        "categoria": "Biografia",
        "nome": "Sonia Guimarães",
        "pais": "Brasil",
        "bio": "Primeira mulher negra doutora em física no Brasil, professora do ITA e defensora da diversidade nas ciências exatas."
    },
    {
        "categoria": "Estatística - Barreiras",
        "fator": "Lack of Support (Falta de Apoio)",
        "contexto": "Brasil, Argentina, México",
        "impacto": "Negativo",
        "descricao": "A barreira mais citada nos estudos. Refere-se à ausência de suporte institucional e familiar, levando à evasão e instabilidade no desempenho estudantil."
    },
    {
        "categoria": "Estatística - Barreiras",
        "fator": "Estereótipos de Gênero",
        "contexto": "América Latina",
        "impacto": "Negativo",
        "descricao": "A percepção cultural de que mulheres 'não têm os atributos necessários' para engenharia ou ciência. Isso cria uma barreira psicológica de não-pertencimento."
    },
    {
        "categoria": "Estatística - Barreiras",
        "fator": "Academic Bullying (Assédio Acadêmico)",
        "contexto": "Brasil",
        "impacto": "Negativo",
        "descricao": "Relatado frequentemente no ambiente universitário brasileiro, causando danos psicológicos e instabilidade acadêmica."
    },
    {
        "categoria": "Estatística - Solução",
        "fator": "Family Support (Apoio Familiar)",
        "contexto": "México, Brasil",
        "impacto": "Positivo",
        "descricao": "Fator crucial para motivação. Quando presente, aumenta significativamente a resiliência das alunas em cursos de computação."
    },
    {
        "categoria": "Estatística - Solução",
        "fator": "Role Models (Modelos de Referência)",
        "contexto": "Global",
        "impacto": "Positivo",
        "descricao": "A presença de professoras e líderes femininas aumenta a representação e valida a escolha de carreira em STEM."
    },
    {
        "categoria": "Política Pública - Regional",
        "nome": "W-STEM Project",
        "pais": "América Latina (Colômbia, México, Chile, Costa Rica, Equador)",
        "ano_inicio": "2019",
        "tipo": "Programa de Atração e Retenção",
        "detalhes": "Projeto internacional focado em medir a igualdade de gênero na matrícula e retenção em cursos STEM. Ações incluem: criação de apps para orientação vocacional e campanhas multimídia para meninas no ensino médio."
    },
    {
        "categoria": "Política Pública - Regional",
        "nome": "Projeto SAGA (STEM and Gender Advancement)",
        "pais": "Chile, Colômbia, Costa Rica, Equador, México",
        "ano_inicio": "2019",
        "tipo": "Monitoramento de Dados",
        "detalhes": "Focado no desenho de indicadores para medir impulsionadores e barreiras de gênero. O objetivo é criar políticas baseadas em evidências (evidence-based policies)."
    },
    {
        "categoria": "Iniciativa Corporativa",
        "nome": "Políticas de Diversidade no Setor Privado",
        "pais": "Brasil",
        "tipo": "Ação Afirmativa",
        "detalhes": "Estratégias sugeridas e aplicadas por mulheres em empresas de tecnologia: 1) Contratação afirmativa de mulheres e minorias; 2) Apoio ao equilíbrio vida-trabalho (Work-Life Balance); 3) Suporte ao crescimento de carreira."
    },
    {
        "categoria": "Pesquisa/Iniciativa",
        "nome": "Parenting and Scientific Career Survey",
        "pais": "Brasil",
        "tipo": "Pesquisa de Base",
        "detalhes": "Levantamento com mais de 2000 respostas sobre maternidade e carreira científica. Os dados são usados para criar políticas que protejam a produtividade de cientistas mães."
    },
    {
        "categoria": "Iniciativa Educacional",
        "nome": "Meninas Digitais",
        "pais": "Brasil",
        "tipo": "Incentivo Educacional",
        "detalhes": "Programa da Sociedade Brasileira de Computação (SBC) focado em divulgar a área de computação para meninas do ensino fundamental e médio."
    },
    {
        "categoria": "Política Pública",
        "nome": "Política Nacional de Ciberseguridad (Enfoque de Gênero)",
        "pais": "Chile",
        "ano_inicio": "2018",
        "tipo": "Marco Regulatório",
        "detalhes": "O Chile incluiu o gênero na estratégia de segurança nacional. Metas: identificar a escassez de mulheres em cibersegurança e tolerância zero ao assédio sexual no ambiente digital."
    },
    {
        "categoria": "Política Educacional",
        "nome": "Policy Change on Questions Skipped (Mudança em Testes)",
        "pais": "Chile",
        "tipo": "Reforma Avaliativa",
        "detalhes": "Remoção de penalidades por respostas erradas em testes competitivos. O estudo mostrou que isso reduz a brecha de gênero nas notas, pois mulheres tendiam a pular mais questões por aversão ao risco da penalidade."
    },
    {
        "categoria": "Política Pública",
        "nome": "Política Nacional para Igualdade em Ciência e Tecnologia (2018-2027)",
        "pais": "Costa Rica",
        "ano_inicio": "2017",
        "tipo": "Plano Decenal",
        "detalhes": "Plano de longo prazo com 5 pilares, incluindo: melhorar a percepção social da mulher na ciência e fomentar o emprego em P&D com perspectiva de gênero."
    },
    {
        "categoria": "Política Pública",
        "nome": "Programa PICT & L'Oréal-Unesco Awards",
        "pais": "Argentina",
        "ano_inicio": "2018",
        "tipo": "Financiamento e Reconhecimento",
        "detalhes": "Análise da brecha de gênero na alocação de verbas (grants) de ciência e tecnologia e criação de prêmios exclusivos para visibilidade feminina."
    },
    {
        "categoria": "Iniciativa Educacional",
        "nome": "Niñas Talento Digital & Girls4Tech",
        "pais": "Peru",
        "ano_inicio": "2018-2022",
        "tipo": "Alfabetização Digital",
        "detalhes": "Programas focados no ensino de tecnologia para iniciantes ('Tech Beginners'), visando a inclusão digital de meninas desde a base."
    },
    {
        "categoria": "Iniciativa Comunitária",
        "nome": "WarmiLab & Women in STEM Peru",
        "pais": "Peru",
        "ano_inicio": "2016-2020",
        "tipo": "Comunidade",
        "detalhes": "Criação de laboratórios e redes de contato (networking) para fortalecer a permanência de mulheres na área."
    },
    {
        "categoria": "Legislação",
        "nome": "Cotas de Gênero e Paridade",
        "pais": "México",
        "tipo": "Lei",
        "detalhes": "Implementação de paridade de gênero em cargos de liderança política e representação, influenciando a gestão de instituições públicas e científicas."
    },
    {
        "categoria": "Iniciativa Educacional",
        "nome": "Technovation Girls & Science for Girls",
        "pais": "México",
        "tipo": "Mentoria Prática",
        "detalhes": "Programas práticos para ensinar desenvolvimento de aplicativos e resolução de problemas reais, focados em aumentar matrículas no ensino superior."
    }
];

module.exports = baseDeConhecimento;