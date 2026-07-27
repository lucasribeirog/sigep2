const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('docxtemplater-image-module-free');
const path = require('path');
const { execSync } = require('child_process');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { prepararVariaveis, analisarImagemPericial } = require('../services/laudoProcessor');
const db = require('../config/database');
const fs = require('fs');
const sizeOf = require('image-size');

function cadastrarEspecieCatalogo(req, res) {
    const itens = Array.isArray(req.body) ? req.body : [req.body];

    if (itens.length === 0) {
        return res.status(400).json({ erro: 'Nenhum item foi enviado no corpo da requisição.' });
    }

    const query = `INSERT OR IGNORE INTO catalogo_especies (natureza, especie) VALUES (?, ?)`;
    let inseridos = 0;

    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        const stmt = db.prepare(query);
        
        itens.forEach(item => {
            if (item.natureza && item.especie) {
                stmt.run([item.natureza, item.especie], function(err) {
                    if (!err && this.changes > 0) {
                        inseridos++;
                    }
                });
            }
        });

        stmt.finalize();

        db.run('COMMIT', (err) => {
            if (err) {
                return res.status(500).json({ erro: 'Erro ao processar o lote no banco de dados.' });
            }
            res.status(201).json({ 
                mensagem: `Processo concluído com sucesso! Novos registros inseridos: ${inseridos}.` 
            });
        });
    });
}

function listarCatalogo(req, res) {
    db.all(`SELECT * FROM catalogo_especies`, [], (err, linhas) => {
        if (err) {
            return res.status(500).json({ erro: 'Erro ao buscar catálogo.' });
        }
        res.json(linhas);
    });
}

function salvarTemplate(req, res) {
    const { especie } = req.body;
    const arquivoBlob = req.file ? req.file.buffer : null;

    if (!especie || !arquivoBlob) {
        return res.status(400).json({ erro: 'A espécie e o arquivo .docx são obrigatórios.' });
    }

    db.get(`SELECT * FROM catalogo_especies WHERE especie = ?`, [especie], (err, especieValida) => {
        if (err || !especieValida) {
            return res.status(403).json({ 
                erro: `A espécie "${especie}" não está cadastrada no catálogo oficial. Cadastre-a primeiro antes de enviar o template.` 
            });
        }

        const query = `
            INSERT INTO templates_laudo (especie, arquivo) 
            VALUES (?, ?)
            ON CONFLICT(especie) DO UPDATE SET 
            arquivo = excluded.arquivo,
            atualizado_em = CURRENT_TIMESTAMP
        `;

        db.run(query, [especie, arquivoBlob], function(err) {
            if (err) {
                return res.status(500).json({ erro: 'Erro ao salvar o template no banco: ' + err.message });
            }
            res.json({ mensagem: `Template .docx vinculado com sucesso à espécie: ${especie}` });
        });
    });
}

