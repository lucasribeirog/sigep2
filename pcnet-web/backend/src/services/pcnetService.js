const puppeteer = require('puppeteer');
const db = require('../config/database');
const fs = require('fs');
const os = require('os');
const path = require('path');

const sessoesPendentes = new Map();
const sessoesAtivas = new Map();

// ============================================================================
// FUNÇÕES AUXILIARES DE BANCO DE DADOS
// ============================================================================
const salvarSessaoDB = (cpf, cookiesJson) => {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT OR REPLACE INTO sessoes_pcnet (cpf_usuario, cookies_json, atualizado_em) VALUES (?, ?, CURRENT_TIMESTAMP)`, 
            [cpf, cookiesJson], 
            function(err) {
                if (err) reject(err);
                else resolve();
            }
        );
    });
};

const buscarSessaoDB = (cpf) => {
    return new Promise((resolve, reject) => {
        db.get(`SELECT cookies_json FROM sessoes_pcnet WHERE cpf_usuario = ?`, [cpf], (err, row) => {
            if (err) reject(err);
            else resolve(row ? row.cookies_json : null);
        });
    });
};

const apagarSessaoDB = (cpf) => {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM sessoes_pcnet WHERE cpf_usuario = ?`, [cpf], function(err) {
            if (err) reject(err);
            else resolve();
        });
    });
};

// ============================================================================
// SISTEMA DE KEEP-ALIVE
// ============================================================================
setInterval(async () => {
    if (sessoesAtivas.size === 0) return;

    console.log('[Keep-Alive] Verificando sessões ativas para envio de pulso de vida...');

    for (const [cpf, sessao] of sessoesAtivas.entries()) {
        try {
            const { page, browser } = sessao;
            if (page && !page.isClosed()) {
                const urlAtual = page.url();
                
                if (urlAtual.includes('loginVM.zul') || urlAtual.includes('seg.id')) {
                    console.log(`[Keep-Alive] ALERTA: A sessão do CPF ${cpf} expirou no servidor. Fechando aba zumbi...`);
                    await browser.close().catch(() => {});
                    sessoesAtivas.delete(cpf);
                    await apagarSessaoDB(cpf);
                    continue;
                }

                await page.evaluate(() => {
                    fetch(window.location.href, { method: 'HEAD' }).catch(() => {});
                });
                console.log(`[Keep-Alive] Pulso enviado com sucesso para o CPF ${cpf}.`);
            } else {
                sessoesAtivas.delete(cpf);
            }
        } catch (error) {
            console.log(`[Keep-Alive] Falha ao enviar pulso para o CPF ${cpf}.`);
        }
    }
}, 12 * 60 * 1000); 

// ============================================================================
// FUNÇÕES AUXILIARES DO PCNET
// ============================================================================

async function desativarContadorSessao(page) {
    try {
        await page.evaluate(() => {
            window.tempoDeVidaSessao = function() {};
            window.pararContSessao = function() {};
            window.pararAnima = function() {};
            
            if (typeof relogio !== 'undefined' && relogio) clearTimeout(relogio);
            if (typeof contPararAnima !== 'undefined' && contPararAnima) clearTimeout(contPararAnima);
            
            const divTempo = document.getElementById("tempoRestanteDeSessao");
            if (divTempo) {
                divTempo.innerHTML = "<font color='#FFFFFF'><b>Infinito (Robô)</b></font>";
            }
        });
    } catch (error) {}
}

async function verificarETratarUnidade(page, codigoUnidade) {
    try {
        const seletorUnidade = await page.$('select#unidadeSelecionada');
        if (seletorUnidade) {
            console.log('🔄 Tela de Unidade Policial detectada. Selecionando unidade e confirmando...');
            await page.select('select#unidadeSelecionada', codigoUnidade);
            await new Promise(r => setTimeout(r, 1000));
            
            await page.evaluate(() => {
                const botoes = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
                const btnConfirmar = botoes.find(b => (b.textContent && b.textContent.includes('Confirmar')) || b.value === 'Confirmar');
                if (btnConfirmar) btnConfirmar.click();
            });
            
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 3000));
            console.log('✅ Unidade confirmada com sucesso, retomando o fluxo.');
        }
    } catch (e) {
        console.log('Aviso: Tela de unidade não apareceu ou já foi passada.', e.message);
    }
}

