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
// SISTEMA DE KEEP-ALIVE (Agora com detector de tela de login)
// ============================================================================
setInterval(async () => {
    if (sessoesAtivas.size === 0) return;

    console.log('[Keep-Alive] Verificando sessões ativas para envio de pulso de vida...');

    for (const [cpf, sessao] of sessoesAtivas.entries()) {
        try {
            const { page, browser } = sessao;
            if (page && !page.isClosed()) {
                const urlAtual = page.url();
                
                // DETECTOR DE SESSÃO MORTA
                if (urlAtual.includes('loginVM.zul') || urlAtual.includes('seg.id')) {
                    console.log(`[Keep-Alive] ALERTA: A sessão do CPF ${cpf} expirou no servidor. Fechando aba zumbi...`);
                    await browser.close().catch(() => {});
                    sessoesAtivas.delete(cpf);
                    await apagarSessaoDB(cpf);
                    continue; // Pula para a próxima sessão
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
// FUNÇÕES AUXILIARES E DO FLUXO DO PCNET
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

async function iniciarLoginPCNet(cpf, senha, tipoEmail = 'principal') {
    const browser = await puppeteer.launch({
        browser: 'firefox',
        headless: true, 
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

        console.log('Aguardando os botões de e-mail aparecerem no HTML...');
        
        const resultadoLogin = await Promise.race([
            page.waitForFunction(() => {
                const spans = Array.from(document.querySelectorAll('span.z-label'));
                return spans.some(span => span.textContent && span.textContent.includes('E-mail'));
            }, { timeout: 30000 }).then(() => 'SUCESSO_2FA'),
            
            page.waitForSelector('.error, .msg_erro, div[style*="color: red"]', { timeout: 5000 })
                .then(() => 'ERRO_CREDENCIAL')
                .catch(() => 'TIMEOUT_IGNORADO')
        ]);

        if (resultadoLogin === 'ERRO_CREDENCIAL') {
            throw new Error('Falha no login: Credenciais inválidas ou erro reportado pelo sistema.');
        }

        await desativarContadorSessao(page);

        const textoBusca = tipoEmail.toLowerCase() === 'secundario' ? 'E-mail Secundário' : 'E-mail Principal';
        console.log(`Procurando e clicando na opção: "${textoBusca}"`);

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

        if (!clicouComSucesso) {
            throw new Error(`Não foi possível encontrar ou clicar na opção "${textoBusca}".`);
        }

        await new Promise(r => setTimeout(r, 4000));
        sessoesPendentes.set(cpf, { browser, page, tipoEmail });

        return { status: 'REQUER_2FA', mensagem: `Canal (${textoBusca}) selecionado com sucesso! O código foi enviado.` };

    } catch (error) {
        if (browser) await browser.close().catch(() => {});
        sessoesPendentes.delete(cpf);
        throw new Error('Falha no processo inicial do PCNet: ' + error.message);
    }
}

async function confirmarToken2FA(cpf, token) {
    const sessao = sessoesPendentes.get(cpf);
    if (!sessao) throw new Error('Nenhuma sessão pendente de 2FA encontrada. Faça o login novamente.');

    const { browser, page } = sessao;

    try {
        console.log('Aguardando as caixinhas do token carregarem...');
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

        console.log('Aguardando resposta do servidor...');
        await new Promise(r => setTimeout(r, 2000));

        const modalErro = await page.evaluate(() => {
            const elementosTexto = Array.from(document.querySelectorAll('div, span, td, p'));
            const erroEncontrado = elementosTexto.find(el => 
                el.textContent && (el.textContent.includes('Código inválido') || el.textContent.includes('código inválido'))
            );
            if (erroEncontrado) {
                return 'O código digitado é inválido ou já expirou.';
            }
            return null;
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

        const urlAtual = await page.url();
        if (urlAtual.includes('validacao_duas_etapas')) {
            throw new Error('Token inválido ou incorreto: O sistema continuou preso na tela de 2FA.');
        }

        const cookies = await browser.cookies();
        await salvarSessaoDB(cpf, JSON.stringify(cookies));
        console.log('[Sessão] Todos os cookies globais do Firefox foram salvos no Banco de Dados SQLite!');

        sessoesAtivas.set(cpf, { browser, page });
        sessoesPendentes.delete(cpf);

        return { status: 'SUCESSO', mensagem: 'Login validado com sucesso! Sessão salva e mantida ativa.' };

    } catch (error) {
        if (browser && page && !page.isClosed()) await browser.close().catch(() => {});
        sessoesPendentes.delete(cpf);
        const msgFinal = error.message.includes('O código digitado') ? error.message : ('Erro ao validar o token 2FA: ' + error.message);
        throw new Error(msgFinal);
    }
}

async function acessarAceiteRequisicoes(cpf, codigoUnidade = 'C0053') {
    let sessaoAtiva = sessoesAtivas.get(cpf);

    // SE A JANELA ANTERIOR FECHOU, LIMPA DA MEMÓRIA PARA RECUPERAR VIA BANCO AUTOMATICAMENTE
    if (sessaoAtiva && sessaoAtiva.page && sessaoAtiva.page.isClosed()) {
        console.log('[Sessão] A aba anterior estava fechada. Recuperando sessão via SQLite...');
        sessoesAtivas.delete(cpf);
        sessaoAtiva = null;
    }

    // RESTAURAÇÃO DA SESSÃO VIA SQLITE (CASO NECESSÁRIO)
    if (!sessaoAtiva) {
        const cookiesData = await buscarSessaoDB(cpf);

        if (cookiesData) {
            console.log(`[Sessão] Restaurando sessão do Banco de Dados para o CPF ${cpf}...`);
            
            const browser = await puppeteer.launch({
                browser: 'firefox',
                headless: true, 
                defaultViewport: null,
                args: ['--start-maximized']
            });

            const browserContext = browser.defaultBrowserContext();
            const cookies = JSON.parse(cookiesData);
            await browserContext.setCookie(...cookies);

            const page = await browser.newPage();
            page.on('dialog', async dialog => await dialog.dismiss());

            await page.goto('https://www.pcnet.mg.gov.br/APP/', { waitUntil: 'networkidle2' });
            
            await page.evaluate(() => {
                const btnFecharAlerta = document.querySelector('.alertblock button, .msg_erro button, input[value="Fechar"], input[value="OK"]');
                if (btnFecharAlerta) btnFecharAlerta.click();
            }).catch(() => {});

            await desativarContadorSessao(page);

            const urlAtual = page.url();
            if (urlAtual.includes('loginVM.zul') || urlAtual.includes('seg.id')) {
                console.log('[Sessão] Cookie expirado no servidor. Fechando navegador zumbi.');
                await browser.close().catch(() => {}); 
                await apagarSessaoDB(cpf);
                throw new Error('A sessão salva expirou no servidor. Por favor, vá na aba "Integração PCNet" e faça o login novamente.');
            }

            sessoesAtivas.set(cpf, { browser, page });
            sessaoAtiva = sessoesAtivas.get(cpf);
            console.log('[Sessão] Sessão restaurada com sucesso em segundo plano!');
        } else {
            throw new Error('Nenhuma sessão ativa encontrada. Por favor, conecte o robô na aba "Integração PCNet".');
        }
    }

    const { page, browser } = sessaoAtiva;

    try {
        console.log('Navegando para a página principal do PCNet...');
        await page.goto('https://www.pcnet.mg.gov.br/APP/', { waitUntil: 'networkidle2' });
        
        await desativarContadorSessao(page);

        const urlAtual = page.url();
        if (urlAtual.includes('loginVM.zul') || urlAtual.includes('seg.id')) {
            console.log('[Sessão] Queda por inatividade detectada. Fechando navegador zumbi.');
            await browser.close().catch(() => {}); 
            sessoesAtivas.delete(cpf);
            await apagarSessaoDB(cpf);
            throw new Error('A sessão expirou no servidor. Por favor, faça o login novamente.');
        }

        const temSeletorUnidade = await page.$('select#unidadeSelecionada');
        
        if (temSeletorUnidade) {
            console.log(`Selecionando a unidade: ${codigoUnidade}...`);
            await page.select('select#unidadeSelecionada', codigoUnidade);
            
            await page.evaluate(() => {
                const botoes = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'));
                const btnConfirmar = botoes.find(b => (b.textContent && b.textContent.includes('Confirmar')) || b.value === 'Confirmar');
                if (btnConfirmar) btnConfirmar.click();
            });

            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 5000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 3000));
            await desativarContadorSessao(page);
        }

        console.log('Home carregada com sucesso! Acionando o atalho CTRL+F1...');
        
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

async function obterCsvRequisicoes(cpf, codigoUnidade = 'C0053') {
    await acessarAceiteRequisicoes(cpf, codigoUnidade);

    const sessaoAtiva = sessoesAtivas.get(cpf);
    if (!sessaoAtiva) throw new Error('Sessão perdida após acessar as requisições.');
    const { page } = sessaoAtiva;

    try {
        console.log('Disparando a pesquisa (F9)...');
        const botaoPesquisar = await page.$('input#btnPesquisar');
        if (botaoPesquisar) await botaoPesquisar.click();
        else await page.keyboard.press('F9');

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

        if (!clicouExportar) throw new Error('O botão "Exportar CSV" não foi encontrado na tela.');

        await new Promise(r => setTimeout(r, 1500));
        await page.keyboard.press('Enter');

        const downloadPath = path.join(os.homedir(), 'Downloads');
        console.log('Aguardando o arquivo aparecer na pasta Downloads do Windows...');
        let arquivoEncontrado = null;
        
        for (let i = 0; i < 15; i++) {
            await new Promise(r => setTimeout(r, 1000));
            if (fs.existsSync(downloadPath)) {
                const arquivos = fs.readdirSync(downloadPath);
                const csvs = arquivos.filter(f => (f.endsWith('.csv') || f.endsWith('.xls') || f.endsWith('.ods')) && !f.endsWith('.part') && !f.endsWith('.tmp'));
                
                if (csvs.length > 0) {
                    csvs.sort((a, b) => fs.statSync(path.join(downloadPath, b)).mtimeMs - fs.statSync(path.join(downloadPath, a)).mtimeMs);
                    const arquivoMaisRecente = path.join(downloadPath, csvs[0]);
                    const stats = fs.statSync(arquivoMaisRecente);
                    const agora = new Date().getTime();
                    if ((agora - stats.mtimeMs) < 15000) {
                        arquivoEncontrado = arquivoMaisRecente;
                        break;
                    }
                }
            }
        }

        if (!arquivoEncontrado) throw new Error('O arquivo CSV não foi baixado pelo navegador a tempo.');

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
    let popupFavPage = null, popupCustodiaPage = null;

    try {
        console.log('Abrindo a tela de Cadeia de Custódia...');
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
        popupFavPage.on('close', () => { popupFavPage = null; });

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

        pagesAntigas = await browser.pages();
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
            if (radioPericial) {
                radioPericial.checked = true;
                radioPericial.click();
                if (typeof campoAlterado === 'function') campoAlterado();
            }

            if (lacreInfo && lacreInfo.trim() !== '') {
                const radioSim = document.getElementById('houveRompimentoLacre0');
                if (radioSim) {
                    radioSim.click();
                    if (typeof habilitarDesabilitarCampoNovoInvolucro === 'function') habilitarDesabilitarCampoNovoInvolucro(radioSim);
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
                    if (typeof habilitarDesabilitarCampoNovoInvolucro === 'function') habilitarDesabilitarCampoNovoInvolucro(radioNao);
                }
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

async function movimentarFavsLote(cpf, codigoUnidade, listaFavs) {
    await acessarAceiteRequisicoes(cpf, codigoUnidade);
    const sessaoAtiva = sessoesAtivas.get(cpf);
    if (!sessaoAtiva) throw new Error('Sessão perdida. Faça o login novamente.');
    const { page, browser } = sessaoAtiva;
    const resultados = [];
    let popupFavPage = null;

    try {
        let pagesAntigas = await browser.pages();
        const clicouCustodia = await page.evaluate(() => {
            const icone = document.querySelector('img[src*="ico_cadeia_custodia.png"]');
            if (icone && icone.closest('a')) {
                icone.closest('a').click(); return true;
            }
            return false;
        });

        if (!clicouCustodia) throw new Error('Ícone de Cadeia de Custódia não encontrado.');

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

        for (const item of listaFavs) {
            const { numeroFav, novoLacre } = item;
            console.log(`\n--- Processando FAV: ${numeroFav} ---`);
            let popupCustodiaPage = null;

            try {
                await popupFavPage.waitForSelector('#btnLimpar', { visible: true, timeout: 15000 });
                await popupFavPage.click('#btnLimpar');
                await new Promise(r => setTimeout(r, 1500));

                await popupFavPage.waitForSelector('#numeroDaFAV_Arg', { visible: true, timeout: 15000 });
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

                if (!selecionou) {
                    resultados.push({ fav: numeroFav, status: 'ERRO', mensagem: 'Não encontrado na tabela' });
                    continue;
                }

                await new Promise(r => setTimeout(r, 1500));
                let pagesAntesCustodia = await browser.pages();

                await popupFavPage.evaluate(() => {
                    const btn = document.querySelector('input[value="Sob Custódia"]') || document.getElementById('botao_menu');
                    if (btn) btn.click();
                });

                for (let i = 0; i < 15; i++) {
                    await new Promise(r => setTimeout(r, 1000));
                    const pagesAtuais = await browser.pages();
                    if (pagesAtuais.length > pagesAntesCustodia.length) {
                        popupCustodiaPage = pagesAtuais.find(p => !pagesAntesCustodia.includes(p));
                        if (popupCustodiaPage) break;
                    }
                }

                if (!popupCustodiaPage) throw new Error('A aba de Sob Custódia não abriu.');
                await desativarContadorSessao(popupCustodiaPage);
                await popupCustodiaPage.waitForSelector('#finalidade2', { timeout: 15000 });
                
                await popupCustodiaPage.evaluate((lacreInfo) => {
                    const radioPericial = document.getElementById('finalidade2');
                    if (radioPericial) { radioPericial.checked = true; radioPericial.click(); if(typeof campoAlterado==='function')campoAlterado(); }
                    
                    if (lacreInfo && lacreInfo.trim() !== '') {
                        const radioSim = document.getElementById('houveRompimentoLacre0');
                        if (radioSim) { radioSim.click(); if(typeof habilitarDesabilitarCampNovoInvolucro==='function') habilitarDesabilitarCampNovoInvolucro(radioSim); }
                        const inputLacre = document.getElementById('involucroNumero');
                        if (inputLacre) {
                            inputLacre.value = lacreInfo;
                            inputLacre.dispatchEvent(new Event('input', { bubbles: true }));
                            inputLacre.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    } else {
                        const radioNao = document.getElementById('houveRompimentoLacre1');
                        if (radioNao) { radioNao.click(); if(typeof habilitarDesabilitarCampNovoInvolucro==='function') habilitarDesabilitarCampNovoInvolucro(radioNao); }
                    }
                }, novoLacre);

                await new Promise(r => setTimeout(r, 1000));
                await popupCustodiaPage.click('#btnGrava');
                await new Promise(r => setTimeout(r, 3000));

                const msgErro = await popupCustodiaPage.evaluate(() => {
                    const elemErro = document.querySelector('.msg_erro, td.msg_erro, div.msg_erro');
                    return elemErro && elemErro.textContent.trim() !== '' ? elemErro.textContent.trim() : null;
                });

                if (msgErro) throw new Error(`Recusado: ${msgErro}`);

                try { await popupCustodiaPage.click('#fechar_id'); } catch (e) { if (!popupCustodiaPage.isClosed()) await popupCustodiaPage.close(); }
                await new Promise(r => setTimeout(r, 2000));

                resultados.push({ fav: numeroFav, status: 'SUCESSO' });
                console.log(`FAV ${numeroFav} processada.`);

            } catch (errItem) {
                console.error(`Erro na FAV ${numeroFav}:`, errItem.message);
                resultados.push({ fav: numeroFav, status: 'ERRO', mensagem: errItem.message });
                try { if (popupCustodiaPage && !popupCustodiaPage.isClosed()) await popupCustodiaPage.close(); } catch (eClose) {}
            }
        }

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
        try { if (popupFavPage && !popupFavPage.isClosed()) await popupFavPage.close(); } catch (e) {}
        throw new Error('Erro geral no lote de FAVs: ' + error.message);
    }
}

async function encerrarSessao(identificador) {
    console.log(`[Logout] Solicitação de encerramento recebida para:`, identificador);

    // 1. Fecha TODAS as instâncias ativas (Limpeza Total e Agressiva)
    for (const [key, sessao] of sessoesAtivas.entries()) {
        console.log(`[Logout] Fechando navegador ativo da chave: ${key}`);
        if (sessao && sessao.browser) {
            try {
                await sessao.browser.close();
            } catch (err) {
                console.error('Erro ao fechar browser ativo:', err.message);
            }
        }
    }
    sessoesAtivas.clear(); 

    // 2. Fecha TODAS as instâncias pendentes 
    for (const [key, sessao] of sessoesPendentes.entries()) {
        console.log(`[Logout] Fechando navegador pendente da chave: ${key}`);
        if (sessao && sessao.browser) {
            try {
                await sessao.browser.close();
            } catch (err) {
                console.error('Erro ao fechar browser pendente:', err.message);
            }
        }
    }
    sessoesPendentes.clear(); 

    // 3. Remove os cookies salvos no SQLite usando a função correta
    if (identificador) {
        try {
            await apagarSessaoDB(identificador);
            console.log(`[Logout] Registros de sessão do banco limpos para: ${identificador}`);
        } catch (e) {
            console.error('Erro ao limpar sessão do banco SQLite:', e.message);
        }
    }
}

module.exports = {
    iniciarLoginPCNet,
    confirmarToken2FA,
    acessarAceiteRequisicoes,
    obterCsvRequisicoes,
    movimentarFav,
    movimentarFavsLote,
    encerrarSessao
};