const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, '../../database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao abrir o banco SQLite:', err.message);
    } else {
        console.log('📦 Conectado ao banco de dados SQLite local.');
    }
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL,
        masp TEXT NOT NULL,
        unidade TEXT NOT NULL
    )`);

    // Catálogo oficial de espécies permitidas
    db.run(`CREATE TABLE IF NOT EXISTS catalogo_especies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        natureza TEXT NOT NULL,
        especie TEXT NOT NULL UNIQUE
    )`);

    // Tabela que guarda o arquivo .docx vinculado à espécie oficial
    db.run(`CREATE TABLE IF NOT EXISTS templates_laudo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        especie TEXT NOT NULL UNIQUE,
        arquivo BLOB NOT NULL,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (especie) REFERENCES catalogo_especies(especie)
    )`);
});

module.exports = db;