// 🎯 FUNÇÃO AUXILIAR REUTILIZÁVEL: Abre a custódia e pesquisa a FAV (Evita duplicação de código!)
async function abrirPopupCustodiaParaFav(page, browser, numeroFav) {
    let pagesAntigas = await browser.pages();
    const clicouCustodia = await page.evaluate(() => {
        const icone = document.querySelector('img[src*="ico_cadeia_custodia.png"]');
        if (icone && icone.closest('a')) {
            icone.closest('a').click();
            return true;
        }
        return false;
    });

    if (!clicouCustodia) throw new Error('Ícone de Cadeia de Custódia não encontrado.');

    let popupFavPage = null;
    for (let i = 0; i < 25; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const pagesAtuais = await browser.pages();
        if (pagesAtuais.length > pagesAntigas.length) {
            popupFavPage = pagesAtuais.find(p => !pagesAntigas.includes(p));
            if (popupFavPage) break;
        }
    }

    if (!popupFavPage) throw new Error('O pop-up de Movimentação FAV não abriu.');
    await desativarContadorSessao(popupFavPage);

    await popupFavPage.waitForSelector('#numeroDaFAV_Arg', { timeout: 20000 });
    await popupFavPage.click('#numeroDaFAV_Arg', { clickCount: 3 });
    await popupFavPage.keyboard.press('Backspace');
    await popupFavPage.type('#numeroDaFAV_Arg', String(numeroFav));

    await popupFavPage.click('#btnPesquisar');
    await new Promise(r => setTimeout(r, 4000));

    const selecionou = await popupFavPage.evaluate((favAlvo) => {
        for (const linha of Array.from(document.querySelectorAll('tr'))) {
            if (linha.textContent.includes(String(favAlvo))) {
                const cb = linha.querySelector('input[type="checkbox"][name*="flagSelecionada"]');
                if (cb) { cb.click(); return true; }
            }
        }
        return false;
    }, numeroFav);

    if (!selecionou) throw new Error(`Item da FAV ${numeroFav} não encontrado.`);
    await new Promise(r => setTimeout(r, 1500));

    return popupFavPage;
}

