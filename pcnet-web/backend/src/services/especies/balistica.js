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

    // FORMATAÇÃO INTELIGENTE COM BASE NUMÉRICA (SINGULAR / PLURAL)
    let municoesDetalhes = '';
    if (Array.isArray(dadosForm.municoes) && dadosForm.municoes.length > 0) {
        const formatadas = dadosForm.municoes.map(m => {
            const qtd = m.quantidade || 1;
            const numQtd = parseInt(qtd, 10); // Converte para número real
            const cal = m.calibre || 'não especificado';
            const marc = m.marca || 'não aparente';

            // Se o número for exatamente 1, usa singular. Caso contrário, plural.
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
        municoesDetalhes = '1 cartucho intacto';
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

module.exports = processarBalistica;