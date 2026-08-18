const fs = require('fs');

async function extrairDadosDrogasViaIA(caminhoImagem) {
    const prompt = `Você é um Perito Criminal assistente especialista em química forense. Analise a fotografia do vestígio de drogas e extraia os dados técnicos com precisão. 
    Retorne estritamente um JSON válido contendo exatamente estas chaves:
    - "droga": (Retorne EXATAMENTE UMA destas opções, em minúsculo e sem acento: "cocaina" ou "maconha")
    - "cor_material": (Descreva a cor aparente apenas se for cocaína, ex: "branca", "esbranquiçada". Se for maconha, deixe vazio)
    - "qtd_involucros": (Apenas o número inteiro de invólucros ou embalagens visíveis, ex: 1)
    - "massa_liquida": (Estimativa ou valor visível se houver balança na foto, ex: "5,2", senão deixe vazio)
    - "envelope_recebimento": (Número do envelope de segurança original de chegada visível, senão deixe vazio)
    - "resultado": (Retorne EXATAMENTE UMA destas opções: "positivo", "negativo" ou "inconclusivo")`;

    try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const imageBuffer = fs.readFileSync(caminhoImagem);
        const base64Image = imageBuffer.toString('base64');

        const response = await ai.models.generateContent({
            model: 'gemini-3.6-flash',
            contents: [
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: base64Image
                    }
                },
                prompt
            ],
            config: {
                temperature: 0.0,
                responseMimeType: 'application/json'
            }
        });

        let textoResposta = response.text.trim();
        if (textoResposta.startsWith('```json')) {
            textoResposta = textoResposta.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (textoResposta.startsWith('```')) {
            textoResposta = textoResposta.replace(/^```/, '').replace(/```$/, '').trim();
        }

        return JSON.parse(textoResposta);
    } catch (error) {
        throw new Error(`Erro ao comunicar com a API do Gemini para drogas: ${error.message}`);
    }
}

