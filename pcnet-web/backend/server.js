require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/authRoutes');
const laudoRoutes = require('./src/routes/laudoRoutes');
const pcnetRoutes = require('./src/routes/pcnetRoutes');

// 1. IMPORTAÇÕES DO SWAGGER
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./src/config/swagger');

const app = express();

app.use(express.json());
app.use(cors());

// Registro das Rotas
app.use('/api', authRoutes);
app.use('/api', laudoRoutes);
app.use('/api/pcnet', pcnetRoutes);

// 2. CADASTRO DA ROTA DO SWAGGER
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`📄 Documentação Swagger ativa em: http://localhost:${PORT}/api-docs`);
});