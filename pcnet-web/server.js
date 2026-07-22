const express = require('express');
const cors = require('cors');
const { firefox } = require('playwright');

const app = express();
app.use(express.json());
app.use(cors());

let browserInstance = null;
let pageInstance = null;

// 1. ETAPA DE LOGIN (Envia CPF/Senha e clica no e-mail)
app.post('/api/login', async (req, res) => {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        return res.status(400).json({ erro: 'Informe o usuário e a senha.' });
    }

    try {
        console.log('🌐 Abrindo o navegador Firefox...');
        browserInstance = await firefox.launch({ headless: true });
        pageInstance = await browserInstance.newPage();

        console.log('🔗 Acessando o PCNet...');
        await pageInstance.goto('https://pcnet.mg.gov.br/');

        console.log('✍️ Preenchendo CPF e Senha...');
        await pageInstance.fill('input[name="j_username"]', usuario);
        await pageInstance.fill('input[name="j_password"]', senha);

        console.log('🖱️ Clicando em ENTRAR...');
        await pageInstance.click('button:has-text("ENTRAR")');

        console.log('📧 Clicando em E-mail Principal...');
        await pageInstance.waitForSelector('text=E-mail Principal', { timeout: 10000 });
        await pageInstance.getByText('E-mail Principal').click();

        await pageInstance.waitForTimeout(2000); 

        res.json({ 
            status: 'AGUARDANDO_TOKEN', 
            mensagem: 'Token disparado para o e-mail. Envie o código na rota /api/token.' 
        });
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ erro: error.message });
    }
});

// 2. ETAPA DO TOKEN (Valida o token e retorna as unidades disponíveis)
app.post('/api/token', async (req, res) => {
    const { token } = req.body;

    if (!pageInstance) {
        return res.status(400).json({ erro: 'Nenhuma sessão ativa. Faça o login primeiro.' });
    }

    try {
        console.log('🔑 Digitando o token:', token);
        const inputs = await pageInstance.$$('.z-textbox, input[type="text"], input:not([type])');
        
        if (inputs.length > 0) {
            await inputs[0].click();
            await pageInstance.keyboard.type(token, { delay: 150 });
        } else {
            await pageInstance.keyboard.type(token, { delay: 150 });
        }

        console.log('🖱️ Clicando em VERIFICAR...');
        await pageInstance.waitForSelector('button:has-text("VERIFICAR")', { timeout: 5000 });
        await pageInstance.click('button:has-text("VERIFICAR")');

        // Aguarda a tela de Unidade Policial carregar
        console.log('⏳ Aguardando tela de Unidade Policial...');
        await pageInstance.waitForSelector('select', { timeout: 15000 });

        // Extrai todas as unidades disponíveis no select do PCNet
        const selectHandle = await pageInstance.$('select');
        const options = await selectHandle.$$('option');

        let unidadesDisponiveis = [];

        for (const option of options) {
            const text = await option.textContent();
            if (text && text.trim() !== '') {
                unidadesDisponiveis.push(text.trim());
            }
        }

        res.json({ 
            status: 'UNIDADES_DISPONIVEIS', 
            mensagem: 'Token validado com sucesso! Escolha a unidade desejada.',
            unidadesDisponiveis 
        });
    } catch (error) {
        console.error('Erro ao validar token:', error);
        res.status(500).json({ erro: error.message });
    }
});

// 3. ETAPA DE SELEÇÃO DE UNIDADE (O usuário escolhe e envia a unidade)
app.post('/api/selecionar-unidade', async (req, res) => {
    const { unidadeDesejada } = req.body;

    if (!pageInstance) {
        return res.status(400).json({ erro: 'Sessão ativa não encontrada.' });
    }

    if (!unidadeDesejada) {
        return res.status(400).json({ erro: 'Informe a unidade desejada.' });
    }

    try {
        console.log(`🏢 Buscando pela unidade: ${unidadeDesejada}`);
        const selectHandle = await pageInstance.$('select');
        const options = await selectHandle.$$('option');

        let unidadeAlvoValue = null;

        for (const option of options) {
            const text = await option.textContent();
            const value = await option.getAttribute('value');
            if (text && text.toUpperCase().includes(unidadeDesejada.toUpperCase())) {
                unidadeAlvoValue = value;
                break;
            }
        }

        if (!unidadeAlvoValue) {
            return res.status(400).json({ erro: `Unidade "${unidadeDesejada}" não foi encontrada no sistema.` });
        }

        await selectHandle.selectOption(unidadeAlvoValue);
        
        console.log('🖱️ Clicando em Confirmar usando o ID do input...');
        // Clica usando o ID exato que você encontrou no HTML
        await pageInstance.click('#botaoSelecionarUnidade');

        res.json({ 
            status: 'SUCESSO', 
            mensagem: `Unidade ${unidadeDesejada} selecionada e confirmada com sucesso!` 
        });
    } catch (error) {
        console.error('Erro ao selecionar unidade:', error);
        res.status(500).json({ erro: error.message });
    }
});

// 4. ETAPA DE EXTRAÇÃO DO CSV (Com correção de codificação para acentos)
app.get('/api/extrair-csv', async (req, res) => {
    if (!pageInstance) {
        return res.status(400).json({ erro: 'Sessão não encontrada. Faça o login primeiro.' });
    }

    try {
        console.log('⌨️ Pressionando CTRL+F1 para ir à tela de requisições...');
        await pageInstance.keyboard.press('Control+F1');

        console.log('🔍 Aguardando o botão de pesquisa carregar...');
        await pageInstance.waitForSelector('#btnPesquisar', { timeout: 10000 });

        console.log('🖱️ Clicando em Pesquisar (#btnPesquisar)...');
        await pageInstance.click('#btnPesquisar');

        await pageInstance.waitForTimeout(3000);

        console.log('📥 Capturando a URL de exportação do botão CSV...');
        const urlExportacao = await pageInstance.$eval('#btVerRequisicao', (el) => {
            const onclickText = el.getAttribute('onclick');
            const match = onclickText.match(/janela\("([^"]+)"/);
            return match ? match[1] : null;
        });

        if (!urlExportacao) {
            return res.status(400).json({ erro: 'Não foi possível extrair a URL de exportação do CSV.' });
        }

        console.log('🌐 Baixando os dados com decodificação Windows-1252...');
        const csvData = await pageInstance.evaluate(async (url) => {
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            // Converte os bytes usando o padrão correto para suportar acentos do PCNet
            const decoder = new TextDecoder('windows-1252');
            return decoder.decode(buffer);
        }, urlExportacao);

        // Define os cabeçalhos garantindo UTF-8 e o BOM do Excel
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="requisicoes_pcnet.csv"');
        
        return res.send('\uFEFF' + csvData);
    } catch (error) {
        console.error('Erro ao extrair CSV:', error);
        res.status(500).json({ erro: error.message });
    }
});

app.listen(3000, () => {
    console.log('🚀 Servidor rodando na porta 3000');
});