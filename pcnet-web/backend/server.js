const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const authRoutes = require('./src/routes/authRoutes');
const laudoRoutes = require('./src/routes/laudoRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./src/config/swagger');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '1mb' }));
const origensPermitidas = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(v=>v.trim()).filter(Boolean);
app.use(cors({ origin(origin, cb){ if(!origin || origensPermitidas.includes(origin)) return cb(null,true); return cb(new Error('Origem não autorizada pelo CORS.')); }, credentials:true }));
app.get('/health', (_req,res)=>res.status(200).json({status:'ok',modulo:'laudos'}));
app.use('/api', authRoutes);
app.use('/api', laudoRoutes);
app.use('/api', adminRoutes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use((_req,res)=>res.status(404).json({erro:'Rota não encontrada.'}));
app.use((err,req,res,_next)=>{
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`,err);
  if(err instanceof multer.MulterError){ if(err.code==='LIMIT_FILE_SIZE') return res.status(413).json({erro:'Arquivo maior que o limite permitido.'}); return res.status(400).json({erro:'Upload inválido.',codigo:err.code}); }
  if(err.message==='Origem não autorizada pelo CORS.') return res.status(403).json({erro:err.message});
  return res.status(500).json({erro:'Erro interno no servidor.'});
});
const PORT=Number(process.env.PORT||3000);
const server=app.listen(PORT,()=>{console.log(`Nexus Laudos rodando na porta ${PORT}`);console.log(`Documentação Swagger: http://localhost:${PORT}/api-docs`);});
let encerrando=false;
function encerrar(signal){ if(encerrando)return; encerrando=true; console.log(`${signal} recebido. Encerrando o Nexus...`); const t=setTimeout(()=>process.exit(1),8000); t.unref(); server.close(err=>{clearTimeout(t); if(err){console.error(err);process.exit(1);} process.exit(0);}); }
process.once('SIGTERM',()=>encerrar('SIGTERM')); process.once('SIGINT',()=>encerrar('SIGINT'));
module.exports={app,server};
