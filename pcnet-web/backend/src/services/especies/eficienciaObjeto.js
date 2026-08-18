function texto(v) { return String(v ?? '').trim(); }
function exigir(dados, campo, rotulo) {
    if (!texto(dados[campo])) throw new Error(`${rotulo} é obrigatório para este tipo de objeto.`);
}

function processarEficienciaObjeto(dadosForm) {
    const tipo = texto(dadosForm.tipo_objeto).toLowerCase();
    if (!['faca', 'canivete', 'madeira', 'outro'].includes(tipo)) {
        throw new Error('Selecione um tipo de objeto válido.');
    }

    const resultado = texto(dadosForm.resultado_eficiencia).toLowerCase();
    if (!['eficiente', 'ineficiente'].includes(resultado)) {
        throw new Error('Selecione o resultado de eficiência do objeto.');
    }

    exigir(dadosForm, 'n_fav', 'O número da FAV');
    exigir(dadosForm, 'unidade_custodia', 'A unidade de custódia');

    if (tipo === 'faca') {
        exigir(dadosForm, 'material_cabo', 'O material do cabo');
        exigir(dadosForm, 'cor_cabo', 'A cor do cabo');
        exigir(dadosForm, 'comp_lamina', 'O comprimento da lâmina');
        exigir(dadosForm, 'largura_base', 'A largura na base');
        exigir(dadosForm, 'comp_total', 'O comprimento total');
    } else if (tipo === 'canivete') {
        exigir(dadosForm, 'tipo_abertura', 'O tipo de abertura');
        exigir(dadosForm, 'material_cabo', 'O material do cabo');
        exigir(dadosForm, 'comp_lamina', 'O comprimento da lâmina');
    } else if (tipo === 'madeira') {
        exigir(dadosForm, 'secao_madeira', 'A seção da peça de madeira');
        exigir(dadosForm, 'comp_madeira', 'A primeira dimensão da seção');
        exigir(dadosForm, 'larg_madeira', 'A segunda dimensão da seção');
        exigir(dadosForm, 'comp_total', 'O comprimento total');
        exigir(dadosForm, 'massa', 'A massa');
    } else {
        for (const [campo, rotulo] of [
            ['nome_objeto', 'O nome do objeto'], ['material_predominante', 'O material predominante'],
            ['cor_objeto', 'A cor do objeto'], ['compr_objeto', 'O comprimento'],
            ['larg_objeto', 'A largura'], ['espessura_objeto', 'A espessura/altura'],
            ['massa_objeto', 'A massa'],
        ]) exigir(dadosForm, campo, rotulo);
    }

    const lacre = texto(dadosForm.n_lacre);
    return {
        is_faca: tipo === 'faca',
        is_canivete: tipo === 'canivete',
        is_madeira: tipo === 'madeira',
        is_outro: tipo === 'outro',
        is_eficiente: resultado === 'eficiente',
        is_ineficiente: resultado === 'ineficiente',
        tem_lacre: Boolean(lacre),

        n_lacre: lacre,
        n_fav: texto(dadosForm.n_fav),
        unidade_custodia: texto(dadosForm.unidade_custodia),

        marca: texto(dadosForm.marca) || 'não aparente',
        material_cabo: texto(dadosForm.material_cabo),
        cor_cabo: texto(dadosForm.cor_cabo),
        comp_lamina: texto(dadosForm.comp_lamina),
        largura_base: texto(dadosForm.largura_base),
        comp_total: texto(dadosForm.comp_total),
        tipo_abertura: texto(dadosForm.tipo_abertura),

        secao_madeira: texto(dadosForm.secao_madeira),
        comp_madeira: texto(dadosForm.comp_madeira),
        larg_madeira: texto(dadosForm.larg_madeira),
        massa: texto(dadosForm.massa),

        nome_objeto: texto(dadosForm.nome_objeto),
        material_predominante: texto(dadosForm.material_predominante),
        cor_objeto: texto(dadosForm.cor_objeto),
        compr_objeto: texto(dadosForm.compr_objeto),
        larg_objeto: texto(dadosForm.larg_objeto),
        espessura_objeto: texto(dadosForm.espessura_objeto),
        massa_objeto: texto(dadosForm.massa_objeto),
    };
}

module.exports = processarEficienciaObjeto;
