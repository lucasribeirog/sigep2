const crypto = require('crypto');
const PizZip = require('pizzip');
const { DOMParser } = require('@xmldom/xmldom');
const { DEFINICOES, VARIAVEIS_SISTEMA, conjuntoConhecido } = require('./formDefinitions');

function textoDeXml(xml) {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const nodes = doc.getElementsByTagName('w:t');
  const partes = [];
  for (let i = 0; i < nodes.length; i += 1) partes.push(nodes[i].textContent || '');
  return partes.join('');
}

function partesTextuais(zip) {
  return Object.keys(zip.files)
    .filter((n) => /^word\/(document|header\d+|footer\d+|footnotes|endnotes)\.xml$/i.test(n))
    .sort();
}

function parseTag(raw) {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return null;
  const prefix = inner[0];
  if (prefix === '#') return { tipo: 'secao', modo: 'normal', nome: inner.slice(1).trim(), raw };
  if (prefix === '^') return { tipo: 'secao', modo: 'invertida', nome: inner.slice(1).trim(), raw };
  if (prefix === '/') return { tipo: 'fechamento', nome: inner.slice(1).trim(), raw };
  if (prefix === '%') return { tipo: 'imagem', nome: inner.slice(1).trim(), raw };
  return { tipo: 'simples', nome: inner, raw };
}

function extrairManifesto(buffer) {
  const zip = new PizZip(buffer);
  if (!zip.file('word/document.xml')) throw new Error('O DOCX não contém word/document.xml.');

  const tags = [];
  const errosEstrutura = [];
  const partes = partesTextuais(zip);

  for (const parte of partes) {
    const texto = textoDeXml(zip.file(parte).asText());
    const encontrados = texto.match(/\{[^{}]+\}/g) || [];
    const stack = [];
    for (const raw of encontrados) {
      const tag = parseTag(raw);
      if (!tag || !tag.nome) continue;
      tags.push({ ...tag, parte });
      if (tag.tipo === 'secao') stack.push(tag.nome);
      if (tag.tipo === 'fechamento') {
        const topo = stack.pop();
        if (topo !== tag.nome) {
          errosEstrutura.push(`Na parte ${parte}, fechamento {/${tag.nome}} não corresponde à seção aberta ${topo ? `{#${topo}}` : '(nenhuma)'}.`);
        }
      }
    }
    while (stack.length) errosEstrutura.push(`Na parte ${parte}, a seção {#${stack.pop()}} não foi fechada.`);
  }

  const uniq = (xs) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const simples = uniq(tags.filter((t) => t.tipo === 'simples').map((t) => t.nome));
  const secoes = uniq(tags.filter((t) => t.tipo === 'secao').map((t) => t.nome));
  const imagens = uniq(tags.filter((t) => t.tipo === 'imagem').map((t) => t.nome));
  const tagsForaDoCorpo = uniq(tags
    .filter((t) => t.parte !== 'word/document.xml' && t.tipo !== 'fechamento')
    .map((t) => `${t.nome} @ ${t.parte}`));

  const documentXml = zip.file('word/document.xml').asText();
  const recursos = {
    usaNumeracao: /<w:numPr\b/i.test(documentXml),
    usaDesenhos: /<(?:w:drawing|w:pict)\b/i.test(documentXml),
    temNotasRodape: Boolean(zip.file('word/footnotes.xml')),
    temNotasFim: Boolean(zip.file('word/endnotes.xml')),
    temComentarios: Boolean(zip.file('word/comments.xml')),
    temGraficos: Object.keys(zip.files).some((n) => /^word\/charts\//i.test(n)),
    temEstilos: Boolean(zip.file('word/styles.xml')),
  };

  return {
    simples,
    secoes,
    imagens,
    totalTags: tags.filter((t) => t.tipo !== 'fechamento').length,
    partes,
    errosEstrutura,
    tagsForaDoCorpo,
    recursos,
  };
}

function pontuarFormulario(manifesto, formulario) {
  const def = DEFINICOES[formulario];
  if (!def) return 0;
  const usados = new Set([...manifesto.simples, ...manifesto.secoes, ...manifesto.imagens].filter((x) => !VARIAVEIS_SISTEMA.includes(x)));
  if (!usados.size) return 0;
  const conhecidos = new Set([...def.simples, ...def.secoes, ...def.imagens]);
  let hit = 0;
  for (const x of usados) if (conhecidos.has(x)) hit += 1;
  return hit / usados.size;
}

function analisarTemplate(buffer, formularioSelecionado) {
  const manifesto = extrairManifesto(buffer);
  const conhecidos = conjuntoConhecido(formularioSelecionado);
  const camposCustomizados = manifesto.simples.filter((x) => !conhecidos.has(x));
  const condicoesCustomizadas = manifesto.secoes.filter((x) => !conhecidos.has(x));
  const imagensCustomizadas = manifesto.imagens.filter((x) => !conhecidos.has(x));

  const scores = Object.fromEntries(Object.keys(DEFINICOES).map((f) => [f, pontuarFormulario(manifesto, f)]));
  const sugerido = Object.entries(scores).sort((a, b) => b[1] - a[1])[0] || [formularioSelecionado, 0];
  const avisos = [...manifesto.errosEstrutura];

  if (!manifesto.totalTags) avisos.push('Nenhuma variável Docxtemplater foi encontrada no template.');
  if (imagensCustomizadas.length) avisos.push(`Há imagem(ns) dinâmica(s) não configurada(s): ${imagensCustomizadas.join(', ')}.`);
  if (manifesto.recursos.usaNumeracao) avisos.push('O template usa listas/numeração do Word. A geração é aceita, mas confira visualmente a numeração após a junção com o DOCX-base.');
  if (manifesto.recursos.temGraficos) avisos.push('O template contém gráficos do Word. Esse recurso não é garantido na junção com o DOCX-base.');
  if (manifesto.recursos.temComentarios) avisos.push('O template contém comentários do Word. Comentários não fazem parte do conteúdo pericial gerado e podem não ser preservados na junção.');
  if (manifesto.tagsForaDoCorpo.length) avisos.push(`Há placeholder(s) fora do corpo principal (${manifesto.tagsForaDoCorpo.join(', ')}). O Nexus mantém cabeçalhos/rodapés do DOCX-base do PCNet, portanto esses placeholders não aparecem no documento final mesclado.`);

  const scoreSelecionado = scores[formularioSelecionado] || 0;
  if (sugerido[0] !== formularioSelecionado && sugerido[1] >= 0.55 && sugerido[1] > scoreSelecionado + 0.15) {
    avisos.push(`O conteúdo do template se parece mais com o formulário “${sugerido[0]}” do que com “${formularioSelecionado}”.`);
  }

  let status = 'compativel';
  if (manifesto.errosEstrutura.length) status = 'invalido';
  else if (imagensCustomizadas.length || avisos.length) status = 'atencao';

  return {
    ...manifesto,
    camposCustomizados,
    condicoesCustomizadas,
    imagensCustomizadas,
    scores,
    formularioSugerido: sugerido[0],
    scoreFormularioSelecionado: scoreSelecionado,
    status,
    avisos,
    hashSha256: crypto.createHash('sha256').update(buffer).digest('hex'),
  };
}

module.exports = { extrairManifesto, analisarTemplate };
