const express = require('express');
const cors = require('cors');
const { firefox } = require('playwright');

const app = express();
app.use(express.json());
app.use(cors());

let browserInstance = null;
let pageInstance = null;

// 1. Rota para iniciar o login
app.post('/api/login', async (req, res) => {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        return res.status(400).json({ erro: 'Informe o usuário e a senha.' });
    }

    try {
        console.log('🌐 Abrindo o navegador Firefox...');
        browserInstance = await firefox.launch({ headless: false });
        pageInstance = await browserInstance.newPage();

        console.log('🔗 Acessando o PCNet...');
        await pageInstance.goto('https://pcnet.mg.gov.br/');

        console.log('✍️ Preenchendo CPF e Senha...');
        await pageInstance.fill('input[name="j_username"]', usuario);
        await pageInstance.fill('input[name="j_password"]', senha);

        console.log('🖱️ Clicando em ENTRAR...');
        await pageInstance.click('button:has-text("ENTRAR")');

        console.log('📧 Clicando em E-mail Principal...');
        // Aguarda o texto aparecer e clica
        await pageInstance.waitForSelector('text=E-mail Principal', { timeout: 10000 });
        await pageInstance.getByText('E-mail Principal').click();

        // IMPORTANTE: Aguarda o pop-up das caixinhas do token aparecer na tela
        console.log('⏳ Aguardando o modal do token abrir...');
        await pageInstance.waitForTimeout(2000); 

        res.json({ 
            status: 'AGUARDANDO_TOKEN', 
            mensagem: 'Token disparado! Verifique seu e-mail e envie o código na rota /api/token.' 
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ erro: error.message });
    }
});

// 2. Rota para digitar o token recebido
app.post('/api/token', async (req, res) => {
    const { token } = req.body;

    if (!pageInstance) {
        return res.status(400).json({ erro: 'Nenhuma sessão ativa. Faça o login primeiro.' });
    }

    try {
        console.log('🔑 Digitando o token:', token);
        
        // Pega todos os inputs visíveis que formam as caixinhas do token
        const inputs = await pageInstance.$$('.z-textbox, input[type="text"], input:not([type])');
        
        if (inputs.length > 0) {
            // Clica na primeira caixinha para focar
            await inputs[0].click();
            // Digita o token com um pequeno atraso entre os números para simular o dígito humano
            await pageInstance.keyboard.type(token, { delay: 150 });
        } else {
            // Plano B: Se não achar os inputs individuais, digita direto no elemento focado
            await pageInstance.keyboard.type(token, { delay: 150 });
        }

        console.log('🖱️ Clicando em VERIFICAR...');
        await pageInstance.waitForSelector('button:has-text("VERIFICAR")', { timeout: 5000 });
        await pageInstance.click('button:has-text("VERIFICAR")');

        res.json({ status: 'SUCESSO', mensagem: 'Token enviado e verificado com sucesso!' });
    } catch (error) {
        console.error('Erro ao enviar token:', error);
        res.status(500).json({ erro: error.message });
    }
});

app.listen(3000, () => {
    console.log('🚀 Servidor rodando na porta 3000');
});