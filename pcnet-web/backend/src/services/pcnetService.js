const puppeteer = require('puppeteer');
const db = require('../config/database');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sessoesPendentes = new Map();
const sessoesAtivas = new Map();

async function iniciarLoginPCNet(cpf, senha, tipoEmail = 'principal') {
    const browser = await puppeteer.launch({
        browser: 'firefox', // MUDANÇA AQUI: "browser" no lugar de "product"
        headless: false, 
        defaultViewport: null,
        args: [
            '--start-maximized',
            // Caso o Puppeteer teime em abrir o Chromium, essas flags matam o gerenciador de senhas nativo:
            '--password-store=basic', 
            '--disable-save-password-bubble',
            '--disable-features=PasswordLeakDetection,AutofillServerCommunication'
        ],
        // Caso ele abra o Firefox corretamente, desativa o gerenciador nativo da Mozilla:
        extraPrefsFirefox: {
            'signon.rememberSignons': false,
            'signon.autofillForms': false,
            'signon.management.page.breach-alerts.enabled': false,
            'security.insecure_password.ui.enabled': false
        }
    });

    const page = await browser.newPage();

    page.on('dialog', async dialog => {
        await dialog.dismiss(); // ou dialog.accept()
    });

    try {
        await page.goto('https://www.pcnet.mg.gov.br/APP/', { waitUntil: 'networkidle2' });

        // 1. Preenche CPF e Senha
        await page.waitForSelector('input[name="j_username"]', { timeout: 10000 });
        await page.type('input[name="j_username"]', cpf);
        await page.type('input[name="j_password"]', senha);

        // 2. Submete o formulário de login
        await page.keyboard.press('Enter');

        // 3. Aguarda a tela de seleção de e-mail do 2FA carregar
        console.log('Aguardando os botões de e-mail aparecerem no HTML...');
        
        await page.waitForFunction(() => {
            // Busca diretamente pelas tags <span> que tenham a classe z-label (como no seu print)
            const spans = Array.from(document.querySelectorAll('span.z-label'));
            return spans.some(span => span.textContent && span.textContent.includes('E-mail'));
        }, { timeout: 30000 });

        // 4. Identifica e clica no e-mail desejado
        const textoBusca = tipoEmail.toLowerCase() === 'secundario' ? 'E-mail Secundário' : 'E-mail Principal';
        console.log(`Procurando e clicando na opção: "${textoBusca}"`);

        const clicouComSucesso = await page.evaluate((busca) => {
            const spans = Array.from(document.querySelectorAll('span.z-label'));
            
            // Encontra o span, limpando os espaços invisíveis antes e depois do texto com .trim()
            const spanEmail = spans.find(el => el.textContent && el.textContent.trim().includes(busca));
            
            if (spanEmail) {
                // Pega a caixa "pai" (a div class="z-vlayout-inner") que o seu print mostrou, e clica nela!
                const divClicavel = spanEmail.closest('.z-vlayout-inner') || spanEmail.parentElement || spanEmail;
                divClicavel.click();
                return true;
            }
            return false;
        }, textoBusca);

        if (!clicouComSucesso) {
            throw new Error(`Não foi possível clicar na opção "${textoBusca}". Elemento não encontrado.`);
        }

        // 5. Aguarda o PCNet processar o envio do código
        await new Promise(r => setTimeout(r, 4000));

        sessoesPendentes.set(cpf, { browser, page, tipoEmail });

        return { 
            status: 'REQUER_2FA', 
            mensagem: `Canal (${textoBusca}) selecionado com sucesso! O código de 2FA foi enviado.` 
        };

    } catch (error) {
        await browser.close();
        throw new Error('Falha no processo inicial do PCNet: ' + error.message);
    }
}

