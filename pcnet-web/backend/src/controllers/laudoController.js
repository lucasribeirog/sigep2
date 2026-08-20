const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const ImageModule = require('docxtemplater-image-module-free');
const path = require('path');
const fs = require('fs');
const sizeOf = require('image-size');
const sharp = require('sharp');

const { prepararVariaveis, analisarImagemPericial } = require('../services/laudoProcessor');
const { extrairFavDoDocx, extrairNumeroLaudoDoDocx, extrairNumeroLaudoCompletoDoDocx, mesclarDocxBaseComTemplate } = require('../services/docxMergeService');
const {executarNaFilaPdf,} = require('../services/pdfQueueService');
const {converterDocxParaPdf,} = require('../services/libreOfficeService');
const db = require('../config/database');
const { get, all } = db.promises;

function parseJson(v, fallback = null) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

async function listarCatalogo(_req, res) {
  try {
    await db.ready;
    const rows = await all(`
      SELECT c.id,c.natureza,c.especie,c.nome_exibicao,c.formulario,c.descricao,c.ordem,
             CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS tem_template,
             t.versao AS template_versao,t.status_template,t.manifesto_json,t.avisos_json
      FROM catalogo_especies c
      LEFT JOIN templates_especies t ON t.especie_id=c.id
      WHERE c.ativo=1
      ORDER BY c.ordem,c.natureza COLLATE NOCASE,c.nome_exibicao COLLATE NOCASE`);
    return res.json(rows.map((r) => ({
      ...r,
      tem_template: Boolean(r.tem_template),
      template_manifesto: parseJson(r.manifesto_json, null),
      template_avisos: parseJson(r.avisos_json, []),
    })));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro ao buscar catálogo.' });
  }
}

function parseDados(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { throw new Error('Os dados do formulário estão em formato inválido.'); }
}
function disposition(nome) { return `attachment; filename*=UTF-8''${encodeURIComponent(nome)}`; }
function imageModule() {
  return new ImageModule({
    centered: true,
    getImage(tag) { return tag && fs.existsSync(tag) ? fs.readFileSync(tag) : Buffer.from(''); },
    getSize(img) {
      try {
        const d = typeof sizeOf === 'function' ? sizeOf(img) : (sizeOf.imageSize ? sizeOf.imageSize(img) : null);
        if (!d?.width || !d?.height) return [500, 378];
        return [Math.round(d.width * 378 / d.height), 378];
      } catch { return [500, 378]; }
    },
  });
}
function renderizar(template, vars) {
  const zip = new PizZip(template);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
    modules: [imageModule()],
  });
  doc.render(vars);
  return doc.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
async function resolverEspecie(body) {
  const id = Number(body?.especieId || body?.especie_id || 0);
  if (id) return get('SELECT * FROM catalogo_especies WHERE id=? AND ativo=1', [id]);
  const nome = String(body?.especie || '').trim();
  if (nome) return get('SELECT * FROM catalogo_especies WHERE especie=? AND ativo=1', [nome]);
  return null;
}

async function prepararDocumento(req) {
  await db.ready;
  const esp = await resolverEspecie(req.body);
  if (!esp) {
    const e = new Error('Selecione uma espécie pericial válida e ativa.'); e.statusCode = 400; throw e;
  }
  const tpl = await get(`SELECT arquivo,versao,nome_arquivo,status_template,manifesto_json,avisos_json
    FROM templates_especies WHERE especie_id=?`, [esp.id]);
  if (!tpl?.arquivo) {
    const e = new Error(`A espécie "${esp.nome_exibicao}" ainda não possui template ativo. Solicite ao administrador.`); e.statusCode = 409; throw e;
  }
  if (tpl.status_template === 'invalido') {
    const e = new Error('O template ativo foi marcado como inválido. O administrador precisa corrigi-lo ou restaurar outra versão.'); e.statusCode = 409; throw e;
  }
  const manifesto = parseJson(tpl.manifesto_json, null);
  if (manifesto?.imagensCustomizadas?.length) {
    const e = new Error(`O template possui imagem dinâmica personalizada ainda não configurada: ${manifesto.imagensCustomizadas.join(', ')}.`); e.statusCode = 409; throw e;
  }

  const base = req.files?.arquivo_pcnet?.[0];
  if (!base?.buffer) {
    const e = new Error('Selecione o documento-base .docx exportado pelo PCNet.'); e.statusCode = 400; throw e;
  }

  const dados = parseDados(req.body?.dadosForm);
  const foto = req.files?.foto_objeto?.[0]?.buffer || null;
  const favDetectada = extrairFavDoDocx(base.buffer);
  let fotoPath = null;
  try {
    if (foto) {
      const dir = path.resolve(__dirname, '../../temp');
      fs.mkdirSync(dir, { recursive: true });
      fotoPath = path.join(dir, `vestigio_${Date.now()}_${Math.random().toString(16).slice(2)}.jpg`);
      await sharp(foto).rotate().jpeg({ quality: 95 }).toFile(fotoPath);
    }
    const vars = prepararVariaveis(esp.formulario, dados, req.usuario || {}, { favDetectada, templateManifesto: manifesto });
    vars.tem_imagem = Boolean(fotoPath);
    vars.imagem_vestigio = fotoPath || '';
    vars.especie_nome = esp.nome_exibicao;
    vars.especie_oficial = esp.especie;
    vars.natureza = esp.natureza;

    const templatePreenchido = renderizar(tpl.arquivo, vars);
    const unificado = mesclarDocxBaseComTemplate(base.buffer, templatePreenchido);
    if (
      unificado.estrategiaMesclagem !==
      'APOS_DATA_HORA_EXAME'
    ) {
      console.warn(
        '[DOCX Merge] Estratégia alternativa utilizada:',
        unificado.estrategiaMesclagem
      );
    }
    const original = path.basename(base.originalname || `Laudo_${esp.id}.docx`);
    return {
      buffer: unificado.buffer,
      especie: esp.nome_exibicao,
      fotoPath,
      favDetectada,
      nomeOriginal: original.toLowerCase().endsWith('.docx') ? original : `${original}.docx`,
      templateStatus: tpl.status_template,
    };
  } catch (e) {
    if (fotoPath && fs.existsSync(fotoPath)) fs.unlinkSync(fotoPath);
    throw e;
  }
}