function gerarLaudo(req, res) {
    const { especie, dadosForm, perito } = req.body;
    
    const arquivoPCNetBlob = req.files && req.files['arquivo_pcnet'] ? req.files['arquivo_pcnet'][0].buffer : (req.file ? req.file.buffer : null);
    const fotoBuffer = req.files && req.files['foto_objeto'] ? req.files['foto_objeto'][0].buffer : null;

    if (!especie || !arquivoPCNetBlob) {
        return res.status(400).json({ erro: 'A espécie e o arquivo original do PCNet são obrigatórios.' });
    }

    let fotoPathTemp = null;

    const query = `SELECT arquivo FROM templates_laudo WHERE especie = ?`;
    
    db.get(query, [especie], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ erro: `Template não encontrado para a espécie "${especie}".` });
        }

        try {
            let dadosSeguros = {};
            if (dadosForm) {
                try {
                    dadosSeguros = typeof dadosForm === 'string' ? JSON.parse(dadosForm) : dadosForm;
                } catch (e) {
                    dadosSeguros = req.body;
                }
            } else {
                dadosSeguros = req.body;
            }

            const variaveisTemplate = prepararVariaveis(especie, dadosSeguros, perito);

            if (fotoBuffer) {
                const tempDir = path.resolve(__dirname, '../../temp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                fotoPathTemp = path.join(tempDir, `vestigio_${Date.now()}.jpg`);
                fs.writeFileSync(fotoPathTemp, fotoBuffer);
            }

            variaveisTemplate.tem_imagem = !!fotoBuffer;
            variaveisTemplate.imagem_vestigio = fotoPathTemp || '';

            const zipTemplate = new PizZip(row.arquivo);
            
            const imageOptions = {
                centered: true, 
                getImage(tagValue) { 
                    if (!tagValue || !fs.existsSync(tagValue)) return Buffer.from('');
                    return fs.readFileSync(tagValue); 
                },
                getSize(img, tagValue, tagName) { 
                    try {
                        const dimensions = typeof sizeOf === 'function' ? sizeOf(img) : (sizeOf.imageSize ? sizeOf.imageSize(img) : null);
                        if (!dimensions || !dimensions.width || !dimensions.height) {
                            return [500, 378];
                        }
                        const larguraOriginal = dimensions.width;
                        const alturaOriginal = dimensions.height;
                        const alturaDesejada = 378; // 10 cm exatos
                        const larguraProporcional = Math.round((larguraOriginal * alturaDesejada) / alturaOriginal);
                        
                        return [larguraProporcional, alturaDesejada]; 
                    } catch (err) {
                        return [500, 378];
                    }
                }
            };
            const imageModule = new ImageModule(imageOptions);

            const docTemplate = new Docxtemplater(zipTemplate, { 
                paragraphLoop: true, 
                linebreaks: true,
                modules: [imageModule] 
            });
            
            docTemplate.render(variaveisTemplate);
            const xmlTemplatePreenchido = docTemplate.getZip().file('word/document.xml').asText();

            const zipPCNet = new PizZip(arquivoPCNetBlob);
            const xmlPCNetOriginal = zipPCNet.file('word/document.xml').asText();

            const docPCNet = new DOMParser().parseFromString(xmlPCNetOriginal, 'text/xml');
            const docTemp = new DOMParser().parseFromString(xmlTemplatePreenchido, 'text/xml');

            const bodyPCNet = docPCNet.getElementsByTagName('w:body')[0];
            const bodyTemp = docTemp.getElementsByTagName('w:body')[0];

            let nodesToRemove = [];
            let corteEncontrado = false;

            for (let i = 0; i < bodyPCNet.childNodes.length; i++) {
                const node = bodyPCNet.childNodes[i];

                if (!corteEncontrado && node.textContent && node.textContent.includes('HISTÓRICO')) {
                    corteEncontrado = true;
                }

                if (corteEncontrado) {
                    if (node.nodeName !== 'w:sectPr') {
                        nodesToRemove.push(node);
                    }
                }
            }

            nodesToRemove.forEach(node => bodyPCNet.removeChild(node));

            for (let i = 0; i < bodyTemp.childNodes.length; i++) {
                const node = bodyTemp.childNodes[i];
                
                if (node.nodeName !== 'w:sectPr') { 
                    const importedNode = docPCNet.importNode(node, true);
                    
                    const sectPr = bodyPCNet.getElementsByTagName('w:sectPr')[0];
                    if (sectPr) {
                        bodyPCNet.insertBefore(importedNode, sectPr);
                    } else {
                        bodyPCNet.appendChild(importedNode);
                    }
                }
            }

            let idMapping = {};

            if (fotoBuffer) {
                const templateZip = docTemplate.getZip();
                
                Object.keys(templateZip.files).forEach(filename => {
                    if (filename.startsWith('word/media/')) {
                        const fileObj = templateZip.file(filename);
                        if (fileObj && !fileObj.dir) {
                            zipPCNet.file(filename, fileObj.asNodeBuffer());
                        }
                    }
                });

                const templateRelsFile = templateZip.file('word/_rels/document.xml.rels');
                if (templateRelsFile) {
                    const domParser = new DOMParser();
                    const serializer = new XMLSerializer();

                    const relsDocTemp = domParser.parseFromString(templateRelsFile.asText(), 'text/xml');
                    const pcnetRelsPath = 'word/_rels/document.xml.rels';
                    const pcnetRelsFile = zipPCNet.file(pcnetRelsPath);

                    let relsDocPCNet;
                    if (pcnetRelsFile) {
                        relsDocPCNet = domParser.parseFromString(pcnetRelsFile.asText(), 'text/xml');
                    } else {
                        relsDocPCNet = domParser.parseFromString('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>', 'text/xml');
                    }

                    const relationshipsPCNet = relsDocPCNet.getElementsByTagName('Relationships')[0];
                    const imageRels = relsDocTemp.getElementsByTagName('Relationship');

                    let maxIdNum = 1;
                    const existingRels = relsDocPCNet.getElementsByTagName('Relationship');
                    for (let i = 0; i < existingRels.length; i++) {
                        const idAttr = existingRels[i].getAttribute('Id');
                        if (idAttr && idAttr.startsWith('rId')) {
                            const num = parseInt(idAttr.replace('rId', ''), 10);
                            if (!isNaN(num) && num >= maxIdNum) {
                                maxIdNum = num + 1;
                            }
                        }
                    }

                    for (let i = 0; i < imageRels.length; i++) {
                        const rel = imageRels[i];
                        const type = rel.getAttribute('Type') || '';
                        if (type.includes('/image')) {
                            const oldId = rel.getAttribute('Id');
                            const newId = `rId${maxIdNum}`;
                            maxIdNum++;

                            if (oldId) {
                                idMapping[oldId] = newId;
                            }

                            const importedRel = relsDocPCNet.importNode(rel, true);
                            importedRel.setAttribute('Id', newId);
                            relationshipsPCNet.appendChild(importedRel);
                        }
                    }

                    zipPCNet.file(pcnetRelsPath, serializer.serializeToString(relsDocPCNet));
                }
            }

            let xmlFinalUnificado = new XMLSerializer().serializeToString(docPCNet);

            if (Object.keys(idMapping).length > 0) {
                Object.keys(idMapping).forEach(oldId => {
                    const newId = idMapping[oldId];
                    // Correção essencial: substitui r:embed além de r:id para atualizar o vínculo da imagem corretamente
                    xmlFinalUnificado = xmlFinalUnificado.replace(new RegExp(`r:embed="${oldId}"`, 'g'), `r:embed="${newId}"`);
                    xmlFinalUnificado = xmlFinalUnificado.replace(new RegExp(`r:id="${oldId}"`, 'g'), `r:id="${newId}"`);
                });
            }

            zipPCNet.file('word/document.xml', xmlFinalUnificado);

            const buf = zipPCNet.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
            const nomeOriginal = req.files && req.files['arquivo_pcnet'] ? req.files['arquivo_pcnet'][0].originalname : (req.file ? req.file.originalname : `laudo_${especie}.docx`);

            res.setHeader('Content-Disposition', `attachment; filename=${nomeOriginal}`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.send(buf);

        } catch (error) {
            console.error("Erro na cirurgia:", error);
            res.status(500).json({ erro: 'Erro na cirurgia do documento Word: ' + error.message });
        } finally {
            if (fotoPathTemp && fs.existsSync(fotoPathTemp)) {
                fs.unlinkSync(fotoPathTemp);
            }
        }
    });
}