function processarDrogas(dadosForm, caminhoFoto = null) {
    // =========================================================================
    // BLINDAGEM E VALIDAÇÕES OBRIGATÓRIAS NO BACKEND
    // =========================================================================
    const droga = String(dadosForm.droga || '').toLowerCase().trim();
    if (!droga || (droga !== 'cocaina' && droga !== 'cocaína' && droga !== 'maconha' && droga !== 'cannabis')) {
        throw new Error('O tipo de droga ("cocaina" ou "maconha") é obrigatório.');
    }

    const qtd = parseInt(dadosForm.qtd_involucros, 10);
    if (isNaN(qtd) || qtd <= 0) {
        throw new Error('A quantidade de invólucros é obrigatória e deve ser um número válido.');
    }

    if (!dadosForm.massa_liquida || String(dadosForm.massa_liquida).trim() === '') {
        throw new Error('O peso/massa líquida do material é obrigatório.');
    }
    if (!dadosForm.extenso_massa || String(dadosForm.extenso_massa).trim() === '') {
        throw new Error('A massa por extenso é obrigatória.');
    }
    if (!dadosForm.numero_fav || String(dadosForm.numero_fav).trim() === '') {
        throw new Error('O número da FAV não foi encontrado no DOCX-base. Informe-o manualmente no formulário.');
    }

    const tipoEncaminhamento = String(dadosForm.tipo_encaminhamento || '').toLowerCase().trim();
    if (tipoEncaminhamento !== 'unificado' && tipoEncaminhamento !== 'fragmentado') {
        throw new Error('O tipo de encaminhamento deve ser obrigatoriamente "unificado" ou "fragmentado".');
    }

    if (tipoEncaminhamento === 'fragmentado') {
        if (!dadosForm.fav_amostra || String(dadosForm.fav_amostra).trim() === '') {
            throw new Error('Para o encaminhamento fragmentado, a FAV da amostra é obrigatória.');
        }
        if (!dadosForm.massa_amostra || String(dadosForm.massa_amostra).trim() === '') {
            throw new Error('Para o encaminhamento fragmentado, a massa da amostra é obrigatória.');
        }
        if (!dadosForm.envelope_amostra || String(dadosForm.envelope_amostra).trim() === '') {
            throw new Error('Para o encaminhamento fragmentado, o número do envelope da amostra é obrigatório.');
        }
        if (!dadosForm.envelope_encaminhamento || String(dadosForm.envelope_encaminhamento).trim() === '') {
            throw new Error('Para o encaminhamento fragmentado, o número do envelope do restante do material é obrigatório.');
        }
    } else {
        // Unificado exige o envelope de encaminhamento/guarda final
        const envEncaminhamento = dadosForm.envelope_encaminhamento || dadosForm.envelope_todo_material || dadosForm.n_lacre || '';
        if (!envEncaminhamento || String(envEncaminhamento).trim() === '') {
            throw new Error('Para o encaminhamento unificado, o número do envelope de encaminhamento/guarda é obrigatório.');
        }
    }

    // =========================================================================
    // PROCESSAMENTO E REGRAS DE LAYOUT
    // =========================================================================
    const isMaconha = (droga === 'maconha' || droga === 'cannabis');
    const isCocaina = !isMaconha;

    const corMaterial = String(dadosForm.cor_material || '').trim();
    if (isCocaina && !corMaterial) {
        throw new Error('A cor/aspecto do material é obrigatória para cocaína.');
    }

    // Tratamento do Envelope de Recebimento (chegada)
    const envelopeRecebimento = dadosForm.envelope_recebimento || dadosForm.numero_envelope || '';
    const temEnvelopeRecebimento = Boolean(String(envelopeRecebimento).trim() !== '');

    let layout = {
        is_cocaina: isCocaina,
        is_maconha: isMaconha,
        is_plural: qtd > 1,
        tem_envelope_recebimento: temEnvelopeRecebimento,
        resultado_positivo: false,
        resultado_negativo: false,
        resultado_inconclusivo: false,
        is_material_fragmentado: tipoEncaminhamento === 'fragmentado',
        tem_cor_material: Boolean(corMaterial),
        tem_imagem: false,
        imagem_vestigio: ''
    };

    const fotoFinal = caminhoFoto || dadosForm.caminho_foto || dadosForm.foto || null;
    const temImagemBoolean = Boolean(fotoFinal && String(fotoFinal).trim() !== '');
    
    layout.tem_imagem = temImagemBoolean;
    if (temImagemBoolean) {
        layout.imagem_vestigio = {
            path: fotoFinal,
            width: 250,
            height: 180
        };
    }

    layout.qtd_involucros = qtd;

    const res = String(dadosForm.resultado || dadosForm.resultado_exame || '').toLowerCase().trim();
    if (res.includes('positivo')) {
        layout.resultado_positivo = true;
    } else if (res.includes('negativo')) {
        layout.resultado_negativo = true;
    } else if (res.includes('inconclusivo')) {
        layout.resultado_inconclusivo = true;
    } else {
        throw new Error('Selecione um resultado preliminar válido.');
    }

    const envelopeEncaminhamentoFinal = dadosForm.envelope_encaminhamento || dadosForm.envelope_todo_material || dadosForm.n_lacre || '________';
    const corFinal = corMaterial;
    const favHeaderFinal = dadosForm.numero_fav || dadosForm.fav || '';

    return {
        ...layout,
        envelope_recebimento: envelopeRecebimento,
        n_lacre: envelopeEncaminhamentoFinal,
        envelope_encaminhamento: envelopeEncaminhamentoFinal,
        numero_fav: favHeaderFinal,
        cor_material: corFinal,
        massa_liquida: dadosForm.massa_liquida,
        extenso_massa: dadosForm.extenso_massa || '',
        
        massa_amostra: dadosForm.massa_amostra || '',
        fav_amostra: dadosForm.fav_amostra || '',
        envelope_amostra: dadosForm.envelope_amostra || ''
    };
}

module.exports = {
    processarDrogas,
    extrairDadosDrogasViaIA
};