function headersDiagnostico(res, d) {
  res.setHeader(
    'Access-Control-Expose-Headers',
    'x-fav-detectada,x-nexus-template-status'
  );

  if (d.favDetectada) {
    res.setHeader(
      'x-fav-detectada',
      String(d.favDetectada)
    );
  }

  if (d.templateStatus) {
    res.setHeader(
      'x-nexus-template-status',
      d.templateStatus
    );
  }
}

async function inspecionarDocxPcnet(req, res) {
  try {
    const arquivo = req.file;
    if (!arquivo?.buffer) return res.status(400).json({ erro: 'Selecione o documento-base .docx exportado pelo PCNet.' });
    const numeroLaudoCompleto = extrairNumeroLaudoCompletoDoDocx(arquivo.buffer);
    const numeroLaudoPcnet = extrairNumeroLaudoDoDocx(arquivo.buffer);
    return res.json({
      fav: extrairFavDoDocx(arquivo.buffer),
      // Compatibilidade: numeroLaudo continua sendo o valor que deve ser digitado
      // na tela de pesquisa do PCNet.
      numeroLaudo: numeroLaudoPcnet,
      numeroLaudoPcnet,
      numeroLaudoCompleto,
    });
  } catch (e) {
    console.error('Erro ao inspecionar DOCX PCNet:', e);
    return res.status(400).json({ erro: e.message || 'Não foi possível inspecionar o DOCX-base.' });
  }
}

async function gerarLaudo(req, res) {
  let fotoPath = null;
  try {
    const d = await prepararDocumento(req); fotoPath = d.fotoPath; headersDiagnostico(res, d);
    res.setHeader('Content-Disposition', disposition(d.nomeOriginal));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    return res.send(d.buffer);
  } catch (e) {
    console.error('Erro DOCX:', e);
    return res.status(e.statusCode || 500).json({ erro: e.message || 'Erro ao gerar laudo.' });
  } finally {
    if (fotoPath && fs.existsSync(fotoPath)) { try { fs.unlinkSync(fotoPath); } catch { /* noop */ } }
  }
}

async function gerarLaudoPdf(req, res) {
  let fotoPath = null, docxPath = null, pdfPath = null;
  try {
    const d = await prepararDocumento(req);
    fotoPath = d.fotoPath;

    const dir = path.resolve(
      __dirname,
      '../../temp'
    );

    fs.mkdirSync(
      dir,
      {
        recursive: true,
      }
    );

    const id =
      `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    docxPath =
      path.join(
        dir,
        `laudo_${id}.docx`
      );

    fs.writeFileSync(
      docxPath,
      d.buffer
    );


    /*
    * Somente a conversão pelo LibreOffice entra na fila.
    *
    * A preparação do DOCX já aconteceu normalmente acima.
    *
    * Se outro usuário estiver convertendo um PDF neste momento,
    * esta Promise simplesmente aguarda sua vez.
    */
    pdfPath =
      await executarNaFilaPdf(
        () =>
          converterDocxParaPdf(
            docxPath,
            dir
          ),
        `laudo_${id}.docx`
      );


    if (!fs.existsSync(pdfPath)) {
      throw new Error(
        'O LibreOffice não gerou o PDF esperado.'
      );
    }
    headersDiagnostico(res, d);
    res.setHeader('Content-Disposition', disposition(d.nomeOriginal.replace(/\.docx$/i, '.pdf')));
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(fs.readFileSync(pdfPath));
  } catch (e) {
    console.error('Erro PDF:', e);
    return res.status(e.statusCode || 500).json({ erro: e.message || 'Erro ao gerar PDF.' });
  } finally {
    for (const f of [fotoPath, docxPath, pdfPath]) if (f && fs.existsSync(f)) { try { fs.unlinkSync(f); } catch { /* noop */ } }
  }
}

async function analisarFotoObjeto(req, res) {
  let temp = null;
  try {
    await db.ready;
    const buf = req.file?.buffer;
    if (!buf) return res.status(400).json({ erro: 'Nenhuma imagem foi enviada.' });
    const esp = await resolverEspecie(req.body);
    if (!esp) return res.status(400).json({ erro: 'Espécie inválida ou inativa.' });
    const dir = path.resolve(__dirname, '../../temp'); fs.mkdirSync(dir, { recursive: true });
    temp = path.join(dir, `foto_analise_${Date.now()}.jpg`);
    await sharp(buf).rotate().jpeg({ quality: 95 }).toFile(temp);
    const dados = await analisarImagemPericial(temp, esp.formulario);
    return res.json({ mensagem: 'Imagem analisada com sucesso via IA e Visão Computacional!', dadosForm: dados, imagemProcessadaBase64: `data:${req.file.mimetype};base64,${buf.toString('base64')}` });
  } catch (e) {
    console.error('Erro ao analisar foto:', e);
    return res.status(500).json({ erro: 'Falha ao processar a imagem pericial: ' + e.message });
  } finally {
    if (temp && fs.existsSync(temp)) { try { fs.unlinkSync(temp); } catch { /* noop */ } }
  }
}

module.exports = { listarCatalogo, inspecionarDocxPcnet, gerarLaudo, gerarLaudoPdf, analisarFotoObjeto };