// ============================================================================
// LOGIN E AUTENTICAÇÃO
// ============================================================================
async function iniciarLoginPCNet(cpf, senha, tipoEmail = 'principal') {
    const browser = await puppeteer.launch({
        browser: 'firefox',
        headless: false, 
        defaultViewport: null,
        args: [
            '--start-maximized',
            '--password-store=basic', 
            '--disable-save-password-bubble',
            '--disable-features=PasswordLeakDetection,AutofillServerCommunication'
        ],
        extraPrefsFirefox: {
            'signon.rememberSignons': false,
            'signon.autofillForms': false,
            'signon.management.page.breach-alerts.enabled': false,
            'security.insecure_password.ui.enabled': false
        }
    });

    const page = await browser.newPage();
    page.on('dialog', async dialog => await dialog.dismiss());

    try {
        await page.goto('https://www.pcnet.mg.gov.br/APP/', { waitUntil: 'networkidle2' });
        await desativarContadorSessao(page);

        await page.waitForSelector('input[name="j_username"]', { timeout: 15000 });
        await page.type('input[name="j_username"]', cpf);
        await page.type('input[name="j_password"]', senha);
        await page.keyboard.press('Enter');

        const resultadoLogin = await Promise.race([
            page.waitForFunction(() => {
                const spans = Array.from(document.querySelectorAll('span.z-label'));
                return spans.some(span => span.textContent && span.textContent.includes('E-mail'));
            }, { timeout: 25000 }).then(() => 'SUCESSO_2FA'),
            
            page.waitForSelector('.error, .msg_erro, div[style*="color: red"], td.msg_erro', { timeout: 25000 })
                .then(() => 'ERRO_CREDENCIAL')
                .catch(() => 'TIMEOUT_IGNORADO')
        ]);

        if (resultadoLogin === 'ERRO_CREDENCIAL' || resultadoLogin === 'TIMEOUT_IGNORADO') {
            const textoErroTela = await page.evaluate(() => {
                const elem = document.querySelector('.error, .msg_erro, div[style*="color: red"], td.msg_erro');
                return elem ? elem.textContent.trim() : null;
            });
            throw new Error(textoErroTela || 'Credenciais inválidas ou falha ao autenticar no PCNet.');
        }

        await desativarContadorSessao(page);
        const textoBusca = tipoEmail.toLowerCase() === 'secundario' ? 'E-mail Secundário' : 'E-mail Principal';

        const clicouComSucesso = await page.evaluate((busca) => {
            const spans = Array.from(document.querySelectorAll('span.z-label'));
            const spanEmail = spans.find(el => el.textContent && el.textContent.trim().includes(busca));
            if (spanEmail) {
                const divClicavel = spanEmail.closest('.z-vlayout-inner') || spanEmail.parentElement || spanEmail;
                divClicavel.click();
                return true;
            }
            return false;
        }, textoBusca);

        if (!clicouComSucesso) throw new Error(`Não foi possível encontrar ou clicar na opção "${textoBusca}".`);

        await new Promise(r => setTimeout(r, 4000));
        sessoesPendentes.set(cpf, { browser, page, tipoEmail });

        return { status: 'REQUER_2FA', mensagem: `Canal (${textoBusca}) selecionado com sucesso! O código foi enviado.` };

    } catch (error) {
        if (browser) await browser.close().catch(() => {});
        sessoesPendentes.delete(cpf);
        let msgLimpa = error.message;
        if (msgLimpa.includes('Falha no processo inicial') || msgLimpa.includes('não foi possível')) {
            msgLimpa = 'CPF ou senha do PCNet incorretos.';
        }
        throw new Error(msgLimpa);
    }
}

async function confirmarToken2FA(cpf, token) {
    const sessao = sessoesPendentes.get(cpf);
    if (!sessao) throw new Error('Nenhuma sessão pendente de 2FA encontrada. Faça o login novamente.');

    const { browser, page } = sessao;

    try {
        await page.waitForSelector('input.code-input', { timeout: 15000 });
        const inputsToken = await page.$$('input.code-input');
        
        if (inputsToken.length === 6) {
            for (let i = 0; i < token.length; i++) {
                await inputsToken[i].type(token[i]);
                await new Promise(r => setTimeout(r, 100)); 
            }
            await inputsToken[5].press('Enter');
        } else {
            throw new Error(`Encontradas ${inputsToken.length} caixas de token, mas eram esperadas 6.`);
        }

        const botaoSelector = await page.evaluate(() => {
            const botoes = Array.from(document.querySelectorAll('button.z-button'));
            const btnVerificar = botoes.find(b => b.textContent && b.textContent.includes('erificar'));
            if (btnVerificar) {
                if (btnVerificar.id) return '#' + btnVerificar.id;
                btnVerificar.setAttribute('data-robo-clique', 'aqui');
                return 'button[data-robo-clique="aqui"]';
            }
            return null;
        });

        if (botaoSelector) await page.click(botaoSelector);
        await new Promise(r => setTimeout(r, 2000));

        const modalErro = await page.evaluate(() => {
            const elementosTexto = Array.from(document.querySelectorAll('div, span, td, p'));
            const erroEncontrado = elementosTexto.find(el => el.textContent && (el.textContent.includes('Código inválido') || el.textContent.includes('código inválido')));
            return erroEncontrado ? 'O código digitado é inválido ou já expirou.' : null;
        });

        if (modalErro) {
            await browser.close();
            sessoesPendentes.delete(cpf);
            throw new Error(modalErro);
        }

        try {
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }),
                page.waitForSelector('input.code-input', { hidden: true, timeout: 15000 })
            ]);
        } catch (error) {
            throw new Error('O botão VERIFICAR não respondeu ou o token informado estava incorreto/expirado.');
        }

        await new Promise(r => setTimeout(r, 3000));
        await desativarContadorSessao(page);

        const cookies = await browser.cookies();
        await salvarSessaoDB(cpf, JSON.stringify(cookies));

        sessoesAtivas.set(cpf, { browser, page });
        sessoesPendentes.delete(cpf);

        return { status: 'SUCESSO', mensagem: 'Login validado com sucesso! Sessão salva e mantida ativa.' };

    } catch (error) {
        if (browser && page && !page.isClosed()) await browser.close().catch(() => {});
        sessoesPendentes.delete(cpf);
        throw new Error(error.message.includes('O código digitado') ? error.message : ('Erro ao validar o token 2FA: ' + error.message));
    }
}

