const path = require('path').posix;
const PizZip = require('pizzip');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

function textoNormalizado(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function validarEstruturaDocx(buffer) {
  try {
    const zip = new PizZip(buffer);
    return Boolean(zip.file('word/document.xml'));
  } catch {
    return false;
  }
}

function extrairTextoDocx(buffer) {
  const zip = new PizZip(buffer);
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('O arquivo DOCX não possui word/document.xml.');
  const doc = new DOMParser().parseFromString(f.asText(), 'text/xml');
  const nodes = doc.getElementsByTagName('w:t');
  const partes = [];
  for (let i = 0; i < nodes.length; i += 1) partes.push(nodes[i].textContent || '');
  return partes.join(' ').replace(/\s+/g, ' ').trim();
}

function extrairFavDoDocx(buffer) {
  try {
    const t = extrairTextoDocx(buffer);
    const padroes = [
      /(?:N[º°o]\s*da\s*FAV|N[º°o]\s*FAV|FAV|Ficha\s+de\s+Acompanhamento\s+de\s+Vest[ií]gio)[:\s.\-–]*([0-9]+(?:\/[0-9]+)?)/i,
      /\b([0-9]{4,7}\/20[0-9]{2})\b/,
    ];
    for (const p of padroes) {
      const m = t.match(p);
      if (m) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function extrairNumeroLaudoCompletoDoDocx(buffer) {
  try {
    const t = extrairTextoDocx(buffer);
    const padroes = [
      // Identificador completo exibido no DOCX exportado pelo PCNet, por exemplo:
      // "Nº Laudo: 2026-487-002977-024-019179615-52".
      /(?:N[º°o.]?\s*(?:do\s*)?Laudo|Laudo\s+Pericial\s*(?:N[º°o.]?)?)[:\s.\-–]*((?:19|20)[0-9]{2}(?:-[0-9]+){2,})/i,

      // Cabeçalho técnico/barcode exportado pelo PCNet:
      // "13752!2026-487-002977-024-019179615-52!".
      /\b[0-9]{3,8}!\s*((?:19|20)[0-9]{2}(?:-[0-9]+){2,})!/,

      // Formatos legados/locais (ex.: "Nº Laudo: 15287" ou "15287/2026").
      /(?:N[º°o.]?\s*(?:do\s*)?Laudo|Laudo\s+(?:Pericial\s*)?(?:N[º°o.]?)?)[:\s.\-–]*([0-9]{3,8}(?:\/20[0-9]{2})?)(?!-)/i,
      /\bLaudo\s+(?:Pericial\s*)?[-–:]?\s*([0-9]{3,8}(?:\/20[0-9]{2})?)(?!-)\b/i,
    ];
    for (const p of padroes) {
      const m = t.match(p);
      if (m?.[1]) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

function numeroLaudoPcnetAPartirDoCompleto(numeroCompleto) {
  const valor = String(numeroCompleto || '').trim();
  if (!valor) return null;

  // No identificador moderno do laudo, o número usado pela tela de pesquisa do
  // PCNet é o penúltimo bloco. Exemplo:
  // 2026-487-002977-024-019179615-52 -> 019179615.
  const blocos = valor.split('-').map((v) => v.trim()).filter(Boolean);
  if (blocos.length >= 3) {
    const interno = blocos[blocos.length - 2];
    if (/^[0-9]{6,12}$/.test(interno)) return interno;
  }

  // Formatos legados em que o número local já aparece sozinho ou como N/AAAA.
  if (/^[0-9]{3,12}$/.test(valor)) return valor;
  const legado = valor.match(/^([0-9]{3,12})\/(?:19|20)[0-9]{2}$/);
  if (legado) return legado[1];

  return valor;
}

function extrairNumeroLaudoDoDocx(buffer) {
  return numeroLaudoPcnetAPartirDoCompleto(extrairNumeroLaudoCompletoDoDocx(buffer));
}

function garantirRelationships(zipBase) {
  const relPath = 'word/_rels/document.xml.rels';
  const existente = zipBase.file(relPath);
  const xml = existente
    ? existente.asText()
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  return { relPath, doc: new DOMParser().parseFromString(xml, 'text/xml') };
}

function proximoRid(docRels) {
  let max = 0;
  const rels = docRels.getElementsByTagName('Relationship');
  for (let i = 0; i < rels.length; i += 1) {
    const m = String(rels[i].getAttribute('Id') || '').match(/^rId(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return () => `rId${++max}`;
}

function idsRelacionamentoUsados(xml) {
  const ids = new Set();
  const re = /\br:(?:id|embed|link)="([^"]+)"/g;
  let m;
  while ((m = re.exec(xml))) ids.add(m[1]);
  return ids;
}

function nomeParteUnico(zipBase, target, salt) {
  const limpo = path.normalize(target).replace(/^\.\.\//, '');
  const origem = path.normalize(path.join('word', limpo));
  if (!zipBase.file(origem)) return { packagePath: origem, target: limpo };

  const dir = path.dirname(limpo);
  const ext = path.extname(limpo);
  const base = path.basename(limpo, ext);
  let i = 1;
  while (true) {
    const novoTarget = path.join(dir, `${base}_nexus_${salt}_${i}${ext}`);
    const novoPath = path.join('word', novoTarget);
    if (!zipBase.file(novoPath)) return { packagePath: novoPath, target: novoTarget };
    i += 1;
  }
}

function copiarRelacionamentosUsados(zipBase, zipTemplate, xmlTemplate) {
  const tf = zipTemplate.file('word/_rels/document.xml.rels');
  if (!tf) return { xmlTemplate };

  const usados = idsRelacionamentoUsados(xmlTemplate);
  if (!usados.size) return { xmlTemplate };

  const tdoc = new DOMParser().parseFromString(tf.asText(), 'text/xml');
  const { relPath, doc: bdoc } = garantirRelationships(zipBase);
  const root = bdoc.getElementsByTagName('Relationships')[0];
  const nextRid = proximoRid(bdoc);
  const mapping = {};
  const salt = Date.now().toString(36);
  const rels = tdoc.getElementsByTagName('Relationship');

  for (let i = 0; i < rels.length; i += 1) {
    const rel = rels[i];
    const oldId = rel.getAttribute('Id');
    if (!oldId || !usados.has(oldId)) continue;

    const newId = nextRid();
    mapping[oldId] = newId;
    const cloned = bdoc.importNode(rel, true);
    cloned.setAttribute('Id', newId);

    const targetMode = String(cloned.getAttribute('TargetMode') || '').toLowerCase();
    const target = cloned.getAttribute('Target');
    if (target && targetMode !== 'external') {
      const sourcePath = path.normalize(path.join('word', target));
      const sourceFile = zipTemplate.file(sourcePath);
      if (sourceFile && !sourceFile.dir) {
        const destino = nomeParteUnico(zipBase, target, salt);
        zipBase.file(destino.packagePath, sourceFile.asNodeBuffer());
        cloned.setAttribute('Target', destino.target);
      }
    }
    root.appendChild(cloned);
  }

  for (const [oldId, newId] of Object.entries(mapping)) {
    const escaped = oldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const attr of ['id', 'embed', 'link']) {
      xmlTemplate = xmlTemplate.replace(new RegExp(`r:${attr}="${escaped}"`, 'g'), `r:${attr}="${newId}"`);
    }
  }

  zipBase.file(relPath, new XMLSerializer().serializeToString(bdoc));
  return { xmlTemplate };
}

/**
 * Importa estilos que existem apenas no template. Isso evita que títulos e
 * estilos personalizados caiam para o Normal do DOCX-base depois da junção.
 * Em colisões de styleId, o estilo do documento-base prevalece de propósito:
 * trocar/renomear estilos já existentes pode alterar o cabeçalho do PCNet.
 */
function mesclarEstilosAusentes(zipBase, zipTemplate) {
  const bf = zipBase.file('word/styles.xml');
  const tf = zipTemplate.file('word/styles.xml');
  if (!bf || !tf) return;

  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const base = parser.parseFromString(bf.asText(), 'text/xml');
  const tpl = parser.parseFromString(tf.asText(), 'text/xml');
  const root = base.getElementsByTagName('w:styles')[0] || base.documentElement;
  if (!root) return;

  const ids = new Set();
  const baseStyles = base.getElementsByTagName('w:style');
  for (let i = 0; i < baseStyles.length; i += 1) {
    const id = baseStyles[i].getAttribute('w:styleId');
    if (id) ids.add(id);
  }

  const tplStyles = tpl.getElementsByTagName('w:style');
  for (let i = 0; i < tplStyles.length; i += 1) {
    const id = tplStyles[i].getAttribute('w:styleId');
    if (!id || ids.has(id)) continue;
    root.appendChild(base.importNode(tplStyles[i], true));
    ids.add(id);
  }

  zipBase.file('word/styles.xml', serializer.serializeToString(base));
}

function mesclarTiposConteudo(zipBase, zipTemplate) {
  const bf = zipBase.file('[Content_Types].xml');
  const tf = zipTemplate.file('[Content_Types].xml');
  if (!bf || !tf) return;

  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const base = parser.parseFromString(bf.asText(), 'text/xml');
  const tpl = parser.parseFromString(tf.asText(), 'text/xml');
  const root = base.getElementsByTagName('Types')[0];
  const defs = new Set();
  const overs = new Set();

  const bd = base.getElementsByTagName('Default');
  const bo = base.getElementsByTagName('Override');
  for (let i = 0; i < bd.length; i += 1) defs.add(String(bd[i].getAttribute('Extension') || '').toLowerCase());
  for (let i = 0; i < bo.length; i += 1) overs.add(String(bo[i].getAttribute('PartName') || ''));

  const td = tpl.getElementsByTagName('Default');
  const to = tpl.getElementsByTagName('Override');
  for (let i = 0; i < td.length; i += 1) {
    const ext = String(td[i].getAttribute('Extension') || '').toLowerCase();
    if (ext && !defs.has(ext)) {
      root.appendChild(base.importNode(td[i], true));
      defs.add(ext);
    }
  }
  for (let i = 0; i < to.length; i += 1) {
    const part = String(to[i].getAttribute('PartName') || '');
    if (part && !overs.has(part) && !zipBase.file(part.replace(/^\//, ''))) {
      root.appendChild(base.importNode(to[i], true));
      overs.add(part);
    }
  }

  zipBase.file('[Content_Types].xml', serializer.serializeToString(base));
}

function mesclarDocxBaseComTemplate(baseBuffer, templatePreenchidoBuffer) {
  const zipBase = new PizZip(baseBuffer);
  const zipTemplate = new PizZip(templatePreenchidoBuffer);
  const baseFile = zipBase.file('word/document.xml');
  const tplFile = zipTemplate.file('word/document.xml');
  if (!baseFile) throw new Error('O documento-base não possui a estrutura padrão word/document.xml.');
  if (!tplFile) throw new Error('O template preenchido não possui a estrutura padrão word/document.xml.');

  let xmlTemplate = tplFile.asText();
  xmlTemplate = copiarRelacionamentosUsados(zipBase, zipTemplate, xmlTemplate).xmlTemplate;
  mesclarEstilosAusentes(zipBase, zipTemplate);
  mesclarTiposConteudo(zipBase, zipTemplate);

  const parser = new DOMParser();
  const serializer = new XMLSerializer();
  const docBase = parser.parseFromString(baseFile.asText(), 'text/xml');
  const docTpl = parser.parseFromString(xmlTemplate, 'text/xml');
  const bodyBase = docBase.getElementsByTagName('w:body')[0];
  const bodyTpl = docTpl.getElementsByTagName('w:body')[0];
  if (!bodyBase || !bodyTpl) throw new Error('Não foi possível localizar o corpo dos documentos Word.');

  let corte = -1;
  for (let i = 0; i < bodyBase.childNodes.length; i += 1) {
    const node = bodyBase.childNodes[i];
    if (textoNormalizado(node.textContent).includes('HISTORICO')) {
      corte = i;
      break;
    }
  }

  if (corte >= 0) {
    const remover = [];
    for (let i = corte; i < bodyBase.childNodes.length; i += 1) {
      const node = bodyBase.childNodes[i];
      if (node.nodeName !== 'w:sectPr') remover.push(node);
    }
    remover.forEach((n) => bodyBase.removeChild(n));
  }

  const inserir = [];
  for (let i = 0; i < bodyTpl.childNodes.length; i += 1) {
    const node = bodyTpl.childNodes[i];
    if (node.nodeName !== 'w:sectPr') inserir.push(node);
  }

  const sectPr = bodyBase.getElementsByTagName('w:sectPr')[0] || null;
  for (const node of inserir) {
    const imported = docBase.importNode(node, true);
    if (sectPr) bodyBase.insertBefore(imported, sectPr);
    else bodyBase.appendChild(imported);
  }

  zipBase.file('word/document.xml', serializer.serializeToString(docBase));
  return {
    buffer: zipBase.generate({ type: 'nodebuffer', compression: 'DEFLATE' }),
    historicoDetectado: corte >= 0,
  };
}

module.exports = {
  validarEstruturaDocx,
  extrairTextoDocx,
  extrairFavDoDocx,
  extrairNumeroLaudoCompletoDoDocx,
  numeroLaudoPcnetAPartirDoCompleto,
  extrairNumeroLaudoDoDocx,
  mesclarDocxBaseComTemplate,
};