const gerarLaudoPdf = async (req, res) => {
    const { especie, dadosForm, perito } = req.body;
    
    const arquivoPCNetBlob = req.files && req.files['arquivo_pcnet'] ? req.files['arquivo_pcnet'][0].buffer : (req.file ? req.file.buffer : null);
    const fotoBuffer = req.files && req.files['foto_objeto'] ? req.files['foto_objeto'][0].buffer : null;

    if (!especie || !arquivoPCNetBlob) {
        return res.status(400).json({ erro: 'A espécie e o arquivo original do PCNet são obrigatórios.' });
    }

    let fotoPathTemp = null;

    const query = `SELECT arquivo FROM templates_laudo WHERE especie = ?`;
    
    db.get(query, [especie], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ erro: `Template não encontrado para a espécie "${especie}".` });
        }

        try {
            let dadosSeguros = {};
            if (dadosForm) {
                try {
                    dadosSeguros = typeof dadosForm === 'string' ? JSON.parse(dadosForm) : dadosForm;
                } catch (e) {
                    dadosSeguros = req.body;
                }
            } else {
                dadosSeguros = req.body;
            }

            const variaveisTemplate = prepararVariaveis(especie, dadosSeguros, perito);

            if (fotoBuffer) {
                const tempDir = path.resolve(__dirname, '../../temp');
                if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                fotoPathTemp = path.join(tempDir, `vestigio_${Date.now()}.jpg`);
                fs.writeFileSync(fotoPathTemp, fotoBuffer);
            }

            variaveisTemplate.tem_imagem = !!fotoBuffer;
            variaveisTemplate.imagem_vestigio = fotoPathTemp || '';

            const zipTemplate = new PizZip(row.arquivo);
            
            const imageOptions = {
                centered: true, 
                getImage(tagValue) { 
                    if (!tagValue || !fs.existsSync(tagValue)) return Buffer.from('');
                    return fs.readFileSync(tagValue); 
                },
                getSize(img, tagValue, tagName) { 
                    try {
                        const dimensions = typeof sizeOf === 'function' ? sizeOf(img) : (sizeOf.imageSize ? sizeOf.imageSize(img) : null);
                        if (!dimensions || !dimensions.width || !dimensions.height) {
                            return [500, 378];
                        }
                        const larguraOriginal = dimensions.width;
                        const alturaOriginal = dimensions.height;
                        const alturaDesejada = 378; // 10 cm exatos
                        const larguraProporcional = Math.round((larguraOriginal * alturaDesejada) / alturaOriginal);
                        
                        return [larguraProporcional, alturaDesejada]; 
                    } catch (err) {
                        return [500, 378];
                    }
                }
            };
            const imageModule = new ImageModule(imageOptions);

            const docTemplate = new Docxtemplater(zipTemplate, { 
                paragraphLoop: true, 
                linebreaks: true,
                modules: [imageModule] 
            });
            docTemplate.render(variaveisTemplate);
            const xmlTemplatePreenchido = docTemplate.getZip().file('word/document.xml').asText();

            const zipPCNet = new PizZip(arquivoPCNetBlob);
            const xmlPCNetOriginal = zipPCNet.file('word/document.xml').asText();

            const docPCNet = new DOMParser().parseFromString(xmlPCNetOriginal, 'text/xml');
            const docTemp = new DOMParser().parseFromString(xmlTemplatePreenchido, 'text/xml');

            const bodyPCNet = docPCNet.getElementsByTagName('w:body')[0];
            const bodyTemp = docTemp.getElementsByTagName('w:body')[0];

            let nodesToRemove = [];
            let corteEncontrado = false;

            for (let i = 0; i < bodyPCNet.childNodes.length; i++) {
                const node = bodyPCNet.childNodes[i];

                if (!corteEncontrado && node.textContent && node.textContent.includes('HISTÓRICO')) {
                    corteEncontrado = true;
                }

                if (corteEncontrado) {
                    if (node.nodeName !== 'w:sectPr') {
                        nodesToRemove.push(node);
                    }
                }
            }

            nodesToRemove.forEach(node => bodyPCNet.removeChild(node));

            for (let i = 0; i < bodyTemp.childNodes.length; i++) {
                const node = bodyTemp.childNodes[i];
                
                if (node.nodeName !== 'w:sectPr') { 
                    const importedNode = docPCNet.importNode(node, true);
                    
                    const sectPr = bodyPCNet.getElementsByTagName('w:sectPr')[0];
                    if (sectPr) {
                        bodyPCNet.insertBefore(importedNode, sectPr);
                    } else {
                        bodyPCNet.appendChild(importedNode);
                    }
                }
            }

            let idMapping = {};

            if (fotoBuffer) {
                const templateZip = docTemplate.getZip();
                
                Object.keys(templateZip.files).forEach(filename => {
                    if (filename.startsWith('word/media/')) {
                        const fileObj = templateZip.file(filename);
                        if (fileObj && !fileObj.dir) {
                            zipPCNet.file(filename, fileObj.asNodeBuffer());
                        }
                    }
                });

                const templateRelsFile = templateZip.file('word/_rels/document.xml.rels');
                if (templateRelsFile) {
                    const domParser = new DOMParser();
                    const serializer = new XMLSerializer();

                    const relsDocTemp = domParser.parseFromString(templateRelsFile.asText(), 'text/xml');
                    const pcnetRelsPath = 'word/_rels/document.xml.rels';
                    const pcnetRelsFile = zipPCNet.file(pcnetRelsPath);

                    let relsDocPCNet;
                    if (pcnetRelsFile) {
                        relsDocPCNet = domParser.parseFromString(pcnetRelsFile.asText(), 'text/xml');
                    } else {
                        relsDocPCNet = domParser.parseFromString('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>', 'text/xml');
                    }

                    const relationshipsPCNet = relsDocPCNet.getElementsByTagName('Relationships')[0];
                    const imageRels = relsDocTemp.getElementsByTagName('Relationship');

                    let maxIdNum = 1;
                    const existingRels = relsDocPCNet.getElementsByTagName('Relationship');
                    for (let i = 0; i < existingRels.length; i++) {
                        const idAttr = existingRels[i].getAttribute('Id');
                        if (idAttr && idAttr.startsWith('rId')) {
                            const num = parseInt(idAttr.replace('rId', ''), 10);
                            if (!isNaN(num) && num >= maxIdNum) {
                                maxIdNum = num + 1;
                            }
                        }
                    }

                    for (let i = 0; i < imageRels.length; i++) {
                        const rel = imageRels[i];
                        const type = rel.getAttribute('Type') || '';
                        if (type.includes('/image')) {
                            const oldId = rel.getAttribute('Id');
                            const newId = `rId${maxIdNum}`;
                            maxIdNum++;

                            if (oldId) {
                                idMapping[oldId] = newId;
                            }

                            const importedRel = relsDocPCNet.importNode(rel, true);
                            importedRel.setAttribute('Id', newId);
                            relationshipsPCNet.appendChild(importedRel);
                        }
                    }

                    zipPCNet.file(pcnetRelsPath, serializer.serializeToString(relsDocPCNet));
                }
            }

            let xmlFinalUnificado = new XMLSerializer().serializeToString(docPCNet);

            if (Object.keys(idMapping).length > 0) {
                Object.keys(idMapping).forEach(oldId => {
                    const newId = idMapping[oldId];
                    xmlFinalUnificado = xmlFinalUnificado.replace(new RegExp(`r:embed="${oldId}"`, 'g'), `r:embed="${newId}"`);
                    xmlFinalUnificado = xmlFinalUnificado.replace(new RegExp(`r:id="${oldId}"`, 'g'), `r:id="${newId}"`);
                });
            }

            zipPCNet.file('word/document.xml', xmlFinalUnificado);

            const docxBufferFinal = zipPCNet.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

            const tempDir = path.resolve(__dirname, '../../temp');
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

            const arquivoId = Date.now();
            const docxPath = path.join(tempDir, `laudo_${arquivoId}.docx`);
            const pdfPath = path.join(tempDir, `laudo_${arquivoId}.pdf`);

            fs.writeFileSync(docxPath, docxBufferFinal);

            const isWindows = process.platform === 'win32';
            const caminhoWindows = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';
            const caminhoAlternativo = 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe';
            
            let temLibreOffice = false;
            let executavelLo = '';

            if (isWindows) {
                if (fs.existsSync(caminhoWindows)) {
                    temLibreOffice = true;
                    executavelLo = `"${caminhoWindows}"`;
                } else if (fs.existsSync(caminhoAlternativo)) {
                    temLibreOffice = true;
                    executavelLo = `"${caminhoAlternativo}"`;
                }
            } else {
                temLibreOffice = true;
                executavelLo = 'libreoffice';
            }

            if (!temLibreOffice) {
                if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath);
                return res.status(400).json({ erro: 'O LibreOffice não foi encontrado no caminho padrão do Windows.' });
            }

            execSync(`${executavelLo} --headless --convert-to pdf --outdir "${tempDir}" "${docxPath}"`);

            if (fs.existsSync(pdfPath)) {
                res.download(pdfPath, `Laudo_Oficial_${arquivoId}.pdf`, (err) => {
                    setTimeout(() => {
                        if (fs.existsSync(docxPath)) fs.unlinkSync(docxPath);
                        if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
                    }, 5000);
                });
            } else {
                res.status(500).json({ erro: 'O arquivo PDF convertido não foi encontrado.' });
            }

        } catch (error) {
            console.error('Erro ao processar PDF do laudo:', error);
            res.status(500).json({ erro: 'Erro ao processar PDF: ' + error.message });
        } finally {
            if (fotoPathTemp && fs.existsSync(fotoPathTemp)) {
                fs.unlinkSync(fotoPathTemp);
            }
        }
    });
};

