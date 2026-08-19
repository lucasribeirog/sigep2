const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const processarEficienciaObjeto = require('../src/services/especies/eficienciaObjeto');
const { processarBalistica } = require('../src/services/especies/balistica');
const { processarDrogas } = require('../src/services/especies/drogas');
const { prepararVariaveis } = require('../src/services/laudoProcessor');

const read = r => fs.readFileSync(path.join(__dirname, r), 'utf8');
const tplPath = nome => path.join(__dirname, '..', 'templates_padrao', nome);

test('patrimônio: madeira usa as três dimensões previstas no template', () => {
  const r = processarEficienciaObjeto({
    tipo_objeto: 'madeira', resultado_eficiencia: 'eficiente', n_fav: '123', unidade_custodia: 'STRC Pedra Azul',
    secao_madeira: 'retangular', comp_madeira: '40', larg_madeira: '30', comp_total: '500', massa: '350',
  });
  assert.equal(r.is_madeira, true);
  assert.equal(r.comp_madeira, '40');
  assert.equal(r.larg_madeira, '30');
  assert.equal(r.comp_total, '500');
  assert.equal(r.tem_lacre, false);
});

test('balística: lacre é opcional e bloco de revólver é coerente', () => {
  const r = processarBalistica({
    tipo_material: 'revolver', resultado_exame: 'eficiente', destino: 'custodia', calibre: '.38 SPL', acabamento: 'oxidado',
    comprimento_cano: '100', comprimento_total: '220', capacidade: '6', empunhadura_revolver: 'placas em madeira',
  });
  assert.equal(r.is_revolver, true);
  assert.equal(r.tem_lacre, false);
  assert.equal(r.n_lacre, '');
  assert.match(r.capacidade_texto, /6 tiros/);
});

test('balística: resultado não calçou só é aceito para pistola', () => {
  assert.throws(() => processarBalistica({
    tipo_material: 'revolver', resultado_exame: 'nao_calcou', calibre: '.38', acabamento: 'oxidado', comprimento_cano: '100', comprimento_total: '200', capacidade: '6', empunhadura_revolver: 'madeira',
  }), /só é compatível/);
});

test('drogas: maconha pode omitir cor, mas exige FAV e lacre de encaminhamento', () => {
  const r = processarDrogas({
    droga: 'maconha', qtd_involucros: '1', massa_liquida: '10', extenso_massa: 'dez gramas', numero_fav: '123/2026',
    resultado: 'positivo', tipo_encaminhamento: 'unificado', envelope_encaminhamento: '999', cor_material: '',
  });
  assert.equal(r.is_maconha, true);
  assert.equal(r.tem_cor_material, false);
  assert.equal(r.envelope_encaminhamento, '999');
});

test('drogas: cocaína exige cor/aspecto', () => {
  assert.throws(() => processarDrogas({
    droga: 'cocaina', qtd_involucros: '1', massa_liquida: '10', extenso_massa: 'dez gramas', numero_fav: '123', resultado: 'positivo', tipo_encaminhamento: 'unificado', envelope_encaminhamento: '9', cor_material: '',
  }), /cor\/aspecto/);
});

test('dados adicionais do template são preservados sem alteração de backend', () => {
  const vars = prepararVariaveis('balistica', {
    tipo_material: 'revolver', resultado_exame: 'eficiente', calibre: '.38', acabamento: 'oxidado', comprimento_cano: '100', comprimento_total: '200', capacidade: '6', empunhadura_revolver: 'madeira',
    campo_novo_do_template: 'valor livre', condicao_nova: true,
  }, { nome: 'Perito' });
  assert.equal(vars.campo_novo_do_template, 'valor livre');
  assert.equal(vars.condicao_nova, true);
});

test('V15 inclui os três templates-padrão ajustados e o analisador automático', () => {
  for (const arquivo of ['balistica.docx','drogas.docx','eficiencia_objeto.docx']) {
    assert.ok(fs.existsSync(tplPath(arquivo)), `${arquivo} ausente`);
    assert.ok(fs.statSync(tplPath(arquivo)).size > 1000, `${arquivo} vazio`);
  }
  const analyzer = read('../src/services/templateAnalyzer.js');
  assert.match(analyzer, /camposCustomizados/);
  assert.match(analyzer, /condicoesCustomizadas/);
  assert.match(analyzer, /imagensCustomizadas/);
  assert.match(analyzer, /hashSha256/);
  assert.match(analyzer, /formularioSugerido/);
});

test('templates V15 registram as novas condicionais no catálogo de variáveis', () => {
  const defs = read('../src/services/formDefinitions.js');
  assert.match(defs, /tem_lacre/);
  assert.match(defs, /tem_cor_material/);
});

