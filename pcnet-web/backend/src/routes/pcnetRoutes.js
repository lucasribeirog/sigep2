const express = require('express');
const router = express.Router();
const pcnetController = require('../controllers/pcnetController');

// Rota 1: Inicia o login com CPF, Senha e E-mail (Dispara o 2FA)
router.post('/login', pcnetController.solicitarLogin);

// Rota 2: Envia o token recebido no e-mail para validar e salvar os cookies no banco
router.post('/confirmar-2fa', pcnetController.enviarToken);


// Rota 3: Navegação até as requisições pendentes
router.post('/acessar-requisicoes', pcnetController.acessarRequisicoes)

router.post('/exportar-csv', pcnetController.exportarCsv)

module.exports = router;