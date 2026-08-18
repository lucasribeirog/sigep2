const db = require('../config/database');
const { FORMULARIOS, capacidadeFormulario } = require('../services/formDefinitions');
const { analisarTemplate } = require('../services/templateAnalyzer');

const { get, all, run } = db.promises;

function texto(v) { return String(v ?? '').trim(); }
function bool(v) { return v === true || v === 1 || v === '1' || v === 'true'; }
function validarFormulario(v) { return Object.prototype.hasOwnProperty.call(FORMULARIOS, v); }
function parseJson(v, fallback = null) {
  if (!v) return fallback;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}
function disposition(nome) {
  return `attachment; filename*=UTF-8''${encodeURIComponent(nome || 'template.docx')}`;
}
function serializarDiagnostico(d) {
  return {
    manifesto: JSON.stringify(d),
    avisos: JSON.stringify(d.avisos || []),
    hash: d.hashSha256,
    status: d.status,
  };
}
function normalizarNomeUnidade(v) {
  let s = texto(v).replace(/<[^>]+>/g, '').trim();
  const p = s.split(/\s+-\s+/);
  if (p.length === 2 && p[0].toLocaleLowerCase('pt-BR') === p[1].toLocaleLowerCase('pt-BR')) s = p[0];
  return s.replace(/\s+/g, ' ').trim();
}

