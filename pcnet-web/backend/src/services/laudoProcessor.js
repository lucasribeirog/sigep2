// src/services/laudoProcessor.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const { processarBalistica, extrairDadosArmaViaIA } = require('./especies/balistica');
const { processarDrogas, extrairDadosDrogasViaIA } = require('./especies/drogas');
const { medirComEscala } = require('./metrologia'); 
const processarEficienciaObjeto = require('./especies/eficienciaObjeto');


// ============================================================================
// PASSO 1: ANÁLISE DA IMAGEM
// ============================================================================
async function analisarImagemPericial(caminhoImagem, especie) {
    let dadosQualitativosMetricos;

    switch (especie) {
        case 'Eficiencia Armas de Fogo e/ou municoes':
            dadosQualitativosMetricos = await extrairDadosArmaViaIA(caminhoImagem);
            break;
        case 'Laudo Preliminar de Constatação de Drogas': 
            dadosQualitativosMetricos = await extrairDadosDrogasViaIA(caminhoImagem);
            break;
        case 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem':
            dadosQualitativosMetricos = {}; 
            break;
        default:
            throw new Error('Espécie não suportada para análise automatizada.');
    }

    return dadosQualitativosMetricos;
}


// ============================================================================
// PASSO 2: GERAÇÃO DO DOCUMENTO WORD/PDF
// ============================================================================
// Adicionado o parâmetro opcional 'favDetectada' para injetar a FAV do PCNet
function prepararVariaveis(especie, dadosForm, perito, favDetectada = null) {
    const dados = typeof dadosForm === 'string' ? JSON.parse(dadosForm) : (dadosForm || {});
    const dadosPerito = typeof perito === 'string' ? JSON.parse(perito) : (perito || {});

    let variaveisFinais = {
        perito_nome: dadosPerito.nome || '',
        perito_masp: dadosPerito.masp || '',
        perito_unidade: dadosPerito.unidade || ''
    };

    switch (especie) {
        case 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem':
            const dadosObjeto = processarEficienciaObjeto(dados);
            variaveisFinais = { ...variaveisFinais, ...dadosObjeto };
            break;

        case 'Eficiencia Armas de Fogo e/ou municoes':
            const dadosBalistica = processarBalistica(dados);
            variaveisFinais = { ...variaveisFinais, ...dadosBalistica };
            break;

        case 'Laudo Preliminar de Constatação de Drogas': 
            // Repassa a FAV detectada do PCNet para o processador de drogas
            const dadosDrogas = processarDrogas(dados, null, favDetectada);
            variaveisFinais = { ...variaveisFinais, ...dadosDrogas };
            break;

        default:
            variaveisFinais = { ...variaveisFinais, ...dados };
            break;
    }

    return variaveisFinais;
}

/**
 * Gera o documento Word preenchido e opcionalmente converte para PDF via LibreOffice
 */
async function gerarDocumentoLaudo(especie, dadosForm, perito, gerarPdf = false) {
    const variaveis = prepararVariaveis(especie, dadosForm, perito);

    let nomeTemplate = 'modelo_balist_1.docx';
    if (especie && especie.includes('Objeto')) {
        nomeTemplate = 'modelo_pat_1.docx';
    } else if (especie && especie.includes('Drogas')) {
        nomeTemplate = 'modelo_drogas_1.docx';
    }

    const templatePath = path.resolve(__dirname, '../../', nomeTemplate);
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template ${nomeTemplate} não encontrado no servidor.`);
    }

    const content = fs.readFileSync(templatePath, 'binary');
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
    });

    doc.render(variaveis);
    const buf = doc.getZip().generate({ type: 'nodebuffer' });

    const tempDir = path.resolve(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const arquivoId = Date.now();
    const docxPath = path.join(tempDir, `laudo_${arquivoId}.docx`);
    const pdfPath = path.join(tempDir, `laudo_${arquivoId}.pdf`);

    fs.writeFileSync(docxPath, buf);

    let caminhoFinal = docxPath;
    let formatoRetorno = 'docx';

    if (gerarPdf) {
        try {
            execSync(`libreoffice --headless --convert-to pdf --outdir "${tempDir}" "${docxPath}"`);
            if (fs.existsSync(pdfPath)) {
                caminhoFinal = pdfPath;
                formatoRetorno = 'pdf';
            } else {
                throw new Error('O arquivo PDF convertido não foi localizado.');
            }
        } catch (err) {
            console.error('Erro na conversão para PDF via LibreOffice:', err);
            throw new Error('Falha ao converter o documento para PDF de alta fidelidade.');
        }
    }

    return {
        id: arquivoId,
        caminhoArquivo: caminhoFinal,
        formato: formatoRetorno,
        nomeSugerido: `Laudo_Oficial_${arquivoId}.${formatoRetorno}`
    };
}

// ============================================================================
// EXPORTAÇÕES
// ============================================================================
module.exports = { 
    analisarImagemPericial, 
    prepararVariaveis, 
    gerarDocumentoLaudo 
};