const path = require('path');
const fs = require('fs');

require('dotenv').config({
    path: path.resolve(__dirname, '../.env')
});

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

app.use(
    express.json({
        limit: process.env.JSON_BODY_LIMIT || '1mb'
    })
);

/*
 * Origens permitidas.
 *
 * Em desenvolvimento:
 *   http://localhost:5173
 *
 * No Render:
 *   https://<nome>.onrender.com
 *
 * RENDER_EXTERNAL_HOSTNAME é fornecido automaticamente
 * pelo próprio Render.
 */
const origensPermitidas = new Set(
    (
        process.env.CORS_ORIGIN ||
        'http://localhost:5173,http://127.0.0.1:5173'
    )
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
);

if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    origensPermitidas.add(
        `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
    );
}

app.use(
    cors({
        origin(origin, cb) {
            // chamadas sem Origin, curl, mesma aplicação etc.
            if (!origin) {
                return cb(null, true);
            }

            if (origensPermitidas.has(origin)) {
                return cb(null, true);
            }

            return cb(
                new Error('Origem não autorizada pelo CORS.')
            );
        },

        credentials: true
    })
);


/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get('/health', (_req, res) => {
    res.status(200).json({
        status: 'ok',
        modulo: 'laudos'
    });
});


/* =========================================================
   API
   ========================================================= */

app.use('/api', authRoutes);
app.use('/api', laudoRoutes);
app.use('/api', adminRoutes);


/* =========================================================
   SWAGGER
   ========================================================= */

if (
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_SWAGGER === 'true'
) {
    app.use(
        '/api-docs',
        swaggerUi.serve,
        swaggerUi.setup(swaggerDocument)
    );
}


/* =========================================================
   FRONTEND REACT / VITE
   ========================================================= */

const frontendDist = path.resolve(
    __dirname,
    '../frontend/dist'
);

const frontendIndex = path.join(
    frontendDist,
    'index.html'
);

if (fs.existsSync(frontendIndex)) {
    app.use(
        express.static(frontendDist, {
            index: false
        })
    );

    /*
     * SPA fallback.
     *
     * /login
     * /admin
     * /laudos
     * etc.
     *
     * retornam o React.
     */
    app.use((req, res, next) => {
        if (req.method !== 'GET') {
            return next();
        }

        if (
            req.path.startsWith('/api') ||
            req.path.startsWith('/health') ||
            req.path.startsWith('/api-docs')
        ) {
            return next();
        }

        if (!req.accepts('html')) {
            return next();
        }

        return res.sendFile(frontendIndex);
    });
}


/* =========================================================
   404
   ========================================================= */

app.use((_req, res) => {
    res.status(404).json({
        erro: 'Rota não encontrada.'
    });
});


/* =========================================================
   ERROS
   ========================================================= */

app.use((err, req, res, _next) => {
    console.error(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}:`,
        err
    );

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                erro: 'Arquivo maior que o limite permitido.'
            });
        }

        return res.status(400).json({
            erro: 'Upload inválido.',
            codigo: err.code
        });
    }

    if (
        err.message ===
        'Origem não autorizada pelo CORS.'
    ) {
        return res.status(403).json({
            erro: err.message
        });
    }

    return res.status(500).json({
        erro: 'Erro interno no servidor.'
    });
});


/* =========================================================
   SERVER
   ========================================================= */

const PORT = Number(
    process.env.PORT || 3000
);

const server = app.listen(
    PORT,
    '0.0.0.0',
    () => {
        console.log(
            `Nexus Laudos rodando na porta ${PORT}`
        );

        console.log(
            `Ambiente: ${process.env.NODE_ENV || 'development'}`
        );

        if (process.env.RENDER_EXTERNAL_HOSTNAME) {
            console.log(
                `Nexus Web: https://${process.env.RENDER_EXTERNAL_HOSTNAME}`
            );
        }
    }
);


/* =========================================================
   SHUTDOWN
   ========================================================= */

let encerrando = false;

function encerrar(signal) {
    if (encerrando) return;

    encerrando = true;

    console.log(
        `${signal} recebido. Encerrando o Nexus...`
    );

    const timer = setTimeout(
        () => process.exit(1),
        8000
    );

    timer.unref();

    server.close(err => {
        clearTimeout(timer);

        if (err) {
            console.error(err);
            process.exit(1);
        }

        process.exit(0);
    });
}

process.once(
    'SIGTERM',
    () => encerrar('SIGTERM')
);

process.once(
    'SIGINT',
    () => encerrar('SIGINT')
);

module.exports = {
    app,
    server
};