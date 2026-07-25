// src/services/laudoProcessor.js
const processarEficienciaObjeto = require('./especies/eficienciaObjeto');

function prepararVariaveis(especie, dadosForm, perito) {
    // Parse seguro dos dados que vieram como string no form-data
    const dados = typeof dadosForm === 'string' ? JSON.parse(dadosForm) : (dadosForm || {});
    const dadosPerito = typeof perito === 'string' ? JSON.parse(perito) : (perito || {});

    // Variaveis universais que vão em todos os laudos (ex: nome do perito)
    let variaveisFinais = {
        perito_nome: dadosPerito.nome || '',
        perito_masp: dadosPerito.masp || '',
        perito_unidade: dadosPerito.unidade || ''
    };

    // Direciona para a regra de negócio correta baseada no nome da espécie
    switch (especie) {
        case 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem':
            const dadosObjeto = processarEficienciaObjeto(dados);
            variaveisFinais = { ...variaveisFinais, ...dadosObjeto };
            break;

        // case 'Determinação de Calibre':
        //     const dadosBalistica = processarBalistica(dados);
        //     variaveisFinais = { ...variaveisFinais, ...dadosBalistica };
        //     break;

        default:
            // Se não tiver processador específico ainda, manda os dados crus
            variaveisFinais = { ...variaveisFinais, ...dados };
            break;
    }

    return variaveisFinais;
}

module.exports = { prepararVariaveis };