async function acessarAceiteRequisicoes(cpf, codigoUnidade = 'C02977') {
    let sessaoAtiva = sessoesAtivas.get(cpf);

    if (sessaoAtiva && sessaoAtiva.page && sessaoAtiva.page.isClosed()) {
        sessoesAtivas.delete(cpf);
        sessaoAtiva = null;
    }

    if (!sessaoAtiva) {
        const cookiesData = await buscarSessaoDB(cpf);
        if (cookiesData) {
            const browser = await puppeteer.launch({
                browser: 'firefox',
                headless: false, 
                defaultViewport: null,
                args: ['--start-maximized']
            });

            const browserContext = browser.defaultBrowserContext();
            await browserContext.setCookie(...JSON.parse(cookiesData));

            const page = await browser.newPage();
            page.on('dialog', async dialog => await dialog.dismiss());

            await page.goto('https://www.pcnet.mg.gov.br/APP/', { waitUntil: 'networkidle2' });
            await desativarContadorSessao(page);

            sessoesAtivas.set(cpf, { browser, page });
            sessaoAtiva = sessoesAtivas.get(cpf);
        } else {
            throw new Error('Nenhuma sessão ativa encontrada. Conecte o robô na aba "Integração PCNet".');
        }
    }

    const { page, browser } = sessaoAtiva;

    try {
        await page.goto('https://www.pcnet.mg.gov.br/APP/', { waitUntil: 'networkidle2' });
        await desativarContadorSessao(page);

        await verificarETratarUnidade(page, codigoUnidade);

        await page.keyboard.down('Control');
        await page.keyboard.press('F1');
        await page.keyboard.up('Control');

        await new Promise(r => setTimeout(r, 4000));
        await desativarContadorSessao(page);
        
        return { status: 'SUCESSO', mensagem: 'Unidade selecionada e tela de aceite acessada com sucesso!' };
    } catch (error) {
        throw new Error('Erro ao navegar para as requisições: ' + error.message);
    }
}

// ============================================================================
// MOVIMENTAÇÃO DE FAV E COLETA/ACONDICIONAMENTO
// ============================================================================