async function confirmarToken2FA(cpf, token) {
    const sessao = sessoesPendentes.get(cpf);
    if (!sessao) {
        throw new Error('Nenhuma sessão pendente de 2FA encontrada para este CPF.');
    }

    const { browser, page } = sessao;

    try {
        console.log('Aguardando as caixinhas do token carregarem...');
        
        await page.waitForSelector('input.code-input', { timeout: 15000 });
        const inputsToken = await page.$$('input.code-input');
        
        if (inputsToken.length === 6) {
            console.log('Digitando o token nas caixas...');
            for (let i = 0; i < token.length; i++) {
                await inputsToken[i].type(token[i]);
                await new Promise(r => setTimeout(r, 100)); 
            }
            await inputsToken[5].press('Enter');
        } else {
            throw new Error(`Encontradas ${inputsToken.length} caixas, mas eram esperadas 6.`);
        }

        console.log('Procurando o botão Verificar para clicar...');
        
        const botaoSelector = await page.evaluate(() => {
            const botoes = Array.from(document.querySelectorAll('button.z-button'));
            const btnVerificar = botoes.find(b => b.textContent && b.textContent.includes('erificar'));
            
            if (btnVerificar) {
                if (btnVerificar.id) {
                    return '#' + btnVerificar.id;
                } else {
                    btnVerificar.setAttribute('data-robo-clique', 'aqui');
                    return 'button[data-robo-clique="aqui"]';
                }
            }
            return null;
        });

        if (botaoSelector) {
            console.log(`Botão encontrado! Selector: ${botaoSelector}. Clicando...`);
            await page.click(botaoSelector);
        } else {
            console.log('Aviso: Botão "Verificar" não encontrado pelo seletor. Tentando avançar pelo Enter...');
        }

        console.log('Aguardando validação e carregamento da página principal...');
        
        try {
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                page.waitForSelector('input.code-input', { hidden: true, timeout: 15000 })
            ]);
        } catch (error) {
            throw new Error('O botão VERIFICAR não funcionou ou o token estava incorreto. O site travou na mesma tela.');
        }

        await new Promise(r => setTimeout(r, 3000));
        
        const urlAtual = await page.url();
        if (urlAtual.includes('validacao_duas_etapas')) {
            throw new Error('Falso positivo evitado: O robô continuou preso na tela de 2FA.');
        }

        console.log('Sucesso comprovado! Sessão autenticada mantida ativa em memória.');

        // Salva a sessão ativa em memória (NÃO FECHA O BROWSER)
        sessoesAtivas.set(cpf, { browser, page });

        // Remove das pendências
        sessoesPendentes.delete(cpf);

        return { 
            status: 'SUCESSO', 
            mensagem: 'Login validado com sucesso real! Sessão mantida ativa em segundo plano.' 
        };

    } catch (error) {
        if (!page.isClosed()) {
            await browser.close();
        }
        sessoesPendentes.delete(cpf);
        throw new Error('Erro ao validar o token 2FA: ' + error.message);
    }
}

async function acessarAceiteRequisicoes(cpf, codigoUnidade = 'C0053') {
    const sessaoAtiva = sessoesAtivas.get(cpf);

    if (!sessaoAtiva) {
        throw new Error('Nenhuma sessão ativa encontrada para este CPF na memória. Faça o login e o 2FA primeiro.');
    }

    const { page, browser } = sessaoAtiva;

    try {
        if (page.isClosed()) {
            sessoesAtivas.delete(cpf);
            throw new Error('A janela do navegador foi fechada. Faça o login novamente.');
        }

        console.log('Navegando para a página principal do PCNet...');
        await page.goto('https://www.pcnet.mg.gov.br/APP/', { waitUntil: 'networkidle2' });

        const urlAtual = page.url();
        if (urlAtual.includes('loginVM.zul') || urlAtual.includes('seg.id')) {
            sessoesAtivas.delete(cpf);
            throw new Error('A sessão expirou. Faça o login novamente.');
        }

        // ID CORRIGIDO: unidadeSelecionada (singular)
        const temSeletorUnidade = await page.$('select#unidadeSelecionada');
        
        if (temSeletorUnidade) {
            console.log(`Selecionando a unidade: ${codigoUnidade}...`);
            
            // Seleciona a unidade no dropdown correto
            await page.select('select#unidadeSelecionada', codigoUnidade);
            
            // Clica no botão Confirmar
            await page.evaluate(() => {
                const botoes = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
                const btnConfirmar = botoes.find(b => (b.textContent && b.textContent.includes('Confirmar')) || b.value === 'Confirmar');
                if (btnConfirmar) {
                    btnConfirmar.click();
                }
            });

            console.log('Aguardando a home da unidade carregar...');
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 2000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 3000));
        }

        console.log('Home carregada com sucesso! Acionando o atalho CTRL+F1...');
        
        // Dispara o atalho para ir direto à tela de requisições pendentes
        await page.keyboard.down('Control');
        await page.keyboard.press('F1');
        await page.keyboard.up('Control');

        await new Promise(r => setTimeout(r, 4000));
        console.log('Sucesso! Estamos na tela de Aceite de Requisição.');

        return { status: 'SUCESSO', mensagem: 'Unidade selecionada e tela de aceite acessada com sucesso!' };

    } catch (error) {
        throw new Error('Erro ao navegar para as requisições: ' + error.message);
    }
}

