import React, { useState } from 'react';
import api from '../api/pcnet';
import FormBalistica from './forms/FormBalistica';
import FormPatrimonio from './forms/FormPatrimonio';
import FormDrogas from './forms/FormDrogas'; // 🎯 Nova importação

export default function GeradorLaudo({ especieInicial = '', dadosIniciaisIA = null, fotoObjetoInicial = null }) {
    const [especie, setEspecie] = useState(especieInicial);
    const [arquivoPcnet, setArquivoPcnet] = useState(null);
    const [fotoObjeto] = useState(fotoObjetoInicial); 
    const [loading, setLoading] = useState(false);

    // 🎯 1. NOVOS ESTADOS PARA O MODAL DA FAV DETECTADA
    const [mostrarModalFav, setMostrarModalFav] = useState(false);
    const [numeroFav, setNumeroFav] = useState('');
    const [novoLacreFav, setNovoLacreFav] = useState('');
    const [carregandoFav, setCarregandoFav] = useState(false);

    const [form, setForm] = useState({
        // === CAMPOS BALÍSTICA E PATRIMÔNIO ===
        tipo_material: dadosIniciaisIA?.tipo_material || 'revolver',
        pertence_pm: false,
        instituicao_carga: 'Polícia Militar do Estado de Minas Gerais',
        resultado_exame: 'eficiente',
        destino: 'custodia',
        calibre: dadosIniciaisIA?.calibre || '',
        marca: dadosIniciaisIA?.marca || '',
        modelo: dadosIniciaisIA?.modelo || '',
        numero_serie: '',
        acabamento: dadosIniciaisIA?.acabamento || 'oxidado',
        comprimento_cano: dadosIniciaisIA?.comprimento_cano || '',
        comprimento_total: dadosIniciaisIA?.comprimento_total || '',
        capacidade: dadosIniciaisIA?.capacidade || '',
        n_lacre: '',
        municoes: [{ quantidade: dadosIniciaisIA?.qtd_municao || '', calibre: dadosIniciaisIA?.calibre || '', marca: dadosIniciaisIA?.marca || '' }],
        defeito_constatado: 'mecanismo de disparo emperrado',
        tipo_acao_carabina: 'repetição (não automática)',
        detalhes_coronha: 'coronha e telha em madeira',
        sistema_alimentacao: 'sistema próprio',
        empunhadura_revolver: dadosIniciaisIA?.empunhadura_revolver || '', 
        carregador_info: dadosIniciaisIA?.carregador_info ||'acompanhada de um carregador compatível',
        detalhes_armacao: dadosIniciaisIA?.detalhes_armacao || '',
        detalhes_fuzil: 'coronha rebatível e empunhadura em polímero',
        qtd_municao: dadosIniciaisIA?.qtd_municao || '02 (dois)',
        nome_arma_livre: '',
        descricao_livre: '',
        tipo_objeto: 'faca',
        resultado_eficiencia: 'eficiente',
        n_fav: '',
        unidade_custodia: '',
        material_cabo: '',
        cor_cabo: '',
        comp_lamina: '',
        largura_base: '',
        comp_total: '',
        tipo_abertura: '',
        secao_madeira: '',
        comp_madeira: '',
        larg_madeira: '',
        massa: '',
        nome_objeto: '',
        material_predominante: '',
        cor_objeto: '',
        compr_objeto: '',
        larg_objeto: '',
        espessura_objeto: '',
        massa_objeto: '',

        // === 🎯 NOVOS CAMPOS: LAUDO DE DROGAS ===
        droga: dadosIniciaisIA?.droga || 'cocaina',
        cor_material: dadosIniciaisIA?.cor_material || 'branca',
        qtd_involucros: dadosIniciaisIA?.qtd_involucros || '',
        massa_liquida: dadosIniciaisIA?.massa_liquida || '',
        extenso_massa: '',
        envelope_recebimento: dadosIniciaisIA?.envelope_recebimento || '',
        resultado: dadosIniciaisIA?.resultado || 'positivo',
        tipo_encaminhamento: 'unificado',
        envelope_encaminhamento: '',
        massa_amostra: '',
        fav_amostra: '',
        envelope_amostra: ''
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm({
            ...form,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const handleSubmeterLaudo = async (formatoDesejado) => {
        if (!especie || !arquivoPcnet) {
            alert('Por favor, selecione a espécie e o arquivo .docx original do PCNet.');
            return;
        }

        // 🛡️ Validação nativa do HTML5 (avisa e aponta o campo em falta)
        const formElement = document.querySelector('form');
        if (formElement && !formElement.reportValidity()) {
            return; // Interrompe o envio se houver campos obrigatórios vazios
        }

        const formData = new FormData();
        formData.append('arquivo_pcnet', arquivoPcnet); 
        formData.append('especie', especie);
        formData.append('dadosForm', JSON.stringify(form));

        if (fotoObjeto) {
            formData.append('foto_objeto', fotoObjeto);
        }

        const rotaEndpoint = formatoDesejado === 'pdf' ? '/gerar-laudo-pdf' : '/gerar-laudo';
        const mimetypeRetorno = formatoDesejado === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        try {
            setLoading(true);
            const response = await api.post(rotaEndpoint, formData, { responseType: 'blob' });

            const extensao = formatoDesejado === 'pdf' ? 'pdf' : 'docx';
            const fileName = arquivoPcnet ? arquivoPcnet.name.replace(/\.[^/.]+$/, `.${extensao}`) : `laudo_oficial.${extensao}`;

            const blob = new Blob([response.data], { type: mimetypeRetorno });
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = fileName;
            link.click();
            link.remove();

            const favDetectada = response.headers['x-fav-detectada'] || response.headers['X-Fav-Detectada'];

            if (favDetectada) {
                setNumeroFav(favDetectada);
                setMostrarModalFav(true); 
            } else {
                alert(`Laudo em ${extensao.toUpperCase()} gerado com sucesso!`);
            }

        } catch (error) {
            console.error('Erro ao gerar laudo:', error);
            alert('Erro ao processar o laudo no servidor.');
        } finally {
            setLoading(false);
        }
    };

    // 🎯 4. FUNÇÃO QUE CHAMA A AUTOMAÇÃO DO PCNET QUANDO O PERITO CLICA EM "SIM"
    const confirmarMovimentacaoFav = async () => {
        if (!numeroFav) {
            alert('Número da FAV inválido.');
            return;
        }

        const usuarioLogado = JSON.parse(localStorage.getItem('usuario') || '{}');
        const cpfPerito = usuarioLogado.cpf || localStorage.getItem('cpf_perito') || '';

        setCarregandoFav(true);
        try {
            await api.post('/pcnet/movimentar-fav-examePericial', {
                numeroFav: numeroFav,
                novoLacre: novoLacreFav || null,
                cpf: cpfPerito
            });

            alert('FAV movimentada e custódia atualizada com sucesso no PCNet!');
            setMostrarModalFav(false);
            setNovoLacreFav('');
        } catch (error) {
            alert('Erro na automação do PCNet: ' + (error.response?.data?.erro || error.message));
        } finally {
            setCarregandoFav(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 bg-white shadow-lg rounded-xl border border-gray-100 relative">
            <div className="mb-8 border-b pb-4 flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Elaboração e Emissão de Laudos</h2>
                    <p className="text-sm text-gray-500 mt-1">Preencha os dados periciais para injeção automática no modelo do PCNet.</p>
                </div>
                {fotoObjeto && (
                    <span className="bg-sky-50 text-sky-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-sky-200">
                        📷 Foto Vinculada (Modo com Foto)
                    </span>
                )}
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-6">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Espécie Pericial</label>
                    <select 
                        value={especie} 
                        onChange={(e) => setEspecie(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-sm"
                        
                    >
                        <option value="">-- Selecione a Espécie --</option>
                        <option value="Eficiencia Armas de Fogo e/ou municoes">Eficiência de Arma de Fogo e Munição (Balística)</option>
                        <option value="Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem">Eficiência e Prestabilidade de Objeto (Patrimônio)</option>
                        <option value="Laudo Preliminar de Constatação de Drogas">Laudo Preliminar de Constatação de Drogas</option> {/* 🎯 Nova Espécie */}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Documento Base do PCNet (.docx)</label>
                    <input 
                        type="file" 
                        accept=".docx" 
                        onChange={(e) => setArquivoPcnet(e.target.files[0])}
                        className="w-full p-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                        
                    />
                </div>

                {especie === 'Eficiencia Armas de Fogo e/ou municoes' && (
                    <FormBalistica form={form} onChange={handleChange} />
                )}

                {especie === 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem' && (
                    <FormPatrimonio form={form} onChange={handleChange} />
                )}

                {especie === 'Laudo Preliminar de Constatação de Drogas' && (
                    <FormDrogas dados={form} onChange={handleChange} /> 
                )} {/* 🎯 Novo Componente */}

                {especie && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                        <button 
                            type="button"
                            onClick={() => handleSubmeterLaudo('docx')}
                            disabled={loading}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold p-3.5 rounded-lg transition shadow-xs disabled:bg-gray-300 cursor-pointer flex items-center justify-center gap-2 text-sm"
                        >
                            {loading ? 'Processando...' : '📄 Baixar Word (.docx)'}
                        </button>

                        <button 
                            type="button"
                            onClick={() => handleSubmeterLaudo('pdf')}
                            disabled={loading}
                            className="bg-[#0284C7] hover:bg-[#0284C7]/90 text-white font-semibold p-3.5 rounded-lg transition shadow-md disabled:bg-gray-400 cursor-pointer flex items-center justify-center gap-2 text-sm"
                        >
                            {loading ? 'Convertendo via LibreOffice...' : '📑 Baixar PDF Oficial (.pdf)'}
                        </button>
                    </div>
                )}
            </form>

            {/* 🎯 5. MODAL / BALÃO DE PERGUNTA DA FAV QUE APARECE APÓS O DOWNLOAD */}
            {mostrarModalFav && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-md border border-gray-100 space-y-4">
                        <div className="text-center">
                            <span className="text-3xl">🚀</span>
                            <h3 className="text-lg font-bold text-gray-900 mt-2">Laudo gerado e baixado!</h3>
                            <p className="text-sm text-gray-600 mt-1">
                                Detectamos a FAV <strong className="text-blue-600">{numeroFav}</strong> no cabeçalho. Deseja movimentá-la automaticamente no PCNet?
                            </p>
                        </div>

                        <div className="space-y-3 pt-2">
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Número da FAV</label>
                                <input 
                                    type="text" 
                                    value={numeroFav} 
                                    onChange={(e) => setNumeroFav(e.target.value)} 
                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-gray-50 font-bold" 
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-gray-700 mb-1">Novo Lacre (Opcional - Se houve rompimento)</label>
                                <input 
                                    type="text" 
                                    value={novoLacreFav} 
                                    onChange={(e) => setNovoLacreFav(e.target.value)} 
                                    placeholder="Ex: 998877" 
                                    className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none" 
                                />
                            </div>
                        </div>

                        <div className="flex space-x-3 pt-3">
                            <button 
                                type="button"
                                onClick={() => setMostrarModalFav(false)}
                                disabled={carregandoFav}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-2 px-4 rounded-lg text-sm transition cursor-pointer"
                            >
                                Não, obrigado
                            </button>
                            <button 
                                type="button"
                                onClick={confirmarMovimentacaoFav}
                                disabled={carregandoFav}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg text-sm transition flex items-center justify-center cursor-pointer disabled:opacity-50"
                            >
                                {carregandoFav ? 'Movimentando...' : 'Sim, movimentar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}