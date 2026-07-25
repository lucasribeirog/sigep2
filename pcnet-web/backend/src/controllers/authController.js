const bcrypt = require('bcryptjs');
const db = require('../config/database');

async function registrar(req, res) {
    const { nome, email, senha, masp, unidade } = req.body;
    try {
        const senhaHash = await bcrypt.hash(senha, 8);
        const query = `INSERT INTO usuarios (nome, email, senha, masp, unidade) VALUES (?, ?, ?, ?, ?)`;
        
        db.run(query, [nome, email, senhaHash, masp, unidade], function(err) {
            if (err) {
                return res.status(400).json({ erro: 'E-mail já cadastrado ou erro nos dados.' });
            }
            res.status(201).json({ mensagem: 'Usuário cadastrado com sucesso!' });
        });
    } catch (err) {
        res.status(500).json({ erro: 'Erro interno no servidor.' });
    }
}

function login(req, res) {
    const { email, senha } = req.body;
    const query = `SELECT * FROM usuarios WHERE email = ?`;

    db.get(query, [email], async (err, usuario) => {
        if (err || !usuario) {
            return res.status(401).json({ erro: 'E-mail não encontrado.' });
        }

        const senhaValida = await bcrypt.compare(senha, usuario.senha);
        if (!senhaValida) {
            return res.status(401).json({ erro: 'Senha incorreta.' });
        }

        res.json({
            sucesso: true,
            usuario: {
                nome: usuario.nome,
                masp: usuario.masp,
                unidade: usuario.unidade,
                email: usuario.email
            }
        });
    });
}

function listarUsuarios(req, res) {
    // Selecionamos apenas os dados úteis, omitindo a senha/hash por segurança
    const query = `SELECT id, nome, email, masp, unidade FROM usuarios`;

    db.all(query, [], (err, linhas) => {
        if (err) {
            return res.status(500).json({ erro: 'Erro ao buscar usuários: ' + err.message });
        }
        res.json(linhas);
    });
}

module.exports = { registrar, login, listarUsuarios };