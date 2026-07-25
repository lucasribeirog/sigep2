const express = require('express');
const cors = require('cors');

const authRoutes = require('./src/routes/authRoutes');
const laudoRoutes = require('./src/routes/laudoRoutes');

const app = express();

app.use(express.json());
app.use(cors());

// Registro das Rotas
app.use('/api', authRoutes);
app.use('/api', laudoRoutes);

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na intranet local na porta ${PORT}`);
});