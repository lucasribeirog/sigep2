const fs = require('fs');

async function extrairDadosArmaViaIA(caminhoImagem) {
    const prompt = `Você é um Perito Criminal assistente. Analise a fotografia do vestígio balístico e extraia os dados técnicos com precisão cirúrgica. 
    Retorne estritamente um JSON válido contendo exatamente estas chaves:
    - "tipo_material": (Retorne EXATAMENTE UMA destas opções, em minúsculo e sem acento: "revolver", "pistola", "carabina", "fuzil", "municao_isolada" ou "coringa")
    - "marca": (Identifique a marca fabricante observada ou deduzida; se inconclusiva, informe "não aparente")
    - "modelo": (Identifique o modelo, se possível)
    - "calibre": (Calibre aparente, gravado ou estimado)
    - "capacidade": (Apenas o número de tiros que o armamento comporta, ex: 6)
    - "acabamento": (Apenas o tratamento superficial e coloração do metal, ex: "oxidado negro", "pintado de preto", "inoxidável". NUNCA inclua detalhes de coronha ou empunhadura aqui)
    - "empunhadura_revolver": (Descreva o material das placas da empunhadura, se houver)
    - "detalhes_armacao": (Se for pistola, descreva o material da armação, ex: "polímero preto" ou "duralumínio". Senão, deixe vazio)
    - "carregador_info": (Se for pistola, informe se possui carregador visível, ex: "acompanhada de um carregador compatível" ou "desprovida de carregador". Senão, deixe vazio)
    - "tipo_acao_carabina": (Se carabina, informe o tipo de ação aparente, ex: "repetição (não automática)")
    - "detalhes_coronha": (Se carabina ou fuzil, descreva o material, ex: "coronha e telha em madeira")
    - "sistema_alimentacao": (Se carabina, descreva como é alimentada, ex: "sistema próprio" ou "carregador tubular")
    - "qtd_municao": (Apenas o número inteiro de munições soltas, ex: 0)
    - "comprimento_total": (Apenas o número em milímetros, ex: 170)
    - "comprimento_cano": (Apenas o número em milímetros, ex: 75)`;

    try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
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


function txt(v) { return String(v ?? '').trim(); }
function exigir(dados, campo, rotulo) {
    if (!txt(dados[campo])) throw new Error(`${rotulo} é obrigatório para este tipo de material.`);
}

function processarBalistica(dadosForm, caminhoFoto = null) {
    const tipo = String(dadosForm.tipo_material || '').toLowerCase().trim();
    const tiposValidos = new Set(['carabina', 'revolver', 'pistola', 'fuzil', 'municao_isolada', 'coringa', 'outro']);
    if (!tiposValidos.has(tipo)) throw new Error('Selecione um tipo de material balístico válido.');

    if (tipo !== 'municao_isolada') {
        exigir(dadosForm, 'calibre', 'O calibre');
        exigir(dadosForm, 'acabamento', 'O acabamento');
        exigir(dadosForm, 'comprimento_cano', 'O comprimento do cano');
        if (tipo !== 'fuzil') exigir(dadosForm, 'comprimento_total', 'O comprimento total');
    }
    if (tipo === 'revolver') {
        exigir(dadosForm, 'capacidade', 'A capacidade');
        exigir(dadosForm, 'empunhadura_revolver', 'A descrição da empunhadura');
    }
    if (tipo === 'pistola') {
        exigir(dadosForm, 'detalhes_armacao', 'Os detalhes da armação');
        exigir(dadosForm, 'carregador_info', 'A informação do carregador');
    }
    if (tipo === 'carabina') {
        exigir(dadosForm, 'tipo_acao_carabina', 'O tipo de ação');
        exigir(dadosForm, 'detalhes_coronha', 'Os detalhes da coronha');
        exigir(dadosForm, 'sistema_alimentacao', 'O sistema de alimentação');
        exigir(dadosForm, 'capacidade', 'A capacidade');
    }
    if (tipo === 'fuzil') exigir(dadosForm, 'detalhes_fuzil', 'Os detalhes do fuzil');
    if (tipo === 'coringa' || tipo === 'outro') {
        exigir(dadosForm, 'nome_arma_livre', 'O nome da arma');
        exigir(dadosForm, 'descricao_livre', 'A descrição livre');
        exigir(dadosForm, 'capacidade', 'A capacidade');
    }
    const pertenceInstituicao = dadosForm.pertence_pm === true || String(dadosForm.pertence_pm) === 'true';
    if (pertenceInstituicao) exigir(dadosForm, 'instituicao_carga', 'A instituição de carga');
    if (tipo === 'municao_isolada') {
        const lotesValidos = Array.isArray(dadosForm.municoes) ? dadosForm.municoes.filter((m) => m && (txt(m.quantidade) || txt(m.calibre) || txt(m.marca))) : [];
        if (!lotesValidos.length) throw new Error('Cadastre pelo menos um lote de munição.');
        for (const [i, m] of lotesValidos.entries()) {
            if (!txt(m.quantidade) || !txt(m.calibre) || !txt(m.marca)) throw new Error(`Preencha quantidade, calibre e marca no lote de munição ${i + 1}.`);
        }
    }

    const layout = {
        is_carabina: tipo === 'carabina',
        is_revolver: tipo === 'revolver',
        is_pistola: tipo === 'pistola',
        is_fuzil: tipo === 'fuzil',
        is_municao_isolada: tipo === 'municao_isolada',
        is_coringa: tipo === 'coringa' || tipo === 'outro',
        is_pm: pertenceInstituicao,
        is_eficiente: false,
        is_ineficiente: false,
        is_nao_calcou: false,
        is_rajada: false,
        is_municao_eficiente: false,
        is_municao_ineficiente: false,
        is_encaminha_custodia: false,
        is_municao_consumida: false,
        tem_imagem: false,
        imagem_vestigio: '',
        tem_lacre: false,
    };

    const fotoFinal = caminhoFoto || dadosForm.caminho_foto || dadosForm.foto || null;
    layout.tem_imagem = Boolean(fotoFinal && String(fotoFinal).trim());
    if (layout.tem_imagem) layout.imagem_vestigio = { path: fotoFinal, width: 250, height: 180 };

    const res = String(dadosForm.resultado_exame || '').toLowerCase().trim();
    if (layout.is_municao_isolada) {
        if (res === 'municao_eficiente' || res === 'eficiente') layout.is_municao_eficiente = true;
        else if (res === 'municao_ineficiente' || res === 'ineficiente') layout.is_municao_ineficiente = true;
        else throw new Error('Para munição isolada, informe se o resultado foi eficiente ou ineficiente.');
    } else {
        if (res === 'eficiente') layout.is_eficiente = true;
        else if (res === 'ineficiente') layout.is_ineficiente = true;
        else if (res === 'nao_calcou') {
            if (!layout.is_pistola) throw new Error('O resultado “Não calçou” só é compatível com o bloco de pistola deste template.');
            layout.is_nao_calcou = true;
        } else if (res === 'rajada') {
            if (layout.is_revolver) throw new Error('O resultado “Rajada” não é compatível com revólver.');
            layout.is_rajada = true;
        } else throw new Error('Selecione um resultado de exame balístico válido.');

        if (layout.is_ineficiente && !String(dadosForm.defeito_constatado || '').trim()) {
            throw new Error('Informe o defeito constatado para uma arma classificada como ineficiente.');
        }
    }

    const destino = String(dadosForm.destino || '').toLowerCase();
    if (layout.is_municao_isolada && (destino.includes('consumid') || dadosForm.municao_consumida === true || dadosForm.is_municao_consumida === true)) {
        layout.is_municao_consumida = true;
    } else {
        layout.is_encaminha_custodia = true;
    }

    const lacre = String(dadosForm.n_lacre || dadosForm.lacre || dadosForm.novoLacre || dadosForm.numero_lacre || '').trim();
    layout.tem_lacre = Boolean(lacre);

    let municoesDetalhes = '';
    if (layout.is_municao_isolada) {
        const lotes = Array.isArray(dadosForm.municoes) ? dadosForm.municoes.filter(Boolean) : [];
        const origem = lotes.length ? lotes : [{
            quantidade: dadosForm.qtd_municao || 1,
            calibre: dadosForm.calibre || '',
            marca: dadosForm.marca || '',
        }];
        const formatadas = origem.map((m) => {
            const qtd = Math.max(1, parseInt(m.quantidade, 10) || 1);
            const cal = String(m.calibre || '').trim() || 'não especificado';
            const marc = String(m.marca || '').trim() || 'não aparente';
            return `${qtd} ${qtd === 1 ? 'cartucho intacto' : 'cartuchos intactos'}, calibre ${cal}, marca ${marc}`;
        });
        if (formatadas.length === 1) municoesDetalhes = formatadas[0];
        else if (formatadas.length === 2) municoesDetalhes = `${formatadas[0]} e ${formatadas[1]}`;
        else municoesDetalhes = `${formatadas.slice(0, -1).join('; ')} e ${formatadas.at(-1)}`;
    }

    const capVal = String(dadosForm.capacidade ?? '').trim();
    let capacidadeFormatada = 'não informada';
    if (capVal) {
        const capNum = parseInt(capVal, 10);
        capacidadeFormatada = capNum === 1 ? '1 (um) tiro' : `${capVal} tiros`;
    }

    return {
        ...layout,
        calibre: dadosForm.calibre || '',
        marca: dadosForm.marca || 'não aparente',
        modelo: dadosForm.modelo || 'não aparente',
        numero_serie: dadosForm.numero_serie || 'não aparente',
        acabamento: dadosForm.acabamento || '',
        comprimento_cano: dadosForm.comprimento_cano || '',
        comprimento_total: dadosForm.comprimento_total || '',
        capacidade: dadosForm.capacidade || '',
        capacidade_texto: capacidadeFormatada,
        n_lacre: lacre,
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
        municoes_detalhes: municoesDetalhes,
    };
}

module.exports = {
    processarBalistica,
    extrairDadosArmaViaIA
};