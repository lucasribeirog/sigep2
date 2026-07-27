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
router.post('/gerar-laudo', upload.fields([
    { name: 'arquivo_pcnet', maxCount: 1 },
    { name: 'foto_objeto', maxCount: 1 }
]), laudoController.gerarLaudo);

router.post('/gerar-laudo-pdf', upload.fields([
    { name: 'arquivo_pcnet', maxCount: 1 },
    { name: 'foto_objeto', maxCount: 1 }
]), laudoController.gerarLaudoPdf);


router.post('/analisar-foto', upload.single('foto_objeto'), laudoController.analisarFotoObjeto);


module.exports = router;