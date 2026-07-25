// src/services/laudoProcessor.js
const processarEficienciaObjeto = require('./especies/eficienciaObjeto');
const processarBalistica = require('./especies/balistica'); // <-- 1. Importa o processador de balística

function prepararVariaveis(especie, dadosForm, perito) {
    const dados = typeof dadosForm === 'string' ? JSON.parse(dadosForm) : (dadosForm || {});
    const dadosPerito = typeof perito === 'string' ? JSON.parse(perito) : (perito || {});

    // Informações universais do perito (caso seu template use)
    let variaveisFinais = {
        perito_nome: dadosPerito.nome || '',
        perito_masp: dadosPerito.masp || '',
        perito_unidade: dadosPerito.unidade || ''
    };

    // 2. Direciona com base no nome exato da espécie cadastrada
    switch (especie) {
        case 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem':
            const dadosObjeto = processarEficienciaObjeto(dados);
            variaveisFinais = { ...variaveisFinais, ...dadosObjeto };
            break;

        case 'Eficiencia Armas de Fogo e/ou municoes': // Ajuste para o nome exato que está no seu catálogo/banco
            const dadosBalistica = processarBalistica(dados);
            variaveisFinais = { ...variaveisFinais, ...dadosBalistica };
            break;

        default:
            variaveisFinais = { ...variaveisFinais, ...dados };
            break;
    }

    return variaveisFinais;
}

module.exports = { prepararVariaveis };