async function movimentarFavExamePericial(cpf, codigoUnidade, numeroFav, novoLacre = null) {
    await acessarAceiteRequisicoes(cpf, codigoUnidade);
    const sessaoAtiva = sessoesAtivas.get(cpf);
    const { browser } = sessaoAtiva;
    let popupFavPage = null, popupCustodiaPage = null;

    try {
        popupFavPage = await abrirPopupCustodiaParaFav(page = sessaoAtiva.page, browser, numeroFav);
        popupFavPage.on('close', () => { popupFavPage = null; });

        let pagesAntigas = await browser.pages();
        await popupFavPage.evaluate(() => {
            const btn = document.querySelector('input[value="Sob Custódia"]') || document.getElementById('botao_menu');
            if (btn) btn.click();
        });

        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const pagesAtuais = await browser.pages();
            if (pagesAtuais.length > pagesAntigas.length) {
                popupCustodiaPage = pagesAtuais.find(p => !pagesAntigas.includes(p));
                if (popupCustodiaPage) break;
            }
        }

        if (!popupCustodiaPage) throw new Error('A janela de Sob Custódia não abriu.');
        await desativarContadorSessao(popupCustodiaPage);
        await popupCustodiaPage.waitForSelector('#finalidade2', { timeout: 15000 });

        await popupCustodiaPage.evaluate((lacreInfo) => {
            const radioPericial = document.getElementById('finalidade2');
            if (radioPericial) { radioPericial.checked = true; radioPericial.click(); if (typeof campoAlterado === 'function') campoAlterado(); }

            if (lacreInfo && lacreInfo.trim() !== '') {
                const radioSim = document.getElementById('houveRompimentoLacre0');
                if (radioSim) { radioSim.click(); if (typeof habilitarDesabilitarCampoNovoInvolucro === 'function') habilitarDesabilitarCampoNovoInvolucro(radioSim); }
                const inputLacre = document.getElementById('involucroNumero');
                if (inputLacre) { inputLacre.value = lacreInfo; inputLacre.dispatchEvent(new Event('input', { bubbles: true })); inputLacre.dispatchEvent(new Event('change', { bubbles: true })); }
            } else {
                const radioNao = document.getElementById('houveRompimentoLacre1');
                if (radioNao) { radioNao.click(); if (typeof habilitarDesabilitarCampoNovoInvolucro === 'function') habilitarDesabilitarCampoNovoInvolucro(radioNao); }
            }
        }, novoLacre);

        await new Promise(r => setTimeout(r, 1500));
        await popupCustodiaPage.click('#btnGrava');
        await new Promise(r => setTimeout(r, 4000));

        const msgErro = await popupCustodiaPage.evaluate(() => {
            const elemErro = document.querySelector('.msg_erro, td.msg_erro, div.msg_erro');
            return elemErro && elemErro.textContent.trim() !== '' ? elemErro.textContent.trim() : null;
        });

        if (msgErro) throw new Error(`Sistema recusou a operação: ${msgErro}`);

        try { await popupCustodiaPage.click('#fechar_id'); } catch (e) { if (!popupCustodiaPage.isClosed()) await popupCustodiaPage.close(); }
        await new Promise(r => setTimeout(r, 2000));

        if (popupFavPage && !popupFavPage.isClosed()) {
            await popupFavPage.click('#btnLimpar');
            await new Promise(r => setTimeout(r, 1500));
            await popupFavPage.click('#fechar_id');
        }

        return { status: 'SUCESSO', mensagem: `FAV ${numeroFav} movimentada com sucesso!` };

    } catch (error) {
        try { if (popupCustodiaPage && !popupCustodiaPage.isClosed()) await popupCustodiaPage.close(); } catch (err) {}
        try { if (popupFavPage && !popupFavPage.isClosed()) await popupFavPage.close(); } catch (err) {}
        throw new Error('Erro ao movimentar a FAV: ' + error.message);
    }
}

// 🎯 NOVA FUNÇÃO DE COLETA / ACONDICIONAMENTO (Reaproveita a lógica de abertura!)
async function coletarMaterialFav(cpf, codigoUnidade, numeroFav) {
    await acessarAceiteRequisicoes(cpf, codigoUnidade);
    const sessaoAtiva = sessoesAtivas.get(cpf);
    const { browser } = sessaoAtiva;
    let popupFavPage = null, popupAcondicionamentoPage = null;

    try {
        popupFavPage = await abrirPopupCustodiaParaFav(page = sessaoAtiva.page, browser, numeroFav);
        popupFavPage.on('close', () => { popupFavPage = null; });

        let pagesAntigas = await browser.pages();
        await popupFavPage.evaluate(() => {
            const botoes = Array.from(document.querySelectorAll('input, button'));
            const btnAcondicionar = botoes.find(b => (b.value && b.value.includes('Acondicionamento')) || (b.textContent && b.textContent.includes('Acondicionamento')));
            if (btnAcondicionar) btnAcondicionar.click();
            else {
                const btnFallback = document.querySelector('input[value*="Acond"]');
                if (btnFallback) btnFallback.click();
            }
        });

        for (let i = 0; i < 25; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const pagesAtuais = await browser.pages();
            if (pagesAtuais.length > pagesAntigas.length) {
                popupAcondicionamentoPage = pagesAtuais.find(p => !pagesAntigas.includes(p));
                if (popupAcondicionamentoPage) break;
            }
        }

        if (!popupAcondicionamentoPage) throw new Error('A janela de Acondicionamento não abriu.');
        await desativarContadorSessao(popupAcondicionamentoPage);
        await new Promise(r => setTimeout(r, 2000));

        // Clica em Gravar/Salvar na tela de acondicionamento
        await popupAcondicionamentoPage.click('#btnGrava, input[value="Salvar"], input[value="Gravar"]').catch(() => {});
        await new Promise(r => setTimeout(r, 4000));

        const msgErro = await popupAcondicionamentoPage.evaluate(() => {
            const elemErro = document.querySelector('.msg_erro, td.msg_erro, div.msg_erro');
            return elemErro && elemErro.textContent.trim() !== '' ? elemErro.textContent.trim() : null;
        });

        if (msgErro) throw new Error(`Sistema recusou a operação: ${msgErro}`);

        try { await popupAcondicionamentoPage.click('#fechar_id'); } catch (e) { if (!popupAcondicionamentoPage.isClosed()) await popupAcondicionamentoPage.close(); }
        await new Promise(r => setTimeout(r, 2000));

        if (popupFavPage && !popupFavPage.isClosed()) {
            await popupFavPage.click('#btnLimpar');
            await new Promise(r => setTimeout(r, 1500));
            await popupFavPage.click('#fechar_id');
        }

        return { status: 'SUCESSO', mensagem: `FAV ${numeroFav} acondicionada/coletada com sucesso!` };

    } catch (error) {
        try { if (popupAcondicionamentoPage && !popupAcondicionamentoPage.isClosed()) await popupAcondicionamentoPage.close(); } catch (err) {}
        try { if (popupFavPage && !popupFavPage.isClosed()) await popupFavPage.close(); } catch (err) {}
        throw new Error('Erro ao acondicionar a FAV: ' + error.message);
    }
}

