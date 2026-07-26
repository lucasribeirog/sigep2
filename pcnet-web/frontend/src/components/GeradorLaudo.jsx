import React, { useState } from 'react';
import api from '../api/pcnet';
import FormBalistica from './forms/FormBalistica';
import FormPatrimonio from './forms/FormPatrimonio';

export default function GeradorLaudo({ especieInicial = '' }) {
    const [especie, setEspecie] = useState(especieInicial);
    const [arquivoPcnet, setArquivoPcnet] = useState(null);
    const [loading, setLoading] = useState(false);

    // Estado unificado com todas as chaves esperadas pelos services do backend
    const [form, setForm] = useState({
        // === BALÍSTICA ===
        tipo_material: 'revolver',
        pertence_pm: false,
        instituicao_carga: 'Polícia Militar do Estado de Minas Gerais',
        resultado_exame: 'eficiente',
        destino: 'custodia',
        calibre: '',
        marca: '',
        modelo: '',
        numero_serie: '',
        acabamento: 'oxidado',
        comprimento_cano: '',
        comprimento_total: '',
        capacidade: '',
        n_lacre: '',
        municoes: [{ quantidade: '', calibre: '', marca: '' }], // <--- ADICIONADO AQUI
        defeito_constatado: 'mecanismo de disparo emperrado',
        tipo_acao_carabina: 'repetição (não automática)',
        detalhes_coronha: 'coronha e telha em madeira',
        sistema_alimentacao: 'sistema próprio',
        empunhadura_revolver: '', 
        carregador_info: 'acompanhada de um carregador compatível',
        detalhes_armacao: '',
        detalhes_fuzil: 'coronha rebatível e empunhadura em polímero',
        qtd_municao: '02 (dois)',
        nome_arma_livre: '',
        descricao_livre: '',

        // === PATRIMÔNIO (Eficiência de Objeto) ===
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
        massa_objeto: ''
    });

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm({
            ...form,
            [name]: type === 'checkbox' ? checked : value
        });
    };

    const handleFileChange = (e) => {
        setArquivoPcnet(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!especie || !arquivoPcnet) {
            alert('Por favor, selecione a espécie e o arquivo .docx original.');
            return;
        }

        const formData = new FormData();
        formData.append('arquivo_pcnet', arquivoPcnet); 
        formData.append('especie', especie);
        formData.append('dadosForm', JSON.stringify(form));

        try {
            setLoading(true);
            const response = await api.post('/gerar-laudo', formData, { responseType: 'blob' });

            const fileName = arquivoPcnet ? arquivoPcnet.name : 'laudo_oficial.docx';

            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
            const link = document.createElement('a');
            link.href = window.URL.createObjectURL(blob);
            link.download = fileName;
            link.click();

            const nomeEspecieExibicao = especie.includes('Arma') ? 'Balística' : 'Patrimônio';
            const novoHistorico = {
                id: Date.now(),
                especie: nomeEspecieExibicao,
                data: new Date().toLocaleString('pt-BR'),
                arquivo: fileName,
                status: 'Concluído'
            };
            const historicoAntigo = JSON.parse(localStorage.getItem('historico_laudos') || '[]');
            localStorage.setItem('historico_laudos', JSON.stringify([novoHistorico, ...historicoAntigo]));

            alert('Laudo gerado e baixado com sucesso!');
        } catch (error) {
            console.error('Erro ao gerar laudo:', error);
            
            if (error.response && error.response.data instanceof Blob) {
                const reader = new FileReader();
                reader.onload = () => {
                    try {
                        const resJson = JSON.parse(reader.result);
                        alert('Erro do Servidor: ' + (resJson.erro || JSON.stringify(resJson)));
                    } catch (e) {
                        alert('Erro ao processar o laudo no servidor.');
                    }
                };
                reader.readAsText(error.response.data);
            } else {
                alert('Erro: ' + (error.response?.data?.erro || error.message));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 bg-white shadow-lg rounded-xl border border-gray-100">
            <div className="mb-8 border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-800">Elaboração e Emissão de Laudos</h2>
                <p className="text-sm text-gray-500 mt-1">Preencha os dados periciais para injeção automática no modelo do PCNet.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* 1. SELEÇÃO DA ESPÉCIE */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Espécie Pericial</label>
                    <select 
                        value={especie} 
                        onChange={(e) => setEspecie(e.target.value)}
                        className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white text-sm"
                        required
                    >
                        <option value="">-- Selecione a Espécie --</option>
                        <option value="Eficiencia Armas de Fogo e/ou municoes">Eficiência de Arma de Fogo e Munição (Balística)</option>
                        <option value="Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem">Eficiência e Prestabilidade de Objeto (Patrimônio)</option>
                    </select>
                </div>

                {/* 2. UPLOAD DO ARQUIVO .DOCX DO PCNET */}
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Documento Base do PCNet (.docx)</label>
                    <input 
                        type="file" 
                        accept=".docx" 
                        onChange={handleFileChange}
                        className="w-full p-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                        required
                    />
                </div>

                {/* 3A. FORMULÁRIO DE BALÍSTICA (Renderiza o componente isolado) */}
                {especie === 'Eficiencia Armas de Fogo e/ou municoes' && (
                    <FormBalistica form={form} onChange={handleChange} />
                )}

                {/* 3B. FORMULÁRIO DE PATRIMÔNIO (Renderiza o componente isolado) */}
                {especie === 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem' && (
                    <FormPatrimonio form={form} onChange={handleChange} />
                )}

                {/* BOTÃO DE AÇÃO */}
                {especie && (
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold p-3.5 rounded-lg transition shadow-md disabled:bg-gray-400 cursor-pointer"
                    >
                        {loading ? 'Processando Documento no Servidor...' : 'Gerar e Baixar Laudo Oficial'}
                    </button>
                )}

            </form>
        </div>
    );
}