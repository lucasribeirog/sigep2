// src/services/especies/balistica.js

function processarBalistica(dadosForm) {
    let layout = {
        is_carabina: false,
        is_revolver: false,
        is_pistola: false,
        is_fuzil: false,
        is_municao_isolada: false,
        is_coringa: false, // <-- Novo tipo coringa

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

    // 1. Tipo de material
    const tipo = dadosForm.tipo_material;
    if (tipo === 'carabina') layout.is_carabina = true;
    else if (tipo === 'revolver') layout.is_revolver = true;
    else if (tipo === 'pistola') layout.is_pistola = true;
    else if (tipo === 'fuzil') layout.is_fuzil = true;
    else if (tipo === 'municao_isolada') layout.is_municao_isolada = true;
    else if (tipo === 'coringa' || tipo === 'outro') layout.is_coringa = true; // <-- Ativa o coringa

    // 2. Origem Institucional
    if (dadosForm.pertence_pm === true || dadosForm.pertence_pm === 'true') {
        layout.is_pm = true;
    }

    // 3. Conclusão do exame
    const res = dadosForm.resultado_exame;
    if (res === 'eficiente') layout.is_eficiente = true;
    else if (res === 'ineficiente') layout.is_ineficiente = true;
    else if (res === 'nao_calcou') layout.is_nao_calcou = true;
    else if (res === 'rajada') layout.is_rajada = true;
    else if (res === 'municao_eficiente') layout.is_municao_eficiente = true;
    else if (res === 'municao_ineficiente') layout.is_municao_ineficiente = true;

    // 4. Destino do material
    if (dadosForm.destino === 'consumida') {
        layout.is_municao_consumida = true;
    } else {
        layout.is_encaminha_custodia = true;
    }

    return {
        ...layout,
        calibre: dadosForm.calibre || '',
        marca: dadosForm.marca || 'não aparente',
        modelo: dadosForm.modelo || 'não aparente',
        numero_serie: dadosForm.numero_serie || 'suprimido/não aparente',
        acabamento: dadosForm.acabamento || 'oxidado',
        comprimento_cano: dadosForm.comprimento_cano || '',
        comprimento_total: dadosForm.comprimento_total || '',
        capacidade: dadosForm.capacidade || '',
        n_lacre: dadosForm.n_lacre || '',
        defeito_constatado: dadosForm.defeito_constatado || 'mecanismo de disparo emperrado',

        tipo_acao_carabina: dadosForm.tipo_acao_carabina || 'repetição (não automática)',
        detalhes_coronha: dadosForm.detalhes_coronha || 'coronha e telha em madeira',
        sistema_alimentacao: dadosForm.sistema_alimentacao || 'sistema próprio',
        empunhadura_revolver: dadosForm.empunhadura_revolver || 'placas da empunhadura em borracha/madeira',
        carregador_info: dadosForm.carregador_info || 'acompanhada de um carregador compatível',
        detalhes_armacao: dadosForm.detalhes_armacao || 'acabamento oxidado na armação',
        detalhes_fuzil: dadosForm.detalhes_fuzil || 'coronha rebatível e empunhadura em polímero',
        qtd_municao: dadosForm.qtd_municao || '02 (dois)',
        instituicao_carga: dadosForm.instituicao_carga || 'Polícia Militar do Estado de Minas Gerais',

        // CAMPOS LIVRES PARA O CORINGA (O perito dita o que quiser)
        nome_arma_livre: dadosForm.nome_arma_livre || 'arma de fogo artesanal/específica',
        descricao_livre: dadosForm.descricao_livre || 'sem características padronizadas'
    };
}

module.exports = processarBalistica;