// src/services/especies/eficienciaObjeto.js

function processarEficienciaObjeto(dadosForm) {
    // 1. Inicializa todas as condicionais de visibilidade do Word como falsas
    let layout = {
        is_faca: false,
        is_canivete: false,
        is_madeira: false,
        is_outro: false,
        is_eficiente: false,
        is_ineficiente: false
    };

    // 2. Define qual bloco de texto do objeto vai aparecer baseado na escolha
    if (dadosForm.tipo_objeto === 'faca') layout.is_faca = true;
    else if (dadosForm.tipo_objeto === 'canivete') layout.is_canivete = true;
    else if (dadosForm.tipo_objeto === 'madeira') layout.is_madeira = true;
    else layout.is_outro = true;

    // 3. Define a conclusão
    if (dadosForm.resultado_eficiencia === 'eficiente') layout.is_eficiente = true;
    else layout.is_ineficiente = true;

    // 4. Retorna a junção do layout com os dados preenchidos
    return {
        ...layout,
        // Dados Comuns de Encaminhamento
        n_lacre: dadosForm.n_lacre || '',
        n_fav: dadosForm.n_fav || '',
        unidade_custodia: dadosForm.unidade_custodia || '',
        
        // Dados da Faca / Canivete
        marca: dadosForm.marca || 'não aparente',
        material_cabo: dadosForm.material_cabo || '',
        cor_cabo: dadosForm.cor_cabo || '',
        comp_lamina: dadosForm.comp_lamina || '',
        largura_base: dadosForm.largura_base || '',
        comp_total: dadosForm.comp_total || '',
        tipo_abertura: dadosForm.tipo_abertura || '',
        
        // Dados da Madeira
        secao_madeira: dadosForm.secao_madeira || '',
        comp_madeira: dadosForm.comp_madeira || '',
        larg_madeira: dadosForm.larg_madeira || '',
        massa: dadosForm.massa || '',

        // Dados de Outros Objetos
        nome_objeto: dadosForm.nome_objeto || '',
        material_predominante: dadosForm.material_predominante || '',
        cor_objeto: dadosForm.cor_objeto || '',
        compr_objeto: dadosForm.compr_objeto || '',
        larg_objeto: dadosForm.larg_objeto || '',
        espessura_objeto: dadosForm.espessura_objeto || '',
        massa_objeto: dadosForm.massa_objeto || ''
    };
}

module.exports = processarEficienciaObjeto;