async function dashboard(_req, res) {
  try {
    await db.ready;
    const [usuarios, admins, especies, ativas, templates, unidades, templatesAtencao] = await Promise.all([
      get('SELECT COUNT(*) n FROM usuarios'),
      get("SELECT COUNT(*) n FROM usuarios WHERE role='admin' AND ativo=1"),
      get('SELECT COUNT(*) n FROM catalogo_especies'),
      get('SELECT COUNT(*) n FROM catalogo_especies WHERE ativo=1'),
      get('SELECT COUNT(*) n FROM templates_especies t INNER JOIN catalogo_especies c ON c.id=t.especie_id WHERE c.ativo=1'),
      get('SELECT COUNT(*) n FROM unidades WHERE ativo=1'),
      get("SELECT COUNT(*) n FROM templates_especies WHERE status_template IN ('atencao','invalido')"),
    ]);
    return res.json({
      usuarios: usuarios.n,
      administradores: admins.n,
      especies: especies.n,
      especiesAtivas: ativas.n,
      templates: templates.n,
      semTemplate: Math.max(0, ativas.n - templates.n),
      unidades: unidades.n,
      templatesAtencao: templatesAtencao.n,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro ao carregar indicadores administrativos.' });
  }
}

async function formularios(_req, res) {
  return res.json(Object.values(FORMULARIOS).map((f) => ({ ...f, capacidade: capacidadeFormulario(f.id) })));
}

async function listarEspecies(_req, res) {
  try {
    await db.ready;
    const rows = await all(`
      SELECT c.id,c.natureza,c.especie,c.nome_exibicao,c.formulario,c.descricao,c.ativo,c.ordem,c.criado_em,c.atualizado_em,
             CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS tem_template,
             t.nome_arquivo,t.versao AS template_versao,t.atualizado_em AS template_atualizado_em,LENGTH(t.arquivo) AS template_bytes,
             t.manifesto_json,t.avisos_json,t.hash_sha256,t.status_template,t.analisado_em
      FROM catalogo_especies c
      LEFT JOIN templates_especies t ON t.especie_id=c.id
      ORDER BY c.ativo DESC,c.ordem,c.natureza COLLATE NOCASE,c.nome_exibicao COLLATE NOCASE`);
    return res.json(rows.map((r) => ({
      ...r,
      ativo: Boolean(r.ativo),
      tem_template: Boolean(r.tem_template),
      template_manifesto: parseJson(r.manifesto_json, null),
      template_avisos: parseJson(r.avisos_json, []),
    })));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro ao carregar espécies.' });
  }
}

async function criarEspecie(req, res) {
  const b = req.body || {};
  const natureza = texto(b.natureza);
  const especie = texto(b.especie);
  const nome = texto(b.nome_exibicao || b.especie);
  const formulario = texto(b.formulario);
  const descricao = texto(b.descricao);
  const ordem = Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : 0;
  if (!natureza || !especie || !nome || !formulario) return res.status(400).json({ erro: 'Natureza, nome oficial, nome de exibição e formulário são obrigatórios.' });
  if (!validarFormulario(formulario)) return res.status(400).json({ erro: 'Modelo de formulário inválido.' });
  try {
    const r = await run(`INSERT INTO catalogo_especies (natureza,especie,nome_exibicao,formulario,descricao,ativo,ordem,criado_em,atualizado_em)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [natureza, especie, nome, formulario, descricao, b.ativo === false ? 0 : 1, ordem]);
    return res.status(201).json({ mensagem: 'Espécie criada com sucesso.', id: r.lastID });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ erro: 'Já existe uma espécie com esse nome oficial.' });
    console.error(e);
    return res.status(500).json({ erro: 'Erro ao criar espécie.' });
  }
}

async function atualizarEspecie(req, res) {
  const id = Number(req.params.id);
  const atual = await get('SELECT * FROM catalogo_especies WHERE id=?', [id]);
  if (!atual) return res.status(404).json({ erro: 'Espécie não encontrada.' });
  const b = req.body || {};
  const natureza = texto(b.natureza ?? atual.natureza);
  const especie = texto(b.especie ?? atual.especie);
  const nome = texto(b.nome_exibicao ?? atual.nome_exibicao);
  const formulario = texto(b.formulario ?? atual.formulario);
  const descricao = texto(b.descricao ?? atual.descricao);
  const ordem = Number.isFinite(Number(b.ordem)) ? Number(b.ordem) : atual.ordem;
  const ativo = b.ativo === undefined ? atual.ativo : (bool(b.ativo) ? 1 : 0);
  if (!natureza || !especie || !nome) return res.status(400).json({ erro: 'Natureza, nome oficial e nome de exibição são obrigatórios.' });
  if (!validarFormulario(formulario)) return res.status(400).json({ erro: 'Modelo de formulário inválido.' });
  try {
    await run(`UPDATE catalogo_especies SET natureza=?,especie=?,nome_exibicao=?,formulario=?,descricao=?,ativo=?,ordem=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?`,
      [natureza, especie, nome, formulario, descricao, ativo, ordem, id]);

    // Se o modelo de formulário mudou, reanalisa o template ativo sob a nova lógica.
    if (formulario !== atual.formulario) {
      const tpl = await get('SELECT arquivo FROM templates_especies WHERE especie_id=?', [id]);
      if (tpl?.arquivo) {
        try {
          const d = analisarTemplate(tpl.arquivo, formulario);
          const s = serializarDiagnostico(d);
          await run(`UPDATE templates_especies SET manifesto_json=?,avisos_json=?,hash_sha256=?,status_template=?,analisado_em=CURRENT_TIMESTAMP WHERE especie_id=?`,
            [s.manifesto, s.avisos, s.hash, s.status, id]);
        } catch (e) {
          await run(`UPDATE templates_especies SET status_template='invalido',avisos_json=?,analisado_em=CURRENT_TIMESTAMP WHERE especie_id=?`, [JSON.stringify([e.message]), id]);
        }
      }
    }
    return res.json({ mensagem: 'Espécie atualizada com sucesso.' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ erro: 'Já existe outra espécie com esse nome oficial.' });
    console.error(e);
    return res.status(500).json({ erro: 'Erro ao atualizar espécie.' });
  }
}

async function salvarTemplate(req, res) {
  const especieId = Number(req.params.id);
  const arquivo = req.file?.buffer;
  if (!arquivo) return res.status(400).json({ erro: 'Selecione um arquivo .docx.' });
  const especie = await get('SELECT id,nome_exibicao,formulario FROM catalogo_especies WHERE id=?', [especieId]);
  if (!especie) return res.status(404).json({ erro: 'Espécie não encontrada.' });

  let diagnostico;
  try {
    diagnostico = analisarTemplate(arquivo, especie.formulario);
  } catch (e) {
    return res.status(400).json({ erro: `Não foi possível analisar o template: ${e.message}` });
  }
  if (diagnostico.status === 'invalido') {
    return res.status(422).json({ erro: 'O template possui estrutura Docxtemplater inválida.', diagnostico });
  }

  const nomeArquivo = texto(req.file.originalname) || 'template.docx';
  const s = serializarDiagnostico(diagnostico);
  try {
    await run('BEGIN IMMEDIATE');
    const max = await get('SELECT COALESCE(MAX(versao),0) AS v FROM template_versoes WHERE especie_id=?', [especieId]);
    const versao = (max?.v || 0) + 1;
    await run(`INSERT INTO template_versoes
      (especie_id,versao,nome_arquivo,arquivo,usuario_id,manifesto_json,avisos_json,hash_sha256,status_template)
      VALUES (?,?,?,?,?,?,?,?,?)`, [especieId, versao, nomeArquivo, arquivo, req.usuario.id, s.manifesto, s.avisos, s.hash, s.status]);
    await run(`INSERT INTO templates_especies
      (especie_id,nome_arquivo,arquivo,versao,atualizado_em,atualizado_por,manifesto_json,avisos_json,hash_sha256,status_template,analisado_em)
      VALUES (?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(especie_id) DO UPDATE SET
        nome_arquivo=excluded.nome_arquivo,arquivo=excluded.arquivo,versao=excluded.versao,
        atualizado_em=CURRENT_TIMESTAMP,atualizado_por=excluded.atualizado_por,
        manifesto_json=excluded.manifesto_json,avisos_json=excluded.avisos_json,
        hash_sha256=excluded.hash_sha256,status_template=excluded.status_template,analisado_em=CURRENT_TIMESTAMP`,
      [especieId, nomeArquivo, arquivo, versao, req.usuario.id, s.manifesto, s.avisos, s.hash, s.status]);
    await run('COMMIT');
    return res.json({
      mensagem: `Template v${versao} vinculado a ${especie.nome_exibicao}.`,
      versao,
      diagnostico,
    });
  } catch (e) {
    try { await run('ROLLBACK'); } catch { /* noop */ }
    console.error(e);
    return res.status(500).json({ erro: 'Erro ao salvar template.' });
  }
}

async function removerTemplate(req, res) {
  const r = await run('DELETE FROM templates_especies WHERE especie_id=?', [Number(req.params.id)]);
  if (!r.changes) return res.status(404).json({ erro: 'A espécie não possui template ativo.' });
  return res.json({ mensagem: 'Template ativo removido. O histórico de versões foi preservado.' });
}

async function listarVersoes(req, res) {
  const rows = await all(`SELECT v.id,v.versao,v.nome_arquivo,v.criado_em,LENGTH(v.arquivo) bytes,u.nome AS usuario_nome,
    v.manifesto_json,v.avisos_json,v.hash_sha256,v.status_template
    FROM template_versoes v LEFT JOIN usuarios u ON u.id=v.usuario_id
    WHERE v.especie_id=? ORDER BY v.versao DESC`, [Number(req.params.id)]);
  return res.json(rows.map((r) => ({
    ...r,
    template_manifesto: parseJson(r.manifesto_json, null),
    template_avisos: parseJson(r.avisos_json, []),
  })));
}

async function baixarTemplate(req, res) {
  const row = await get('SELECT nome_arquivo,arquivo FROM templates_especies WHERE especie_id=?', [Number(req.params.id)]);
  if (!row) return res.status(404).json({ erro: 'Template ativo não encontrado.' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', disposition(row.nome_arquivo));
  return res.send(row.arquivo);
}
async function baixarVersao(req, res) {
  const row = await get('SELECT nome_arquivo,arquivo FROM template_versoes WHERE especie_id=? AND versao=?', [Number(req.params.id), Number(req.params.versao)]);
  if (!row) return res.status(404).json({ erro: 'Versão do template não encontrada.' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', disposition(row.nome_arquivo));
  return res.send(row.arquivo);
}
async function restaurarVersao(req, res) {
  const row = await get('SELECT nome_arquivo,arquivo FROM template_versoes WHERE especie_id=? AND versao=?', [Number(req.params.id), Number(req.params.versao)]);
  if (!row) return res.status(404).json({ erro: 'Versão do template não encontrada.' });
  req.file = { buffer: row.arquivo, originalname: `restaurado_v${req.params.versao}_${row.nome_arquivo}` };
  return salvarTemplate(req, res);
}

async function listarUnidades(_req, res) {
  try {
    const rows = await all(`SELECT u.id,u.codigo_externo,u.nome,u.ativo,u.ordem,u.criado_em,u.atualizado_em,COUNT(us.id) usuarios_vinculados
      FROM unidades u LEFT JOIN usuarios us ON us.unidade_id=u.id GROUP BY u.id
      ORDER BY u.ativo DESC,u.ordem,u.nome COLLATE NOCASE`);
    return res.json(rows.map((u) => ({ ...u, ativo: Boolean(u.ativo) })));
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro ao carregar unidades.' });
  }
}
async function criarUnidade(req, res) {
  const nome = normalizarNomeUnidade(req.body?.nome);
  const codigo = texto(req.body?.codigo_externo) || null;
  const ordem = Number.isFinite(Number(req.body?.ordem)) ? Number(req.body.ordem) : 0;
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da unidade.' });
  try {
    const r = await run(`INSERT INTO unidades (codigo_externo,nome,ativo,ordem,criado_em,atualizado_em) VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [codigo, nome, req.body?.ativo === false ? 0 : 1, ordem]);
    return res.status(201).json({ mensagem: 'Unidade criada com sucesso.', id: r.lastID });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ erro: 'Já existe uma unidade com este código ou nome.' });
    console.error(e); return res.status(500).json({ erro: 'Erro ao criar unidade.' });
  }
}
async function atualizarUnidade(req, res) {
  const id = Number(req.params.id);
  const atual = await get('SELECT * FROM unidades WHERE id=?', [id]);
  if (!atual) return res.status(404).json({ erro: 'Unidade não encontrada.' });
  const nome = normalizarNomeUnidade(req.body?.nome ?? atual.nome);
  const codigo = texto(req.body?.codigo_externo ?? atual.codigo_externo) || null;
  const ordem = Number.isFinite(Number(req.body?.ordem)) ? Number(req.body.ordem) : atual.ordem;
  const ativo = req.body?.ativo === undefined ? atual.ativo : (bool(req.body.ativo) ? 1 : 0);
  if (!nome) return res.status(400).json({ erro: 'Informe o nome da unidade.' });
  try {
    await run('UPDATE unidades SET codigo_externo=?,nome=?,ativo=?,ordem=?,atualizado_em=CURRENT_TIMESTAMP WHERE id=?', [codigo, nome, ativo, ordem, id]);
    await run('UPDATE usuarios SET unidade=? WHERE unidade_id=?', [nome, id]);
    return res.json({ mensagem: 'Unidade atualizada com sucesso.' });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(409).json({ erro: 'Já existe uma unidade com este código ou nome.' });
    console.error(e); return res.status(500).json({ erro: 'Erro ao atualizar unidade.' });
  }
}
function extrairLinhasUnidades(conteudo) {
  const saida = [];
  const htmlRx = /<option\b[^>]*value=["']?([^"'\s>]*)["']?[^>]*>([\s\S]*?)<\/option>/gi;
  let m;
  const consumidos = new Set();
  while ((m = htmlRx.exec(conteudo))) {
    const codigo = texto(m[1]);
    const nome = normalizarNomeUnidade(m[2]);
    if (nome && !/selecione|escolha/i.test(nome)) { saida.push({ codigo, nome }); consumidos.add(m[0]); }
  }
  const resto = String(conteudo || '').replace(htmlRx, '\n');
  for (const linha0 of resto.split(/\r?\n/)) {
    const linha = texto(linha0);
    if (!linha || linha.startsWith('<')) continue;
    let codigo = '', nome = linha;
    const p = linha.split(/[;\t]/);
    if (p.length >= 2) { codigo = texto(p.shift()); nome = normalizarNomeUnidade(p.join(' ')); }
    else nome = normalizarNomeUnidade(linha);
    if (nome) saida.push({ codigo, nome });
  }
  const chaves = new Set();
  return saida.filter((x) => {
    const k = `${x.codigo.toLowerCase()}|${x.nome.toLocaleLowerCase('pt-BR')}`;
    if (chaves.has(k)) return false;
    chaves.add(k); return true;
  });
}
async function importarUnidades(req, res) {
  const itens = extrairLinhasUnidades(req.body?.conteudo || '');
  if (!itens.length) return res.status(400).json({ erro: 'Nenhuma unidade válida foi encontrada no conteúdo informado.' });
  let criadas = 0, ignoradas = 0;
  for (let i = 0; i < itens.length; i += 1) {
    const x = itens[i];
    try {
      const r = await run(`INSERT OR IGNORE INTO unidades (codigo_externo,nome,ativo,ordem,criado_em,atualizado_em) VALUES (?,?,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [x.codigo || null, x.nome, 1000 + i]);
      if (r.changes) criadas += 1; else ignoradas += 1;
    } catch { ignoradas += 1; }
  }
  return res.json({ mensagem: `Importação concluída: ${criadas} unidade(s) criada(s) e ${ignoradas} ignorada(s).`, criadas, ignoradas });
}

module.exports = {
  dashboard, formularios, listarEspecies, criarEspecie, atualizarEspecie,
  salvarTemplate, removerTemplate, listarVersoes, baixarTemplate, baixarVersao, restaurarVersao,
  listarUnidades, criarUnidade, atualizarUnidade, importarUnidades,
};
