const { iniciarLoginPCNet, confirmarToken2FA, acessarAceiteRequisicoes,
     obterCsvRequisicoes, movimentarFav, movimentarFavsLote } = require('../services/pcnetService');
const fs = require('fs');

async function solicitarLogin(req, res) {
    try {
        const { cpf, senha, tipoEmail } = req.body;
        
        if (!cpf || !senha) {
            return res.status(400).json({ erro: 'CPF e senha são obrigatórios.' });
        }

        // Passa o tipoEmail (se não vier nada, o service assume 'principal' por padrão)
        const resultado = await iniciarLoginPCNet(cpf, senha, tipoEmail || 'principal');
        res.json(resultado);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
}

async function enviarToken(req, res) {
    try {
        const { cpf, token } = req.body;
        if (!cpf || !token) {
            return res.status(400).json({ erro: 'CPF e o token são obrigatórios.' });
        }
        const resultado = await confirmarToken2FA(cpf, token);
        res.json(resultado);
    } catch (err) {
        res.status(500).json({ erro: err.message });
    }
}

async function acessarRequisicoes(req, res) {
    // Pegamos o CPF e a unidade do corpo da requisição (JSON)
    const { cpf, codigoUnidade } = req.body; 

    if (!cpf || !codigoUnidade) {
        return res.status(400).json({ erro: 'CPF e código da unidade são obrigatórios.' });
    }

    try {
        console.log(`Iniciando navegação para o CPF: ${cpf}, Unidade: ${codigoUnidade}`);
        
        // Dispara o script do Puppeteer
        const resultado = await acessarAceiteRequisicoes(cpf, codigoUnidade);
        
        return res.status(200).json(resultado);
    } catch (error) {
        console.error('Erro na rota de acessar requisições:', error);
        return res.status(500).json({ erro: error.message });
    }
}

async function exportarCsv(req, res) {
    try {
        const { cpf, codigoUnidade } = req.body;

        if (!cpf) {
            return res.status(400).json({ erro: 'O CPF é obrigatório.' });
        }

        console.log(`Iniciando exportação de CSV para o CPF: ${cpf}...`);
        
        // Pega o caminho do arquivo baixado pelo service
        const caminhoArquivo = await obterCsvRequisicoes(cpf, codigoUnidade || 'C0053');

        // Envia o arquivo para o cliente e define o callback de limpeza
        return res.download(caminhoArquivo, (err) => {
            if (err) {
                console.error('Erro ao enviar o arquivo para o cliente:', err);
            }

            // LIMPEZA AUTOMÁTICA: Apaga o arquivo do servidor assim que o envio termina (com sucesso ou erro)
            try {
                if (fs.existsSync(caminhoArquivo)) {
                    fs.unlinkSync(caminhoArquivo);
                    console.log('Arquivo temporário limpo com sucesso do servidor.');
                }
            } catch (cleanupErr) {
                console.error('Erro ao tentar apagar o arquivo temporário:', cleanupErr);
            }
        });

    } catch (error) {
        console.error('Erro ao processar exportação de CSV:', error.message);
        return res.status(400).json({ erro: error.message });
    }
}

async function movimentarFavRoute(req, res) {
    try {
        const { cpf, codigoUnidade, numeroFav, novoLacre } = req.body;

        // Validações básicas de entrada
        if (!cpf) {
            return res.status(400).json({ erro: 'O campo "cpf" é obrigatório.' });
        }
        if (!numeroFav) {
            return res.status(400).json({ erro: 'O campo "numeroFav" é obrigatório.' });
        }

        console.log(`Iniciando movimentação da FAV ${numeroFav} para o CPF: ${cpf}...`);
        
        // Chama a função do service que criamos
        const resultado = await movimentarFav(
            cpf, 
            codigoUnidade || 'C0053', 
            numeroFav, 
            novoLacre
        );

        return res.status(200).json(resultado);

    } catch (error) {
        console.error('Erro ao processar movimentação da FAV:', error.message);
        return res.status(500).json({ erro: error.message });
    }
}

async function processarMovimentacaoLote(req, res) {
    try {
        const { cpf, codigoUnidade, listaFavs } = req.body;

        // Validações básicas de entrada
        if (!cpf || !codigoUnidade || !listaFavs || !Array.isArray(listaFavs)) {
            return res.status(400).json({
                status: 'ERRO',
                mensagem: 'Parâmetros inválidos. Envie "cpf", "codigoUnidade" e uma "listaFavs" (array).'
            });
        }

        console.log(`Iniciando lote de movimentação para o CPF: ${cpf}, Unidade: ${codigoUnidade}`);

        // Chama a função robusta em lote do service
        const resultado = await movimentarFavsLote(cpf, codigoUnidade, listaFavs);

        return res.status(200).json(resultado);

    } catch (error) {
        console.error('Erro no controller de movimentação:', error.message);
        return res.status(500).json({
            status: 'ERRO',
            mensagem: error.message
        });
    }
}

module.exports = { solicitarLogin, enviarToken, acessarRequisicoes, 
    exportarCsv, movimentarFavRoute, processarMovimentacaoLote};