async function obterCsvRequisicoes(cpf, codigoUnidade = 'C0053') {
    // 1. Acessa a tela de requisições pendentes
    await acessarAceiteRequisicoes(cpf, codigoUnidade);

    const sessaoAtiva = sessoesAtivas.get(cpf);
    if (!sessaoAtiva) {
        throw new Error('Sessão perdida após acessar as requisições.');
    }

    const { page } = sessaoAtiva;

    try {
        console.log('Disparando a pesquisa (F9)...');
        const botaoPesquisar = await page.$('input#btnPesquisar');
        if (botaoPesquisar) {
            await botaoPesquisar.click();
        } else {
            await page.keyboard.press('F9');
        }

        // ESPERA SEGURA: Damos 8 segundos para o servidor do PCNet processar e listar TODAS as requisições
        console.log('Aguardando o servidor processar todas as requisições...');
        await new Promise(r => setTimeout(r, 8000));

        console.log('Localizando e clicando em "Exportar CSV"...');
        const clicouExportar = await page.evaluate(() => {
            const botoes = Array.from(document.querySelectorAll('button, input[type="button"]'));
            const btnCsv = botoes.find(b => (b.textContent && b.textContent.includes('Exportar CSV')) || (b.value && b.value.includes('Exportar CSV')));
            if (btnCsv) {
                btnCsv.click();
                return true;
            }
            return false;
        });

        if (!clicouExportar) {
            throw new Error('O botão "Exportar CSV" não foi encontrado na tela.');
        }

        // Pressiona Enter caso o Firefox abra a janela nativa de confirmação de salvamento
        await new Promise(r => setTimeout(r, 1500));
        await page.keyboard.press('Enter');

        // Aponta diretamente para a pasta Downloads oficial do Windows do seu PC
        const downloadPath = path.join(os.homedir(), 'Downloads');

        // Monitora a pasta do Windows para pegar o arquivo CSV recém-baixado
        console.log('Aguardando o arquivo aparecer na pasta Downloads do Windows...');
        let arquivoEncontrado = null;
        
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 1000));
            if (fs.existsSync(downloadPath)) {
                const arquivos = fs.readdirSync(downloadPath);
                // Filtra arquivos temporários (.part, .tmp) e pega os CSVs/XLS mais recentes criados nos últimos segundos
                const csvs = arquivos.filter(f => (f.endsWith('.csv') || f.endsWith('.xls') || f.endsWith('.ods')) && !f.endsWith('.part') && !f.endsWith('.tmp'));
                
                if (csvs.length > 0) {
                    csvs.sort((a, b) => {
                        return fs.statSync(path.join(downloadPath, b)).mtimeMs - fs.statSync(path.join(downloadPath, a)).mtimeMs;
                    });
                    
                    const arquivoMaisRecente = path.join(downloadPath, csvs[0]);
                    // Garante que o arquivo foi modificado nos últimos 15 segundos (para não pegar um CSV antigo)
                    const stats = fs.statSync(arquivoMaisRecente);
                    const agora = new Date().getTime();
                    if ((agora - stats.mtimeMs) < 15000) {
                        arquivoEncontrado = arquivoMaisRecente;
                        break;
                    }
                }
            }
        }

        if (!arquivoEncontrado) {
            throw new Error('O arquivo CSV não foi baixado pelo navegador a tempo.');
        }

        console.log('Arquivo capturado com sucesso:', arquivoEncontrado);
        return arquivoEncontrado;

    } catch (error) {
        throw new Error('Erro ao exportar o CSV: ' + error.message);
    }
}