// ============================================================================
// OUTRAS FUNÇÕES (CSV, Lote, Amostra, etc.)
// ============================================================================
async function obterCsvRequisicoes(cpf, codigoUnidade = 'C02977') {
    await acessarAceiteRequisicoes(cpf, codigoUnidade);
    const sessaoAtiva = sessoesAtivas.get(cpf);
    const { page } = sessaoAtiva;

    try {
        const botaoPesquisar = await page.$('input#btnPesquisar');
        if (botaoPesquisar) await botaoPesquisar.click();
        else await page.keyboard.press('F9');

        await new Promise(r => setTimeout(r, 8000));

        const clicouExportar = await page.evaluate(() => {
            const botoes = Array.from(document.querySelectorAll('button, input[type="button"]'));
            const btnCsv = botoes.find(b => (b.textContent && b.textContent.includes('Exportar CSV')) || (b.value && b.value.includes('Exportar CSV')));
            if (btnCsv) { btnCsv.click(); return true; }
            return false;
        });

        if (!clicouExportar) throw new Error('O botão "Exportar CSV" não foi encontrado na tela.');
        await new Promise(r => setTimeout(r, 1500));
        await page.keyboard.press('Enter');

        const downloadPath = path.join(os.homedir(), 'Downloads');
        let arquivoEncontrado = null;
        
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 1000));
            if (fs.existsSync(downloadPath)) {
                const arquivos = fs.readdirSync(downloadPath);
                const csvs = arquivos.filter(f => (f.endsWith('.csv') || f.endsWith('.xls') || f.endsWith('.ods')) && !f.endsWith('.part') && !f.endsWith('.tmp'));
                
                if (csvs.length > 0) {
                    csvs.sort((a, b) => fs.statSync(path.join(downloadPath, b)).mtimeMs - fs.statSync(path.join(downloadPath, a)).mtimeMs);
                    const arquivoMaisRecente = path.join(downloadPath, csvs[0]);
                    if ((new Date().getTime() - fs.statSync(arquivoMaisRecente).mtimeMs) < 15000) {
                        arquivoEncontrado = arquivoMaisRecente;
                        break;
                    }
                }
            }
        }

        if (!arquivoEncontrado) throw new Error('O arquivo CSV não foi baixado pelo navegador a tempo.');
        return arquivoEncontrado;
    } catch (error) {
        throw new Error('Erro ao exportar o CSV: ' + error.message);
    }
}

