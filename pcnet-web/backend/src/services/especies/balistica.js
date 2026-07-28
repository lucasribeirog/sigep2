const fs = require('fs');
const sharp = require('sharp');
const { GoogleGenAI } = require('@google/genai');
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function extrairDadosArmaViaIA(caminhoImagem) {
    const prompt = `Você é um Perito Criminal assistente. Analise a fotografia do vestígio balístico e extraia os dados técnicos. 
    Retorne estritamente um JSON válido contendo exatamente estas chaves:
    - "tipo_material": (Retorne EXATAMENTE UMA destas opções, em minúsculo e sem acento: "revolver", "pistola", "carabina", "fuzil", "municao_isolada" ou "coringa")
    - "marca": (Identifique a marca fabricante observada ou deduzida; se inconclusiva, informe "não aparente")
    - "modelo": (Identifique o modelo, se possível)
    - "calibre": (Calibre aparente, gravado ou estimado)
    - "capacidade": (Apenas o número de tiros que o armamento comporta, ex: 15)
    - "acabamento": (Descrição livre do estado da superfície e coloração)
    - "empunhadura_revolver": (Descreva o material das placas da empunhadura, se houver)
    - "detalhes_armacao": (Se for pistola, descreva o material da armação, ex: "polímero preto" ou "duralumínio". Senão, deixe vazio)
    - "carregador_info": (Se for pistola, informe se possui carregador visível, ex: "acompanhada de um carregador compatível" ou "desprovida de carregador". Senão, deixe vazio)
    - "qtd_municao": (Apenas o número inteiro de munições soltas, ex: 0)
    - "comprimento_total": (Apenas o número em milímetros, ex: 170)
    - "comprimento_cano": (Apenas o número em milímetros, ex: 75)`;

    try {
        // Lê o arquivo do disco e converte para Base64 corretamente
        const imageBuffer = fs.readFileSync(caminhoImagem);
        const base64Image = imageBuffer.toString('base64');

        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64Image
                    }
                },
                prompt
            ],
            config: {
                temperature: 0.0,
                responseMimeType: 'application/json'
            }
        });

        return JSON.parse(response.text);
    } catch (error) {
        throw new Error(`Erro ao comunicar com a API do Gemini: ${error.message}`);
    }
}


function processarBalistica(dadosForm) {
    let layout = {
        is_carabina: false,
        is_revolver: false,
        is_pistola: false,
        is_fuzil: false,
        is_municao_isolada: false,
        is_coringa: false,
        is_pm: false,
        is_eficiente: false,
        is_ineficiente: false,
        is_nao_calcou: false,
        is_rajada: false,
        is_municao_eficiente: false,
        is_municao_ineficiente: false,
        is_encaminha_custodia: false,
        is_municao_consumida: false
    };

    const tipo = dadosForm.tipo_material;
    if (tipo === 'carabina') layout.is_carabina = true;
    else if (tipo === 'revolver') layout.is_revolver = true;
    else if (tipo === 'pistola') layout.is_pistola = true;
    else if (tipo === 'fuzil') layout.is_fuzil = true;
    else if (tipo === 'municao_isolada') layout.is_municao_isolada = true;
    else if (tipo === 'coringa' || tipo === 'outro') layout.is_coringa = true;

    if (dadosForm.pertence_pm === true || String(dadosForm.pertence_pm) === 'true') {
        layout.is_pm = true;
    }

    const res = dadosForm.resultado_exame;
    if (res === 'eficiente') layout.is_eficiente = true;
    else if (res === 'ineficiente') layout.is_ineficiente = true;
    else if (res === 'nao_calcou') layout.is_nao_calcou = true;
    else if (res === 'rajada') layout.is_rajada = true;
    else if (res === 'municao_eficiente') layout.is_municao_eficiente = true;
    else if (res === 'municao_ineficiente') layout.is_municao_ineficiente = true;

    if (dadosForm.destino === 'consumida') {
        layout.is_municao_consumida = true;
    } else {
        layout.is_encaminha_custodia = true;
    }

    let municoesDetalhes = '';
    if (Array.isArray(dadosForm.municoes) && dadosForm.municoes.length > 0) {
        const formatadas = dadosForm.municoes.map(m => {
            const qtd = m.quantidade || 1;
            const numQtd = parseInt(qtd, 10);
            const cal = m.calibre || 'não especificado';
            const marc = m.marca || 'não aparente';

            const termoCartucho = (numQtd === 1) ? 'cartucho intacto' : 'cartuchos intactos';

            return `${qtd} ${termoCartucho}, calibre ${cal}, marca ${marc}`;
        });

        if (formatadas.length === 1) {
            municoesDetalhes = formatadas[0];
        } else if (formatadas.length === 2) {
            municoesDetalhes = `${formatadas[0]} e ${formatadas[1]}`;
        } else {
            const ultimo = formatadas.pop();
            municoesDetalhes = `${formatadas.join('; ')} e ${ultimo}`;
        }
    } else {
        const fallbackQtd = dadosForm.qtd_municao || 1;
        const fallbackCal = dadosForm.calibre || 'não especificado';
        const fallbackMarc = dadosForm.marca || 'não aparente';
        const termoFallback = (parseInt(fallbackQtd, 10) === 1) ? 'cartucho intacto' : 'cartuchos intactos';
        
        municoesDetalhes = `${fallbackQtd} ${termoFallback}, calibre ${fallbackCal}, marca ${fallbackMarc}`;
    }
    
    return {
        ...layout,
        calibre: dadosForm.calibre || '',
        marca: dadosForm.marca || '',
        modelo: dadosForm.modelo || 'não aparente',
        numero_serie: dadosForm.numero_serie || 'não aparente',
        acabamento: dadosForm.acabamento || 'oxidado',
        comprimento_cano: dadosForm.comprimento_cano || '',
        comprimento_total: dadosForm.comprimento_total || '',
        capacidade: dadosForm.capacidade || '',
        n_lacre: dadosForm.n_lacre || '',
        defeito_constatado: dadosForm.defeito_constatado || '',
        tipo_acao_carabina: dadosForm.tipo_acao_carabina || '',
        detalhes_coronha: dadosForm.detalhes_coronha || '',
        sistema_alimentacao: dadosForm.sistema_alimentacao || '',
        empunhadura_revolver: dadosForm.empunhadura_revolver || '',
        carregador_info: dadosForm.carregador_info || '',
        detalhes_armacao: dadosForm.detalhes_armacao || '',
        detalhes_fuzil: dadosForm.detalhes_fuzil || '',
        qtd_municao: dadosForm.qtd_municao || '',
        instituicao_carga: dadosForm.instituicao_carga || '',
        nome_arma_livre: dadosForm.nome_arma_livre || '',
        descricao_livre: dadosForm.descricao_livre || '',
        municoes_detalhes: municoesDetalhes
    };
}

module.exports = {
    processarBalistica,
    extrairDadosArmaViaIA
};