async function movimentarFav(cpf, codigoUnidade, numeroFav, novoLacre = null) {
    await acessarAceiteRequisicoes(cpf, codigoUnidade);

    const sessaoAtiva = sessoesAtivas.get(cpf);
    if (!sessaoAtiva) throw new Error('Sessão perdida. Faça o login novamente.');

    const { page, browser } = sessaoAtiva;
    let popupFavPage = null;
    let popupCustodiaPage = null;

    try {
        console.log('Abrindo a tela de Cadeia de Custódia...');
        let pagesAntigas = await browser.pages();

        // 1. Clica no ícone na tela principal
        const clicouCustodia = await page.evaluate(() => {
            const icone = document.querySelector('img[src*="ico_cadeia_custodia.png"]');
            if (icone) {
                const link = icone.closest('a');
                if (link) {
                    link.click();
                    return true;
                }
            }
            return false;
        });

        if (!clicouCustodia) throw new Error('Ícone de Cadeia de Custódia não encontrado na tela principal.');

        // 2. Captura a 1ª Pop-up (Movimentação FAV) com timeout seguro
        console.log('Aguardando a primeira janela pop-up abrir...');
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const pagesAtuais = await browser.pages();
            if (pagesAtuais.length > pagesAntigas.length) {
                popupFavPage = pagesAtuais.find(p => !pagesAntigas.includes(p));
                if (popupFavPage) break;
            }
        }

        if (!popupFavPage) throw new Error('O pop-up de Movimentação FAV não abriu dentro do tempo limite.');
        console.log('Pop-up FAV capturado.');

        // Garante que a página está fechada caso ocorra exceção fatal
        popupFavPage.on('close', () => { popupFavPage = null; });

        // 3. Preenche a FAV e pesquisa
        await popupFavPage.waitForSelector('#numeroDaFAV_Arg', { timeout: 20000 });
        console.log(`Preenchendo a FAV: ${numeroFav}...`);
        await popupFavPage.click('#numeroDaFAV_Arg', { clickCount: 3 });
        await popupFavPage.keyboard.press('Backspace');
        await popupFavPage.type('#numeroDaFAV_Arg', String(numeroFav));

        console.log('Pesquisando a FAV...');
        await popupFavPage.click('#btnPesquisar');
        await new Promise(r => setTimeout(r, 4000));

        // 4. Marca o checkbox na tabela
        console.log('Marcando o item na tabela...');
        const selecionou = await popupFavPage.evaluate((favAlvo) => {
            const linhas = Array.from(document.querySelectorAll('tr'));
            for (const linha of linhas) {
                if (linha.textContent.includes(String(favAlvo))) {
                    const cb = linha.querySelector('input[type="checkbox"][name*="flagSelecionada"]');
                    if (cb) {
                        cb.click();
                        return true;
                    }
                }
            }
            return false;
        }, numeroFav);

        if (!selecionou) throw new Error(`Item da FAV ${numeroFav} não encontrado na tabela de resultados.`);
        await new Promise(r => setTimeout(r, 1500));

        pagesAntigas = await browser.pages();

        // 5. Clica no botão "Sob Custódia"
        console.log('Clicando em "Sob Custódia"...');
        await popupFavPage.evaluate(() => {
            const btn = document.querySelector('input[value="Sob Custódia"]') || document.getElementById('botao_menu');
            if (btn) btn.click();
        });

        // 6. Captura a 2ª Pop-up (A aba de Sob Custódia)
        console.log('Aguardando a janela pop-up de Sob Custódia abrir...');
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const pagesAtuais = await browser.pages();
            if (pagesAtuais.length > pagesAntigas.length) {
                popupCustodiaPage = pagesAtuais.find(p => !pagesAntigas.includes(p));
                if (popupCustodiaPage) break;
            }
        }

        if (!popupCustodiaPage) throw new Error('A janela pop-up de Sob Custódia não abriu.');
        console.log('Pop-up de Sob Custódia capturado com sucesso!');

        // 7. Aguarda o #finalidade2 carregar na aba de custódia
        await popupCustodiaPage.waitForSelector('#finalidade2', { timeout: 15000 });

        // 8. Preenche "Exame Pericial" e o Lacre
        console.log('Preenchendo finalidade e lacre...');
        await popupCustodiaPage.evaluate((lacreInfo) => {
            const radioPericial = document.getElementById('finalidade2');
            if (radioPericial) {
                radioPericial.checked = true;
                radioPericial.click();
                if (typeof campoAlterado === 'function') campoAlterado();
            }

            if (lacreInfo && lacreInfo.trim() !== '') {
                const radioSim = document.getElementById('houveRompimentoLacre0');
                if (radioSim) {
                    radioSim.click();
                    if (typeof habilitarDesabilitarCampoNovoInvolucro === 'function') {
                        habilitarDesabilitarCampoNovoInvolucro(radioSim);
                    }
                }
                const inputLacre = document.getElementById('involucroNumero');
                if (inputLacre) {
                    inputLacre.value = lacreInfo;
                    inputLacre.dispatchEvent(new Event('input', { bubbles: true }));
                    inputLacre.dispatchEvent(new Event('change', { bubbles: true }));
                }
            } else {
                const radioNao = document.getElementById('houveRompimentoLacre1');
                if (radioNao) {
                    radioNao.click();
                    if (typeof habilitarDesabilitarCampoNovoInvolucro === 'function') {
                        habilitarDesabilitarCampoNovoInvolucro(radioNao);
                    }
                }
            }
        }, novoLacre);

        // 9. Clica em SALVAR e valida se o sistema recusou por regra de negócio
        console.log('Salvando a movimentação...');
        await new Promise(r => setTimeout(r, 1500));
        await popupCustodiaPage.click('#btnGrava');
        await new Promise(r => setTimeout(r, 4000));

        const mensagemErroSistema = await popupCustodiaPage.evaluate(() => {
            const elemErro = document.querySelector('.msg_erro, td.msg_erro, div.msg_erro');
            return elemErro && elemErro.textContent.trim() !== '' ? elemErro.textContent.trim() : null;
        });

        if (mensagemErroSistema) {
            throw new Error(`Sistema recusou a operação: ${mensagemErroSistema}`);
        }

        // 10. Fecha a aba de Custódia com segurança
        try {
            await popupCustodiaPage.click('#fechar_id');
        } catch (e) {
            if (!popupCustodiaPage.isClosed()) await popupCustodiaPage.close();
        }
        await new Promise(r => setTimeout(r, 2000));

        // 11. Limpa e fecha a aba principal da FAV
        if (popupFavPage && !popupFavPage.isClosed()) {
            await popupFavPage.click('#btnLimpar');
            await new Promise(r => setTimeout(r, 1500));
            await popupFavPage.click('#fechar_id');
        }

        console.log('Fluxo completo da FAV executado com sucesso!');
        return { status: 'SUCESSO', mensagem: `FAV ${numeroFav} movimentada para Sob Custódia com sucesso!` };

    } catch (error) {
        // Garante limpeza de abas órfãs em caso de exceção
        try { if (popupCustodiaPage && !popupCustodiaPage.isClosed()) await popupCustodiaPage.close(); } catch (err) {}
        try { if (popupFavPage && !popupFavPage.isClosed()) await popupFavPage.close(); } catch (err) {}

        throw new Error('Erro ao movimentar a FAV: ' + error.message);
    }
}

