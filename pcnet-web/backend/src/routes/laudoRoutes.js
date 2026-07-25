const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const laudoController = require('../controllers/laudoController');

// Gestão do Catálogo de Espécies
router.post('/catalogo', laudoController.cadastrarEspecieCatalogo);
router.get('/catalogo', laudoController.listarCatalogo);

// Gestão de Templates e Geração
router.post('/templates', upload.single('arquivo'), laudoController.salvarTemplate);
router.post('/gerar-laudo', upload.single('arquivo_pcnet'), laudoController.gerarLaudo);

module.exports = router;