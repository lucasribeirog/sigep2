// src/services/laudoProcessor.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

// IMPORTANTE: Atualize a forma de importar para desestruturar os objetos, 
// pois agora esses arquivos exportam mais de uma função.
const { processarBalistica, extrairDadosArmaViaIA } = require('./especies/balistica');
const { medirComEscala } = require('./metrologia'); // O novo arquivo que criamos
// Se criar a IA para objetos cortantes futuramente, importe-a aqui:
const processarEficienciaObjeto = require('./especies/eficienciaObjeto');


// ============================================================================
// PASSO 1: ANÁLISE DA IMAGEM (NOVA FUNÇÃO)
// ============================================================================
/**
 * Recebe a imagem upada e orquestra a IA Semântica (Gemini) 
 * e a Visão Computacional Geométrica (OpenCV/Python) simultaneamente.
 */
async function analisarImagemPericial(caminhoImagem, especie) {
    let dadosQualitativosMetricos;

    switch (especie) {
        case 'Eficiencia Armas de Fogo e/ou municoes':
            dadosQualitativosMetricos = await extrairDadosArmaViaIA(caminhoImagem);
            break;
        case 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem':
            // analiseIAPromise = extrairDadosObjetoViaIA(caminhoImagem);
            dadosQualitativosMetricos = {}; // Mock temporário
            break;
        default:
            throw new Error('Espécie não suportada para análise automatizada.');
    }

    // Retorna diretamente os dados estruturados extraídos pela IA da imagem e da régua
    return dadosQualitativosMetricos;
}


// ============================================================================
// PASSO 2: GERAÇÃO DO DOCUMENTO WORD/PDF (SEU CÓDIGO INTACTO)
// ============================================================================
function prepararVariaveis(especie, dadosForm, perito) {
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
            // Esta chamada usará os dados validados pelo perito após a IA
            const dadosBalistica = processarBalistica(dados);
            variaveisFinais = { ...variaveisFinais, ...dadosBalistica };
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
    // 1. Prepara as variáveis usando a sua lógica existente
    const variaveis = prepararVariaveis(especie, dadosForm, perito);

    // 2. Seleciona o template correto com base na espécie
    let nomeTemplate = 'modelo_balist_1.docx';
    if (especie && especie.includes('Objeto')) {
        nomeTemplate = 'modelo_pat_1.docx';
    }

    // O template está na raiz do backend
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

    // Renderiza o template com as variáveis tratadas
    doc.render(variaveis);
    const buf = doc.getZip().generate({ type: 'nodebuffer' });

    // Pasta temporária para manipulação dos arquivos
    const tempDir = path.resolve(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

    const arquivoId = Date.now();
    const docxPath = path.join(tempDir, `laudo_${arquivoId}.docx`);
    const pdfPath = path.join(tempDir, `laudo_${arquivoId}.pdf`);

    // Salva o arquivo Word temporário preenchido
    fs.writeFileSync(docxPath, buf);

    let caminhoFinal = docxPath;
    let formatoRetorno = 'docx';

    // 3. Se solicitado PDF, converte o DOCX gerado utilizando o LibreOffice instalado no servidor
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