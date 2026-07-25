const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { prepararVariaveis } = require('../services/laudoProcessor');
const db = require('../config/database');

// Cadastra uma nova espécie permitida no catálogo oficial
// Cadastra uma ou várias espécies no catálogo oficial de uma vez
function cadastrarEspecieCatalogo(req, res) {
    // Garante que se vier um objeto único, ele vira um array de 1 item. Se vier array, usa ele.
    const itens = Array.isArray(req.body) ? req.body : [req.body];

    if (itens.length === 0) {
        return res.status(400).json({ erro: 'Nenhum item foi enviado no corpo da requisição.' });
    }

    // Usamos 'OR IGNORE' para evitar quebra caso alguma espécie da lista já esteja cadastrada
    const query = `INSERT OR IGNORE INTO catalogo_especies (natureza, especie) VALUES (?, ?)`;

    let inseridos = 0;

    // Usamos transação do SQLite para garantir performance e integridade
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

// Lista todas as espécies e naturezas permitidas
function listarCatalogo(req, res) {
    db.all(`SELECT * FROM catalogo_especies`, [], (err, linhas) => {
        if (err) {
            return res.status(500).json({ erro: 'Erro ao buscar catálogo.' });
        }
        res.json(linhas);
    });
}

// Salva o template validando se a espécie pertence ao catálogo oficial
function salvarTemplate(req, res) {
    const { especie } = req.body;
    const arquivoBlob = req.file ? req.file.buffer : null;

    if (!especie || !arquivoBlob) {
        return res.status(400).json({ erro: 'A espécie e o arquivo .docx são obrigatórios.' });
    }

    // 1. Verifica se a espécie existe no catálogo
    db.get(`SELECT * FROM catalogo_especies WHERE especie = ?`, [especie], (err, especieValida) => {
        if (err || !especieValida) {
            return res.status(403).json({ 
                erro: `A espécie "${especie}" não está cadastrada no catálogo oficial. Cadastre-a primeiro antes de enviar o template.` 
            });
        }

        // 2. Se existe, salva ou atualiza o arquivo .docx
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

// Gera o laudo buscando dinamicamente
function gerarLaudo(req, res) {
    const { especie, dadosForm, perito } = req.body;
    const arquivoPCNetBlob = req.file ? req.file.buffer : null;

    if (!especie || !arquivoPCNetBlob) {
        return res.status(400).json({ erro: 'A espécie e o arquivo original do PCNet são obrigatórios.' });
    }

    const query = `SELECT arquivo FROM templates_laudo WHERE especie = ?`;
    
    db.get(query, [especie], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ erro: `Template não encontrado para a espécie "${especie}".` });
        }

        try {
            // Leitura flexível dos dados (funciona via JSON ou campos soltos no form-data)
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

            // Prepara as variáveis específicas da espécie
            const variaveisTemplate = prepararVariaveis(especie, dadosSeguros, perito);

            // 1. Preenche o template do banco com os dados
            const zipTemplate = new PizZip(row.arquivo);
            const docTemplate = new Docxtemplater(zipTemplate, { paragraphLoop: true, linebreaks: true });
            docTemplate.render(variaveisTemplate);
            const xmlTemplatePreenchido = docTemplate.getZip().file('word/document.xml').asText();

            // 2. Prepara o arquivo original do PCNet
            const zipPCNet = new PizZip(arquivoPCNetBlob);
            const xmlPCNetOriginal = zipPCNet.file('word/document.xml').asText();

            // 3. Executa a cirurgia XML (corte a partir de "HISTÓRICO")[cite: 1]
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

            const xmlFinalUnificado = new XMLSerializer().serializeToString(docPCNet);

            // 4. Salva no arquivo final do PCNet e devolve para download
            zipPCNet.file('word/document.xml', xmlFinalUnificado);

            const buf = zipPCNet.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
            
            const nomeOriginal = req.file.originalname || `laudo_${especie}.docx`;

            res.setHeader('Content-Disposition', `attachment; filename=${nomeOriginal}`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.send(buf);

        } catch (error) {
            console.error("Erro na cirurgia:", error);
            res.status(500).json({ erro: 'Erro na cirurgia do documento Word: ' + error.message });
        }
    });
}

module.exports = { cadastrarEspecieCatalogo, listarCatalogo, salvarTemplate, gerarLaudo };