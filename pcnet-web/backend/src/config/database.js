const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const { analisarTemplate } = require('../services/templateAnalyzer');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('Erro ao abrir o banco SQLite:', err.message);
    else console.log('📦 Conectado ao banco de dados SQLite local.');
});

function run(sql, params = []) {
    return new Promise((resolve, reject) => db.run(sql, params, function onRun(err) {
        if (err) return reject(err);
        resolve({ lastID: this.lastID, changes: this.changes });
    }));
}
function get(sql, params = []) {
    return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function all(sql, params = []) {
    return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}

async function ensureColumn(table, column, definition) {
    const cols = await all(`PRAGMA table_info(${table})`);
    if (!cols.some((c) => c.name === column)) await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

const UNIDADES_INICIAIS = [
    ['47', 'STRC Guanhães'], ['81', 'STRC Guaxupé'], ['58', 'STRC Ipatinga'], ['60', 'STRC Itabira'],
    ['77', 'STRC Itajubá'], ['49', 'STRC Ituiutaba'], ['40', 'STRC Iturama'], ['55', 'STRC Janaúba'],
    ['56', 'STRC Januária'], ['61', 'STRC João Monlevade'], ['32', 'STRC Juiz de Fora'], ['3', 'STRC Lavras'],
    ['33', 'STRC Leopoldina'], ['51', 'STRC Manhuaçu'], ['54', 'STRC Montes Claros'], ['34', 'STRC Muriaé'],
    ['73', 'STRC Nanuque'], ['44', 'STRC Nova Serrana'], ['30', 'STRC Ouro Preto'], ['45', 'STRC Pará de Minas'],
    ['75', 'STRC Paracatu'], ['82', 'STRC Passos'], ['52', 'STRC Patos de Minas'], ['53', 'STRC Patrocínio'],
    ['71', 'STRC Pedra Azul'], ['69', 'STRC Pirapora'], ['79', 'STRC Poços de Caldas'], ['62', 'STRC Ponte Nova'],
    ['76', 'STRC Pouso Alegre'], ['29', 'STRC Ribeirão das Neves'], ['23', 'STRC Santa Luzia'], ['65', 'STRC São João del Rei'],
    ['78', 'STRC São Lourenço'], ['84', 'STRC Sete Lagoas'], ['57', 'STRC Taiobeiras'], ['70', 'STRC Teófilo Otoni'],
    ['2', 'STRC Três Corações'], ['35', 'STRC Ubá'], ['37', 'STRC Uberaba'], ['48', 'STRC Uberlândia'],
    ['74', 'STRC Unaí'], ['22', 'STRC Varginha'], ['26', 'STRC Vespasiano'], ['36', 'STRC Viçosa']
];

function chaveUnidade(v) {
    let s = String(v || '').trim();
    const partes = s.split(/\s+-\s+/);
    if (partes.length === 2 && partes[0].toLocaleLowerCase('pt-BR') === partes[1].toLocaleLowerCase('pt-BR')) s = partes[0];
    return s.replace(/^STRC\s+/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function migrarUnidadesUsuarios() {
    const unidades = await all('SELECT id,nome FROM unidades');
    const usuarios = await all("SELECT id,unidade,unidade_id FROM usuarios WHERE unidade IS NOT NULL AND trim(unidade)<>''");
    const mapa = new Map(unidades.map((u) => [chaveUnidade(u.nome), u]));
    for (const u of usuarios) {
        if (u.unidade_id) continue;
        const chave = chaveUnidade(u.unidade);
        let unidade = mapa.get(chave);
        if (!unidade) {
            const nome = String(u.unidade).trim();
            const criado = await run(`INSERT OR IGNORE INTO unidades (nome,ativo,ordem,criado_em,atualizado_em) VALUES (?,1,999,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [nome]);
            unidade = criado.lastID ? { id: criado.lastID, nome } : await get('SELECT id,nome FROM unidades WHERE lower(nome)=lower(?)', [nome]);
            if (unidade) mapa.set(chave, unidade);
        }
        if (unidade) await run('UPDATE usuarios SET unidade_id=?, unidade=? WHERE id=?', [unidade.id, unidade.nome, u.id]);
    }
}

async function initialize() {
    await run('PRAGMA foreign_keys = ON');
    await run('PRAGMA journal_mode = WAL');
    await run('PRAGMA busy_timeout = 5000');

    await run(`CREATE TABLE IF NOT EXISTS unidades (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo_externo TEXT UNIQUE,
        nome TEXT NOT NULL UNIQUE,
        ativo INTEGER NOT NULL DEFAULT 1,
        ordem INTEGER NOT NULL DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    for (let i = 0; i < UNIDADES_INICIAIS.length; i++) {
        const [codigo, nome] = UNIDADES_INICIAIS[i];
        await run(`INSERT OR IGNORE INTO unidades (codigo_externo,nome,ativo,ordem,criado_em,atualizado_em)
                   VALUES (?,?,1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [codigo, nome, i + 1]);
    }

    await run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL,
        masp TEXT NOT NULL,
        unidade TEXT NOT NULL,
        unidade_id INTEGER,
        role TEXT NOT NULL DEFAULT 'usuario',
        ativo INTEGER NOT NULL DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await ensureColumn('usuarios', 'unidade_id', 'INTEGER');
    await ensureColumn('usuarios', 'role', "TEXT NOT NULL DEFAULT 'usuario'");
    await ensureColumn('usuarios', 'ativo', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('usuarios', 'criado_em', 'DATETIME');
    await ensureColumn('usuarios', 'atualizado_em', 'DATETIME');

    await run(`CREATE TABLE IF NOT EXISTS catalogo_especies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        natureza TEXT NOT NULL,
        especie TEXT NOT NULL UNIQUE,
        nome_exibicao TEXT,
        formulario TEXT NOT NULL DEFAULT 'balistica',
        descricao TEXT DEFAULT '',
        ativo INTEGER NOT NULL DEFAULT 1,
        ordem INTEGER NOT NULL DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    await ensureColumn('catalogo_especies', 'nome_exibicao', 'TEXT');
    await ensureColumn('catalogo_especies', 'formulario', "TEXT NOT NULL DEFAULT 'balistica'");
    await ensureColumn('catalogo_especies', 'descricao', "TEXT DEFAULT ''");
    await ensureColumn('catalogo_especies', 'ativo', 'INTEGER NOT NULL DEFAULT 1');
    await ensureColumn('catalogo_especies', 'ordem', 'INTEGER NOT NULL DEFAULT 0');
    await ensureColumn('catalogo_especies', 'criado_em', 'DATETIME');
    await ensureColumn('catalogo_especies', 'atualizado_em', 'DATETIME');

    await run(`CREATE TABLE IF NOT EXISTS templates_laudo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        especie TEXT NOT NULL UNIQUE,
        arquivo BLOB NOT NULL,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (especie) REFERENCES catalogo_especies(especie)
    )`);

    await run(`CREATE TABLE IF NOT EXISTS templates_especies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        especie_id INTEGER NOT NULL UNIQUE,
        nome_arquivo TEXT NOT NULL,
        arquivo BLOB NOT NULL,
        versao INTEGER NOT NULL DEFAULT 1,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_por INTEGER,
        FOREIGN KEY (especie_id) REFERENCES catalogo_especies(id) ON DELETE CASCADE,
        FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )`);

    await run(`CREATE TABLE IF NOT EXISTS template_versoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        especie_id INTEGER NOT NULL,
        versao INTEGER NOT NULL,
        nome_arquivo TEXT NOT NULL,
        arquivo BLOB NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        usuario_id INTEGER,
        UNIQUE(especie_id, versao),
        FOREIGN KEY (especie_id) REFERENCES catalogo_especies(id) ON DELETE CASCADE,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
    )`);

    for (const [tabela, colunas] of Object.entries({
        templates_especies: [
            ['manifesto_json', 'TEXT'], ['avisos_json', 'TEXT'], ['hash_sha256', 'TEXT'],
            ['status_template', "TEXT DEFAULT 'nao_analisado'"], ['analisado_em', 'DATETIME']
        ],
        template_versoes: [
            ['manifesto_json', 'TEXT'], ['avisos_json', 'TEXT'], ['hash_sha256', 'TEXT'],
            ['status_template', "TEXT DEFAULT 'nao_analisado'"]
        ]
    })) {
        for (const [coluna, definicao] of colunas) await ensureColumn(tabela, coluna, definicao);
    }

    await run(`CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        usuario_id INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )`);

    await run('CREATE INDEX IF NOT EXISTS idx_auth_sessions_usuario ON auth_sessions(usuario_id)');
    await run('CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at)');
    await run('CREATE INDEX IF NOT EXISTS idx_catalogo_ativo ON catalogo_especies(ativo, ordem, natureza)');
    await run('CREATE INDEX IF NOT EXISTS idx_template_versoes_especie ON template_versoes(especie_id, versao DESC)');
    await run('CREATE INDEX IF NOT EXISTS idx_unidades_ativo ON unidades(ativo, ordem, nome)');
    await run('CREATE INDEX IF NOT EXISTS idx_usuarios_unidade ON usuarios(unidade_id)');

    const qtdEspecies = await get('SELECT COUNT(*) AS n FROM catalogo_especies');
    if (!qtdEspecies?.n) {
        const defaults = [
            ['Balística', 'Eficiencia Armas de Fogo e/ou municoes', 'Eficiência de Arma de Fogo e Munição', 'balistica', 'Exames de eficiência de armas de fogo e munições.', 10],
            ['Patrimônio / Instrumentos', 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem', 'Eficiência e Prestabilidade de Objeto', 'eficiencia_objeto', 'Exame de objetos utilizados para ofender a integridade física.', 20],
            ['Química Forense', 'Laudo Preliminar de Constatação de Drogas', 'Constatação Preliminar de Drogas', 'drogas', 'Laudo preliminar de constatação de substâncias entorpecentes.', 30]
        ];
        for (const row of defaults) {
            await run(`INSERT INTO catalogo_especies (natureza, especie, nome_exibicao, formulario, descricao, ativo, ordem)
                       VALUES (?, ?, ?, ?, ?, 1, ?)`, row);
        }
    }

    await run(`UPDATE catalogo_especies SET formulario='balistica', nome_exibicao=COALESCE(NULLIF(nome_exibicao,''),'Eficiência de Arma de Fogo e Munição')
               WHERE especie='Eficiencia Armas de Fogo e/ou municoes'`);
    await run(`UPDATE catalogo_especies SET formulario='eficiencia_objeto', nome_exibicao=COALESCE(NULLIF(nome_exibicao,''),'Eficiência e Prestabilidade de Objeto')
               WHERE especie='Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem'`);
    await run(`UPDATE catalogo_especies SET formulario='drogas', nome_exibicao=COALESCE(NULLIF(nome_exibicao,''),'Constatação Preliminar de Drogas')
               WHERE especie='Laudo Preliminar de Constatação de Drogas'`);
    await run(`UPDATE catalogo_especies SET nome_exibicao=especie WHERE nome_exibicao IS NULL OR trim(nome_exibicao)=''`);

    await run(`INSERT OR IGNORE INTO templates_especies (especie_id, nome_arquivo, arquivo, versao, atualizado_em)
               SELECT c.id, 'template_migrado_v12.docx', t.arquivo, 1, COALESCE(t.atualizado_em, CURRENT_TIMESTAMP)
               FROM templates_laudo t INNER JOIN catalogo_especies c ON c.especie=t.especie`);
    await run(`INSERT OR IGNORE INTO template_versoes (especie_id, versao, nome_arquivo, arquivo, criado_em)
               SELECT te.especie_id, te.versao, te.nome_arquivo, te.arquivo, COALESCE(te.atualizado_em, CURRENT_TIMESTAMP)
               FROM templates_especies te`);
    await run('DROP TABLE IF EXISTS templates_laudo');

    // Instala templates-padrão apenas quando a espécie canônica ainda não possui template.
    const templatesPadrao = {
        balistica: 'balistica.docx',
        eficiencia_objeto: 'eficiencia_objeto.docx',
        drogas: 'drogas.docx'
    };
    // Hashes exatos dos três modelos enviados antes das correções V15. Se o banco
    // ainda estiver usando exatamente um deles, a migração cria uma nova versão
    // corrigida sem apagar o histórico. Templates personalizados nunca são sobrescritos.
    const hashesLegadosV15 = {
        balistica: '92241d3536aa04cca0120e29591c5cf2cd91b813d8e1a4bfbd2eda88c4b81ecd',
        drogas: '4afbe868ce19ed22f70b98f6ed3a00f896400a6ed5e8640c4990ef2cd6ae758a',
        eficiencia_objeto: '87c74945e960c6557838ca2aaf7e9c17a1e877ba09c068724ae1348dfc8dd401'
    };
    for (const [formulario, nomeArquivo] of Object.entries(templatesPadrao)) {
        const especie = await get('SELECT id FROM catalogo_especies WHERE formulario=? ORDER BY id LIMIT 1', [formulario]);
        if (!especie) continue;
        const existente = await get('SELECT id FROM templates_especies WHERE especie_id=?', [especie.id]);
        const arquivoPath = path.resolve(__dirname, '../../templates_padrao', nomeArquivo);
        if (fs.existsSync(arquivoPath)) {
            const buffer = fs.readFileSync(arquivoPath);
            const diagnostico = analisarTemplate(buffer, formulario);
            const manifestoJson = JSON.stringify(diagnostico);
            const avisosJson = JSON.stringify(diagnostico.avisos || []);
            if (!existente) {
                await run(`INSERT INTO templates_especies
                    (especie_id,nome_arquivo,arquivo,versao,atualizado_em,manifesto_json,avisos_json,hash_sha256,status_template,analisado_em)
                    VALUES (?,?,?,1,CURRENT_TIMESTAMP,?,?,?,?,CURRENT_TIMESTAMP)`,
                    [especie.id, nomeArquivo, buffer, manifestoJson, avisosJson, diagnostico.hashSha256, diagnostico.status]);
                await run(`INSERT OR IGNORE INTO template_versoes
                    (especie_id,versao,nome_arquivo,arquivo,criado_em,manifesto_json,avisos_json,hash_sha256,status_template)
                    VALUES (?,1,?,?,CURRENT_TIMESTAMP,?,?,?,?)`,
                    [especie.id, nomeArquivo, buffer, manifestoJson, avisosJson, diagnostico.hashSha256, diagnostico.status]);
            } else {
                const ativo = await get('SELECT arquivo,versao,hash_sha256 FROM templates_especies WHERE especie_id=?', [especie.id]);
                let hashAtivo = ativo?.hash_sha256;
                if (!hashAtivo && ativo?.arquivo) {
                    try { hashAtivo = analisarTemplate(ativo.arquivo, formulario).hashSha256; } catch { hashAtivo = null; }
                }
                if (hashAtivo && hashAtivo === hashesLegadosV15[formulario] && hashAtivo !== diagnostico.hashSha256) {
                    const max = await get('SELECT COALESCE(MAX(versao),0) AS v FROM template_versoes WHERE especie_id=?', [especie.id]);
                    const novaVersao = (max?.v || ativo?.versao || 0) + 1;
                    await run(`INSERT OR IGNORE INTO template_versoes
                        (especie_id,versao,nome_arquivo,arquivo,criado_em,manifesto_json,avisos_json,hash_sha256,status_template)
                        VALUES (?,?,?,?,CURRENT_TIMESTAMP,?,?,?,?)`,
                        [especie.id,novaVersao,`nexus_v15_${nomeArquivo}`,buffer,manifestoJson,avisosJson,diagnostico.hashSha256,diagnostico.status]);
                    await run(`UPDATE templates_especies SET nome_arquivo=?,arquivo=?,versao=?,atualizado_em=CURRENT_TIMESTAMP,
                        manifesto_json=?,avisos_json=?,hash_sha256=?,status_template=?,analisado_em=CURRENT_TIMESTAMP WHERE especie_id=?`,
                        [`nexus_v15_${nomeArquivo}`,buffer,novaVersao,manifestoJson,avisosJson,diagnostico.hashSha256,diagnostico.status,especie.id]);
                    console.log(`🧾 Migração V15: template canônico ${formulario} atualizado para v${novaVersao}; versão anterior preservada.`);
                }
            }
        }
    }

    // Analisa templates herdados de versões anteriores para alimentar o diagnóstico administrativo.
    const templatesSemAnalise = await all(`SELECT t.especie_id,t.arquivo,c.formulario
        FROM templates_especies t INNER JOIN catalogo_especies c ON c.id=t.especie_id
        WHERE t.manifesto_json IS NULL OR trim(t.manifesto_json)=''`);
    for (const t of templatesSemAnalise) {
        try {
            const d = analisarTemplate(t.arquivo, t.formulario);
            await run(`UPDATE templates_especies SET manifesto_json=?,avisos_json=?,hash_sha256=?,status_template=?,analisado_em=CURRENT_TIMESTAMP WHERE especie_id=?`,
                [JSON.stringify(d), JSON.stringify(d.avisos || []), d.hashSha256, d.status, t.especie_id]);
        } catch (e) {
            await run(`UPDATE templates_especies SET status_template='invalido',avisos_json=?,analisado_em=CURRENT_TIMESTAMP WHERE especie_id=?`,
                [JSON.stringify([e.message]), t.especie_id]);
        }
    }

    await migrarUnidadesUsuarios();

    const totalUsuarios = await get('SELECT COUNT(*) AS n FROM usuarios');
    const totalAdmins = await get("SELECT COUNT(*) AS n FROM usuarios WHERE role='admin'");
    if (totalUsuarios?.n > 0 && !totalAdmins?.n) {
        const primeiro = await get('SELECT id FROM usuarios ORDER BY id ASC LIMIT 1');
        if (primeiro) {
            await run("UPDATE usuarios SET role='admin', ativo=1, atualizado_em=CURRENT_TIMESTAMP WHERE id=?", [primeiro.id]);
            console.log(`🔐 Migração V15: usuário #${primeiro.id} promovido a administrador inicial.`);
        }
    }
}

db.ready = initialize().catch((err) => {
    console.error('Falha ao inicializar/migrar o banco de dados:', err);
    throw err;
});
db.promises = { run, get, all };
module.exports = db;
