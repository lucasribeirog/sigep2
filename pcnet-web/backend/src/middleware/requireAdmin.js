module.exports = function requireAdmin(req, res, next) {
    if (!req.usuario) return res.status(401).json({ erro: 'Sessão do Nexus inválida ou expirada.' });
    if (req.usuario.role !== 'admin') return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
    return next();
};