test('V15 mantém perfis administrador e usuário', () => {
  const db = read('../src/config/database.js');
  const auth = read('../src/controllers/authController.js');
  assert.match(db, /role TEXT NOT NULL DEFAULT 'usuario'/);
  assert.match(auth, /'admin'/);
  assert.match(auth, /'usuario'/);
});

test('catálogo de unidades é relacional, público e administrável', () => {
  const db = read('../src/config/database.js');
  const authRoutes = read('../src/routes/authRoutes.js');
  const adminRoutes = read('../src/routes/adminRoutes.js');
  const admin = read('../src/controllers/adminController.js');
  assert.match(db, /CREATE TABLE IF NOT EXISTS unidades/);
  assert.match(db, /unidade_id INTEGER/);
  assert.match(authRoutes, /router\.get\('\/unidades'/);
  assert.match(adminRoutes, /\/admin\/unidades\/importar/);
  assert.match(admin, /<option\\b/);
});

test('templates usam vínculo por ID, histórico e manifesto de análise', () => {
  const db = read('../src/config/database.js');
  const c = read('../src/controllers/adminController.js');
  assert.match(db, /CREATE TABLE IF NOT EXISTS templates_especies/);
  assert.match(db, /CREATE TABLE IF NOT EXISTS template_versoes/);
  assert.match(db, /manifesto_json/);
  assert.match(c, /analisarTemplate/);
  assert.match(c, /restaurarVersao/);
});

test('geração exige DOCX-base do PCNet e mescla a partir de HISTÓRICO', () => {
  const routes = read('../src/routes/laudoRoutes.js');
  const ctrl = read('../src/controllers/laudoController.js');
  const merge = read('../src/services/docxMergeService.js');
  assert.match(routes, /arquivo_pcnet/);
  assert.match(ctrl, /Selecione o documento-base \.docx exportado pelo PCNet/);
  assert.match(ctrl, /mesclarDocxBaseComTemplate/);
  assert.match(ctrl, /extrairFavDoDocx/);
  assert.match(merge, /HISTORICO/);
});


test('DOCX PCNet: separa identificador completo e número interno usado na pesquisa de laudo', () => {
  const PizZip = require('pizzip');
  const { extrairNumeroLaudoDoDocx, extrairNumeroLaudoCompletoDoDocx, numeroLaudoPcnetAPartirDoCompleto, extrairFavDoDocx } = require('../src/services/docxMergeService');
  const zip = new PizZip();
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body><w:p><w:r><w:t>Nº Laudo: 2026-487-002977-024-019179615-52 Nº da FAV: 2261533</w:t></w:r></w:p></w:body>
    </w:document>`);
  const buffer = zip.generate({ type: 'nodebuffer' });
  assert.equal(extrairNumeroLaudoCompletoDoDocx(buffer), '2026-487-002977-024-019179615-52');
  assert.equal(extrairNumeroLaudoDoDocx(buffer), '019179615');
  assert.equal(numeroLaudoPcnetAPartirDoCompleto('2026-487-002977-024-019179615-52'), '019179615');
  assert.equal(extrairFavDoDocx(buffer), '2261533');
});

test('frontend oferece campos adicionais detectados no template', () => {
  const g = read('../../frontend/src/components/GeradorLaudo.jsx');
  const extras = read('../../frontend/src/components/forms/TemplateCamposExtras.jsx');
  const admin = read('../../frontend/src/components/AdminPanel.jsx');
  assert.match(g, /TemplateCamposExtras/);
  assert.match(extras, /camposCustomizados/);
  assert.match(extras, /condicoesCustomizadas/);
  assert.match(admin, /Diagnóstico do template/);
});

test('lacre é opcional em Balística e Patrimônio e obrigatório em Drogas', () => {
  const bal = read('../../frontend/src/components/forms/FormBalistica.jsx');
  const pat = read('../../frontend/src/components/forms/FormPatrimonio.jsx');
  const drogas = read('../src/services/especies/drogas.js');
  assert.match(bal, /Nº do Lacre[\s\S]{0,120}\(opcional\)/);
  assert.match(pat, /Nº do Lacre[\s\S]{0,120}\(opcional\)/);
  assert.match(drogas, /número do envelope de encaminhamento\/guarda é obrigatório/);
  assert.match(drogas, /número do envelope da amostra é obrigatório/);
});

test('V17.10.1 mantém o backend sem automação nativa de teclado para o PCNet', () => {
  const p = JSON.parse(read('../package.json'));
  const deps = Object.keys(p.dependencies || {});
  assert.equal(deps.some(x => /puppeteer|playwright|selenium/i.test(x)), false);
  const server = read('../server.js');
  assert.doesNotMatch(server, /pcnetNativeRoutes/);
  assert.equal(fs.existsSync(path.join(__dirname, '../src/routes/pcnetNativeRoutes.js')), false);
  assert.equal(fs.existsSync(path.join(__dirname, '../src/services/pcnetNativeInputService.js')), false);
  assert.equal(fs.existsSync(path.join(__dirname, '../src/scripts/pcnet_native_ctrl_f2.ps1')), false);
});

test('Bridge V2.11 cria FAV, automatiza CL/AC e oculta somente a aba PCNet gerenciada', () => {
  const bg = read('../../pcnet-bridge-firefox/background.js');
  const content = read('../../pcnet-bridge-firefox/content-pcnet.js');
  const frontend = read('../../frontend/src/components/PcnetLaudoMovimentacao.jsx');
  const gerador = read('../../frontend/src/components/GeradorLaudo.jsx');
  const manifest = JSON.parse(read('../../pcnet-bridge-firefox/manifest.json'));
  assert.equal(manifest.version, '0.2.11.0');
  assert.ok((manifest.permissions || []).includes('scripting'));
  assert.match(bg, /world: 'MAIN'/);
  assert.match(bg, /acessarprocedimentolaudopericialsel\.do/);
  assert.doesNotMatch(bg, /acessarprocedimentolaudopericiaissel\.do/);
  assert.match(bg, /PREPARE_SAVE_COLETA/);
  assert.match(bg, /PREPARE_SAVE_ACONDICIONAMENTO/);
  assert.match(bg, /Registros gravados com sucesso/);
  assert.match(bg, /unidadeUsuario/);
  assert.match(bg, /agendarOcultacaoAposAutenticacao/);
  assert.match(bg, /ocultarAposAutenticacao/);
  assert.match(bg, /MANAGED_ROOT_KEY/);
  assert.match(bg, /gerenciadaId === sender\.tab\.id/);
  assert.match(bg, /abaRelacionadaAoContexto/);
  assert.match(bg, /Abas PCNet abertas manualmente/);
  assert.match(bg, /browser\.tabs\.hide/);
  assert.match(content, /materialColetadoTerceiro1/);
  assert.match(content, /enderecoFatoColeta/);
  assert.match(content, /localizacao/);
  assert.match(content, /materialAcondicionadoTerceiro1/);
  assert.match(content, /involucroRompidoStr1/);
  assert.match(content, /msg_confirma/);
  assert.match(frontend, /unidadeUsuario/);
  assert.match(frontend, /Movimentar FAV/);
  assert.match(frontend, /Conectar PCNet/);
  assert.doesNotMatch(frontend, />Mostrar PCNet</);
  assert.doesNotMatch(frontend, />Ocultar PCNet</);
  assert.match(frontend, /CRIAR_FAV_AMOSTRA/);
  assert.match(frontend, /PREPARAR_ETAPAS_FAV/);
  assert.match(frontend, /fluxo terminou com uma ou mais pendências/i);
  assert.doesNotMatch(frontend, />Movimentar amostra</);
  assert.match(gerador, /unidadeUsuario=\{usuario\?\.unidade \|\| ''\}/);
  assert.doesNotMatch(bg, /SendInput|CTRL_F2_ENTER|criarJanelaAuxiliarPesquisaLaudo/);
});

test('junção DOCX preserva estilos adicionais do template e diagnostica recursos avançados', () => {
  const merge = read('../src/services/docxMergeService.js');
  const analyzer = read('../src/services/templateAnalyzer.js');
  assert.match(merge, /mesclarEstilosAusentes/);
  assert.match(merge, /word\/styles\.xml/);
  assert.match(analyzer, /usaNumeracao/);
  assert.match(analyzer, /temGraficos/);
  assert.match(analyzer, /temComentarios/);
  assert.match(analyzer, /tagsForaDoCorpo/);
});

test('balística: rajada não é oferecida/aceita para revólver', () => {
  assert.throws(() => processarBalistica({
    tipo_material: 'revolver', resultado_exame: 'rajada', calibre: '.38', acabamento: 'oxidado', comprimento_cano: '100', comprimento_total: '200', capacidade: '6', empunhadura_revolver: 'madeira',
  }), /não é compatível com revólver/);
  const bal = read('../../frontend/src/components/forms/FormBalistica.jsx');
  assert.match(bal, /tipo_material !== 'revolver'/);
});
