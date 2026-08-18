const authSessionService = require('../services/authSessionService');
const db = require('../config/database');
async function requireAuth(req, res, next) {
    try {
        await db.ready;
        const token = authSessionService.getTokenFromRequest(req);
        const usuario = await authSessionService.getAuthenticatedUser(token);
        if (!usuario) return res.status(401).json({ erro: 'Sessão do Nexus inválida, expirada ou usuário desativado.' });
        req.usuario = usuario;
        return next();
    } catch (err) {
        console.error('Erro no middleware de autenticação:', err);
        return res.status(500).json({ erro: 'Erro ao validar autenticação.' });
    }
}
module.exports = requireAuth;