async function criarFavAmostra(cpf, numeroLaudo, favOriginal, numeroLacre, codigoUnidade = 'C02977') {
    if (!numeroLacre) throw new Error('O parâmetro "numeroLacre" é obrigatório.');

    let sessaoAtiva = sessoesAtivas.get(cpf);
    if (sessaoAtiva && sessaoAtiva.page && sessaoAtiva.page.isClosed()) {
        sessoesAtivas.delete(cpf);
        sessaoAtiva = null;
    }

    if (!sessaoAtiva) {
        const cookiesData = await buscarSessaoDB(cpf);
        if (cookiesData) {
            const browser = await puppeteer.launch({ browser: 'firefox', headless: false, defaultViewport: null, args: ['--start-maximized'] });
            await browser.defaultBrowserContext().setCookie(...JSON.parse(cookiesData));
            const page = await browser.newPage();
            page.on('dialog', async dialog => await dialog.accept());
            await page.goto('https://www.pcnet.mg.gov.br/APP/', { waitUntil: 'networkidle2' });
            await desativarContadorSessao(page);
            sessoesAtivas.set(cpf, { browser, page });
            sessaoAtiva = sessoesAtivas.get(cpf);
        } else {
            throw new Error('Nenhuma sessão ativa encontrada. Conecte o robô na aba "Integração PCNet".');
        }
    }

    const { page } = sessaoAtiva;
    page.removeAllListeners('dialog');
    page.on('dialog', async dialog => await dialog.accept());

    try {
        await page.goto('https://www.pcnet.mg.gov.br/APP/', { waitUntil: 'networkidle2' });
        await desativarContadorSessao(page);
        await verificarETratarUnidade(page, codigoUnidade);

        await page.keyboard.down('Control');
        await page.keyboard.press('F2');
        await page.keyboard.up('Control');
        await new Promise(r => setTimeout(r, 4000));
        await desativarContadorSessao(page);

        await verificarETratarUnidade(page, codigoUnidade);

        await page.evaluate(() => {
            const botoes = Array.from(document.querySelectorAll('button, input[type="button"], td'));
            const btnLimpar = botoes.find(b => b.textContent && b.textContent.trim() === 'Limpar');
            if (btnLimpar) btnLimpar.click();
        });
        await new Promise(r => setTimeout(r, 1500));

        await page.waitForSelector('input[type="text"]', { timeout: 10000 });
        const inputsTexto = await page.$$('input[type="text"]');
        if (inputsTexto.length > 0) {
            await inputsTexto[0].click({ clickCount: 3 });
            await inputsTexto[0].press('Backspace');
            await page.evaluate(input => { input.value = ''; }, inputsTexto[0]);
            await inputsTexto[0].type(String(numeroLaudo), { delay: 50 });
            await page.evaluate(input => { input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); }, inputsTexto[0]);
        }

        await new Promise(r => setTimeout(r, 1000));
        const botaoEncontrado = await page.$('#btnPesquisar');
        if (botaoEncontrado) await botaoEncontrado.click();
        else await page.keyboard.press('F9');

        await new Promise(r => setTimeout(r, 5000));

        const abriuLaudo = await page.evaluate((laudo) => {
            const linhas = Array.from(document.querySelectorAll('tr'));
            const linhaCerta = linhas.find(tr => tr.textContent.includes(String(laudo)) && !tr.textContent.includes('Nº Laudo'));
            if (linhaCerta) {
                const alvo = linhaCerta.querySelector('td') || linhaCerta;
                alvo.scrollIntoView();
                alvo.click();
                ['mousedown', 'click', 'mouseup'].forEach(ev => alvo.dispatchEvent(new MouseEvent(ev, { bubbles: true, cancelable: true, view: window })));
                return true;
            }
            return false;
        }, numeroLaudo);

        if (!abriuLaudo) throw new Error(`Laudo ${numeroLaudo} não encontrado.`);
        await new Promise(r => setTimeout(r, 3000));

        await page.evaluate((laudo) => {
            const linhas = Array.from(document.querySelectorAll('tr'));
            const linhaCerta = linhas.find(tr => tr.textContent.includes(String(laudo)) && !tr.textContent.includes('Nº Laudo'));
            if (linhaCerta) {
                const alvo = linhaCerta.querySelector('td') || linhaCerta;
                alvo.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
            }
        }, numeroLaudo);

        await new Promise(r => setTimeout(r, 5000));
        await desativarContadorSessao(page);

        await page.evaluate(() => { if (typeof mudaMenu === 'function') mudaMenu('/APP'); });
        await new Promise(r => setTimeout(r, 1500));
        await page.evaluate(() => { if (typeof expandeMenu === 'function') expandeMenu('#Bens Materiais'); });
        await new Promise(r => setTimeout(r, 1500));

        await page.evaluate(() => {
            if (typeof redirectajaxCnet === 'function') redirectajaxCnet('/PCnet/acessarbemmaterialsel.do?evento=F9-Pesquisar&janelaModal=N');
            else {
                const itemAcessar = Array.from(document.querySelectorAll('td.menu_item')).find(el => el.textContent && el.textContent.includes('Acessar / Cadastrar'));
                if (itemAcessar) itemAcessar.click();
            }
        });

        await new Promise(r => setTimeout(r, 4000));
        await desativarContadorSessao(page);

        await page.evaluate(() => {
            const btnNovo = document.querySelector('input[value="Novo Bem Material"], #botao_menu');
            if (btnNovo) btnNovo.click();
            else if (typeof novoBemaMaterial === 'function') novoBemaMaterial();
        });

        await new Promise(r => setTimeout(r, 4000));
        await desativarContadorSessao(page);

        await page.waitForSelector('input[name="novoNumeroInvolucro"]', { timeout: 10000 });
        await page.click('input[name="novoNumeroInvolucro"]', { clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.type('input[name="novoNumeroInvolucro"]', String(numeroLacre), { delay: 50 });

        const textoDescricao = `Amostra da fav original ${favOriginal}, cujo resultado encontra-se no laudo nº ${numeroLaudo} acondicionada em invólucro número ${numeroLacre}.`;
        
        await page.waitForSelector('#infAdicional', { timeout: 10000 });
        await page.evaluate((texto) => {
            const txtArea = document.querySelector('#infAdicional');
            if (txtArea) {
                txtArea.value = texto;
                txtArea.dispatchEvent(new Event('input', { bubbles: true }));
                txtArea.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, textoDescricao);

        await new Promise(r => setTimeout(r, 1000));

        await page.evaluate(() => {
            const btnSalvar = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]')).find(b => (b.textContent && b.textContent.includes('Salvar')) || b.value === 'Salvar');
            if (btnSalvar) btnSalvar.click();
        });

        await new Promise(r => setTimeout(r, 4000));
        await desativarContadorSessao(page);

        return { sucesso: true, mensagem: `Sucesso absoluto! Lacre ${numeroLacre} inserido e amostra salva.` };
    } catch (error) {
        throw new Error('Erro ao cadastrar a amostra de bem material: ' + error.message);
    }
}

async function encerrarSessao(identificador) {
    for (const [key, sessao] of sessoesAtivas.entries()) {
        if (sessao && sessao.browser) await sessao.browser.close().catch(() => {});
    }
    sessoesAtivas.clear(); 

    for (const [key, sessao] of sessoesPendentes.entries()) {
        if (sessao && sessao.browser) await sessao.browser.close().catch(() => {});
    }
    sessoesPendentes.clear(); 

    if (identificador) await apagarSessaoDB(identificador).catch(() => {});
}

async function verificarStatusPCNet(cpf) {
    try {
        const sessaoAtiva = sessoesAtivas.get(cpf);
        if (sessaoAtiva && sessaoAtiva.page && !sessaoAtiva.page.isClosed()) return { ativo: true };
        const cookiesData = await buscarSessaoDB(cpf);
        return { ativo: !!cookiesData };
    } catch (error) {
        return { ativo: false };
    }
}

module.exports = {
    iniciarLoginPCNet,
    confirmarToken2FA,
    acessarAceiteRequisicoes,
    obterCsvRequisicoes,
    movimentarFavExamePericial,
    coletarMaterialFav,
    encerrarSessao,
    verificarStatusPCNet,
    criarFavAmostra
};