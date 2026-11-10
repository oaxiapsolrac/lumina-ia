import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TTL_FILE = path.join(__dirname, 'backup_ellas.ttl');
const OUTPUT_JSON = path.join(__dirname, 'base_ellas_ttl_completa.json');

export async function parseBackupEllasTTL() {
    console.log("⏳ Iniciando leitura profunda do arquivo backup_ellas.ttl (5.5 milhões de linhas)...");
    const inicio = Date.now();

    const rl = readline.createInterface({
        input: fs.createReadStream(TTL_FILE),
        crlfDelay: Infinity
    });

    const entities = {};

    function cleanString(str) {
        if (!str) return "";
        try {
            str = decodeURIComponent(str);
        } catch (e) {}
        return str
            .replace(/^Ellas:/, '')
            .replace(/^<https:\/\/ellas\.ufmt\.br\/Ontology\/Ellas#/, '')
            .replace(/>$/, '')
            .replace(/["']+/g, '')
            .replace(/%20/g, ' ')
            .replace(/%3B/g, ';')
            .replace(/%2C/g, ',')
            .replace(/%28/g, '(')
            .replace(/%29/g, ')')
            .replace(/%2F/g, '/')
            .replace(/%3A/g, ':')
            .replace(/\\n/g, ' ')
            .trim();
    }

    function getOrCreateEntity(uri) {
        if (!entities[uri]) {
            const rawName = cleanString(uri);
            entities[uri] = {
                id: uri.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase(),
                uri: uri,
                nome: rawName,
                tipos: new Set(),
                pais: "América Latina",
                cidades: new Set(),
                estados: new Set(),
                publicoAlvo: new Set(),
                financiadores: new Set(),
                apoiadores: new Set(),
                areas: new Set(),
                objetivos: [],
                detalhes: [],
                fontes: new Set(),
                indicadores: []
            };
        }
        return entities[uri];
    }

    let lineCount = 0;
    let currentSubject = null;

    for await (const line of rl) {
        lineCount++;
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('@prefix')) continue;

        // Extrai tokens
        const tokens = trimmed.split(/\s+/);
        if (tokens.length < 2) continue;

        const subjToken = tokens[0];
        const predToken = tokens[1];
        let objToken = tokens.slice(2).join(' ');
        if (objToken.endsWith('.')) objToken = objToken.slice(0, -1).trim();

        if (subjToken.startsWith('Ellas:') || subjToken.startsWith('<https://ellas.ufmt.br/Ontology/Ellas#')) {
            currentSubject = subjToken;
            const ent = getOrCreateEntity(currentSubject);

            if (predToken === 'a') {
                const types = objToken.split(/,\s*/);
                types.forEach(t => ent.tipos.add(cleanString(t)));
            } else if (predToken === 'rdfs:label') {
                const labelMatch = objToken.match(/"([^"]+)"/);
                if (labelMatch) ent.nome = labelMatch[1].trim();
            } else if (predToken === 'Ellas:created_in' || predToken === 'Ellas:Country') {
                const paisLimpo = cleanString(objToken);
                if (paisLimpo && paisLimpo !== 'Country') ent.pais = paisLimpo;
            } else if (predToken === 'Ellas:located_in' || predToken === 'Ellas:hasCity') {
                const cid = cleanString(objToken);
                if (cid && cid !== 'City') ent.cidades.add(cid);
            } else if (predToken === 'Ellas:hasState') {
                const est = cleanString(objToken);
                if (est && est !== 'State') ent.estados.add(est);
            } else if (predToken === 'Ellas:focused_on' || predToken === 'Ellas:target_audience') {
                const aud = cleanString(objToken);
                if (aud && !aud.startsWith('Target_Audience')) ent.publicoAlvo.add(aud);
            } else if (predToken === 'Ellas:funded_by' || predToken === 'Ellas:fundingOrganization_name') {
                const fin = cleanString(objToken);
                if (fin && fin !== 'Funding_Organization') ent.financiadores.add(fin);
            } else if (predToken === 'Ellas:supported_by') {
                const sup = cleanString(objToken);
                if (sup) ent.apoiadores.add(sup);
            } else if (predToken === 'Ellas:hasArea' || predToken === 'Ellas:hasSpecificArea') {
                const ar = cleanString(objToken);
                if (ar && ar !== 'Area') ent.areas.add(ar);
            } else if (predToken === 'Ellas:initiative_objective' || predToken === 'Ellas:policy_description' || predToken === 'Ellas:article_research_objectives' || predToken === 'Ellas:article_research_problem') {
                const textMatch = objToken.match(/"([^"]+)"/);
                const txt = textMatch ? textMatch[1] : cleanString(objToken);
                if (txt && txt.length > 5 && !ent.objetivos.includes(txt)) ent.objetivos.push(txt);
            } else if (predToken === 'Ellas:from_source' || predToken === 'Ellas:fromSource') {
                const src = cleanString(objToken);
                if (src && src !== 'Source') ent.fontes.add(src);
            } else if (predToken.startsWith('Ellas:factors_') || predToken.startsWith('Ellas:initiative_') || predToken.startsWith('Ellas:indicator_')) {
                const prop = predToken.replace(/^Ellas:/, '');
                const val = cleanString(objToken);
                if (val && val.length > 1) {
                    ent.detalhes.push(`${prop}: ${val}`);
                }
            }
        }
    }

    console.log(`✅ ${lineCount} linhas processadas em ${((Date.now() - inicio) / 1000).toFixed(2)}s.`);

    // Filtra apenas instâncias concretas (descarta nós de definição de classes e propriedades puras)
    const entidadesFiltradas = Object.values(entities).filter(ent => {
        const tipos = Array.from(ent.tipos);
        if (tipos.length === 0) return false;
        if (tipos.some(t => ['Class', 'ObjectProperty', 'DatatypeProperty', 'Property', 'Ontology'].includes(t))) return false;
        if (['Area', 'Location', 'Target_Audience', 'AdministrativeCategory'].includes(ent.nome)) return false;
        return true;
    });

    // Mapeamento e consolidação de documentos enriquecidos
    const documentosFinais = entidadesFiltradas.map(ent => {
        const tipoPrincipal = Array.from(ent.tipos)[0] || 'Conhecimento';
        const cidadesStr = Array.from(ent.cidades).join(', ');
        const estadosStr = Array.from(ent.estados).join(', ');
        const publicoStr = Array.from(ent.publicoAlvo).join(', ');
        const financiadoresStr = Array.from(ent.financiadores).join(', ');
        const apoiadoresStr = Array.from(ent.apoiadores).join(', ');
        const areasStr = Array.from(ent.areas).join(', ');
        const fontesStr = Array.from(ent.fontes).join(', ');
        const objetivosStr = ent.objetivos.join('. ');
        const outrosDetalhesStr = ent.detalhes.join(' | ');

        // Constrói resumo textual semântico rico
        let partes = [];
        if (ent.pais && ent.pais !== 'América Latina') partes.push(`País: ${ent.pais}`);
        if (cidadesStr) partes.push(`Cidade: ${cidadesStr}`);
        if (estadosStr) partes.push(`Estado: ${estadosStr}`);
        if (tipoPrincipal) partes.push(`Tipo: ${tipoPrincipal}`);
        if (areasStr) partes.push(`Área STEM: ${areasStr}`);
        if (publicoStr) partes.push(`Público-Alvo: ${publicoStr}`);
        if (financiadoresStr) partes.push(`Financiamento: ${financiadoresStr}`);
        if (apoiadoresStr) partes.push(`Apoio/Parcerias: ${apoiadoresStr}`);
        if (objetivosStr) partes.push(`Objetivos/Foco: ${objetivosStr}`);
        if (outrosDetalhesStr) partes.push(`Detalhes Adicionais: ${outrosDetalhesStr}`);
        if (fontesStr) partes.push(`Fontes Mapeadas: ${fontesStr}`);

        const descricaoCompleta = partes.length > 0 ? partes.join('. ') : `Iniciativa ou conceito mapeado no Projeto ELLAS (UFMT).`;

        // Texto completo para geração do Embedding
        const textoVetor = `Nome: ${ent.nome}. Categoria: ${tipoPrincipal}. País: ${ent.pais}. ${descricaoCompleta}`;

        return {
            id: ent.id,
            nome: ent.nome,
            pais: ent.pais,
            tipo: tipoPrincipal,
            categoria: tipoPrincipal,
            cidades: cidadesStr || null,
            estados: estadosStr || null,
            publicoAlvo: publicoStr || null,
            financiamento: financiadoresStr || null,
            apoio: apoiadoresStr || null,
            areas: areasStr || null,
            objetivos: objetivosStr || null,
            detalhes: descricaoCompleta,
            texto: textoVetor
        };
    });

    console.log(`📊 Total de documentos enriquecidos extraídos do backup: ${documentosFinais.length}`);
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(documentosFinais, null, 2), 'utf-8');
    console.log(`💾 Base enriquecida salva em: ${OUTPUT_JSON}`);

    return documentosFinais;
}

// Execução direta via CLI
if (process.argv[1] && process.argv[1].endsWith('ttl_parser.js')) {
    parseBackupEllasTTL();
}