const analisarFotoObjeto = async (req, res) => {
    let tempImagePath = null;

    try {
        const imagemBuffer = req.file ? req.file.buffer : null;
        const especieInformada = req.body.especie || 'Eficiencia Armas de Fogo e/ou municoes';

        if (!imagemBuffer) {
            return res.status(400).json({ erro: 'Nenhuma imagem com escala foi enviada.' });
        }

        const tempDir = path.resolve(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const arquivoId = Date.now();
        tempImagePath = path.join(tempDir, `foto_analise_${arquivoId}.jpg`);
        fs.writeFileSync(tempImagePath, imagemBuffer);

        const dadosExtraidos = await analisarImagemPericial(tempImagePath, especieInformada);

        if (fs.existsSync(tempImagePath)) fs.unlinkSync(tempImagePath);

        return res.json({
            mensagem: "Imagem analisada com sucesso via IA e Visão Computacional!",
            dadosForm: dadosExtraidos, 
            imagemProcessadaBase64: `data:${req.file.mimetype};base64,${imagemBuffer.toString('base64')}`
        });

    } catch (error) {
        console.error('Erro ao analisar a foto do objeto:', error);
        
        if (tempImagePath && fs.existsSync(tempImagePath)) {
            fs.unlinkSync(tempImagePath);
        }
        
        res.status(500).json({ erro: 'Falha ao processar a imagem pericial: ' + error.message });
    }
};

module.exports = { 
    cadastrarEspecieCatalogo, 
    listarCatalogo, 
    salvarTemplate, 
    gerarLaudo, 
    gerarLaudoPdf, 
    analisarFotoObjeto 
};