async function movimentarFavsLote(cpf, codigoUnidade, listaFavs) {
    await acessarAceiteRequisicoes(cpf, codigoUnidade);

    const sessaoAtiva = sessoesAtivas.get(cpf);
    if (!sessaoAtiva) throw new Error('Sessão perdida. Faça o login novamente.');

    const { page, browser } = sessaoAtiva;
    const resultados = [];
    let popupFavPage = null;

    try {
        console.log('Abrindo a tela de Cadeia de Custódia...');
        let pagesAntigas = await browser.pages();

        // 1. Clica no ícone na tela principal
        const clicouCustodia = await page.evaluate(() => {
            const icone = document.querySelector('img[src*="ico_cadeia_custodia.png"]');
            if (icone) {
                const link = icone.closest('a');
                if (link) {
                    link.click();
                    return true;
                }
            }
            return false;
        });

        if (!clicouCustodia) throw new Error('Ícone de Cadeia de Custódia não encontrado.');

        // Captura o pop-up principal de FAV
        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const pagesAtuais = await browser.pages();
            if (pagesAtuais.length > pagesAntigas.length) {
                popupFavPage = pagesAtuais.find(p => !pagesAntigas.includes(p));
                if (popupFavPage) break;
            }
        }

        if (!popupFavPage) throw new Error('O pop-up de Movimentação FAV não abriu.');

        // Loop para processar cada FAV da lista
        for (const item of listaFavs) {
            const { numeroFav, novoLacre } = item;
            console.log(`\n--- Processando FAV: ${numeroFav} ---`);
            let popupCustodiaPage = null;

            try {
                await popupFavPage.waitForSelector('#btnLimpar', { visible: true, timeout: 15000 });

                // Limpa a tela antes de cada busca
                await popupFavPage.click('#btnLimpar');
                await new Promise(r => setTimeout(r, 1500));

                // Digita e pesquisa
                await popupFavPage.waitForSelector('#numeroDaFAV_Arg', { visible: true, timeout: 15000 });
                await popupFavPage.click('#numeroDaFAV_Arg', { clickCount: 3 });
                await popupFavPage.keyboard.press('Backspace');
                await popupFavPage.type('#numeroDaFAV_Arg', String(numeroFav));
                
                await popupFavPage.click('#btnPesquisar');
                await new Promise(r => setTimeout(r, 4000));

                // Valida e marca o checkbox
                const selecionou = await popupFavPage.evaluate((favAlvo) => {
                    const linhas = Array.from(document.querySelectorAll('tr'));
                    for (const linha of linhas) {
                        const textoLinha = linha.textContent || '';
                        if (textoLinha.includes(String(favAlvo))) {
                            const cb = linha.querySelector('input[type="checkbox"][name*="flagSelecionada"]');
                            if (cb) {
                                cb.click();
                                return true;
                            }
                        }
                    }
                    return false;
                }, numeroFav);

                if (!selecionou) {
                    resultados.push({ fav: numeroFav, status: 'ERRO', mensagem: 'Item não encontrado na tabela' });
                    continue;
                }

                await new Promise(r => setTimeout(r, 1500));
                let pagesAntesCustodia = await browser.pages();

                // Clica em "Sob Custódia"
                await popupFavPage.evaluate(() => {
                    const btn = document.querySelector('input[value="Sob Custódia"]') || document.getElementById('botao_menu');
                    if (btn) btn.click();
                });

                // Captura a aba de custódia
                for (let i = 0; i < 15; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    const pagesAtuais = await browser.pages();
                    if (pagesAtuais.length > pagesAntesCustodia.length) {
                        popupCustodiaPage = pagesAtuais.find(p => !pagesAntesCustodia.includes(p));
                        if (popupCustodiaPage) break;
                    }
                }

                if (!popupCustodiaPage) throw new Error('A aba de Sob Custódia não abriu.');

                // Preenche os campos na aba de custódia
                await popupCustodiaPage.waitForSelector('#finalidade2', { timeout: 15000 });
                await popupCustodiaPage.evaluate((lacreInfo) => {
                    const radioPericial = document.getElementById('finalidade2');
                    if (radioPericial) {
                        radioPericial.checked = true;
                        radioPericial.click();
                        if (typeof campoAlterado === 'function') campoAlterado();
                    }

                    if (lacreInfo && lacreInfo.trim() !== '') {
                        const radioSim = document.getElementById('houveRompimentoLacre0');
                        if (radioSim) {
                            radioSim.click();
                            if (typeof habilitarDesabilitarCampNovoInvolucro === 'function') {
                                habilitarDesabilitarCampNovoInvolucro(radioSim);
                            }
                        }
                        const inputLacre = document.getElementById('involucroNumero');
                        if (inputLacre) {
                            inputLacre.value = lacreInfo;
                            inputLacre.dispatchEvent(new Event('input', { bubbles: true }));
                            inputLacre.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    } else {
                        const radioNao = document.getElementById('houveRompimentoLacre1');
                        if (radioNao) {
                            radioNao.click();
                            if (typeof habilitarDesabilitarCampNovoInvolucro === 'function') {
                                habilitarDesabilitarCampNovoInvolucro(radioNao);
                            }
                        }
                    }
                }, novoLacre);

                // Salva a movimentação e checa erros do sistema
                await new Promise(r => setTimeout(r, 1000));
                await popupCustodiaPage.click('#btnGrava');
                await new Promise(r => setTimeout(r, 3000));

                const mensagemErroSistema = await popupCustodiaPage.evaluate(() => {
                    const elemErro = document.querySelector('.msg_erro, td.msg_erro, div.msg_erro');
                    return elemErro && elemErro.textContent.trim() !== '' ? elemErro.textContent.trim() : null;
                });

                if (mensagemErroSistema) {
                    throw new Error(`Sistema recusou: ${mensagemErroSistema}`);
                }

                // Fecha a aba de custódia
                try {
                    await popupCustodiaPage.click('#fechar_id');
                } catch (e) {
                    if (!popupCustodiaPage.isClosed()) await popupCustodiaPage.close();
                }
                await new Promise(r => setTimeout(r, 2000));

                resultados.push({ fav: numeroFav, status: 'SUCESSO' });
                console.log(`FAV ${numeroFav} processada com sucesso.`);

            } catch (errItem) {
                console.error(`Erro na FAV ${numeroFav}:`, errItem.message);
                resultados.push({ fav: numeroFav, status: 'ERRO', mensagem: errItem.message });

                // Se der erro nesta FAV do lote, garante que fecha a aba de custódia caso tenha ficado aberta
                try {
                    if (popupCustodiaPage && !popupCustodiaPage.isClosed()) {
                        await popupCustodiaPage.close();
                    }
                } catch (eClose) {}
            }
        }

        // Encerramento final seguro da janela principal de FAV
        try {
            if (popupFavPage && !popupFavPage.isClosed()) {
                await popupFavPage.click('#btnLimpar');
                await new Promise(r => setTimeout(r, 1000));
                await popupFavPage.click('#fechar_id');
            }
        } catch (eEnd) {
            if (popupFavPage && !popupFavPage.isClosed()) await popupFavPage.close();
        }

        return { status: 'CONCLUIDO', detalhes: resultados };

    } catch (error) {
        try {
            if (popupFavPage && !popupFavPage.isClosed()) await popupFavPage.close();
        } catch (e) {}

        throw new Error('Erro geral no lote de FAVs: ' + error.message);
    }
}

module.exports = {
    iniciarLoginPCNet,
    confirmarToken2FA,
    acessarAceiteRequisicoes,
    obterCsvRequisicoes,
    movimentarFav,
    movimentarFavsLote
};