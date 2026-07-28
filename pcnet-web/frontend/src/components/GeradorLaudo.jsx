import React, { useState } from 'react';
import api from '../api/pcnet';
import FormBalistica from './forms/FormBalistica';
import FormPatrimonio from './forms/FormPatrimonio';

export default function GeradorLaudo({ especieInicial = '', dadosIniciaisIA = null, fotoObjetoInicial = null }) {
    const [especie, setEspecie] = useState(especieInicial);
    const [arquivoPcnet, setArquivoPcnet] = useState(null);
    const [fotoObjeto] = useState(fotoObjetoInicial); // Mantém a foto que veio do modal (se houver)
    const [loading, setLoading] = useState(false);

    const [form, setForm] = useState({
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
        massa_objeto: ''
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

        const formData = new FormData();
        formData.append('arquivo_pcnet', arquivoPcnet); 
        formData.append('especie', especie);
        formData.append('dadosForm', JSON.stringify(form));

        // Se colocou a foto no modal (seja para IA ou manual), ela vai na requisição!
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

            alert(`Laudo em ${extensao.toUpperCase()} gerado com sucesso!`);
        } catch (error) {
            console.error('Erro ao gerar laudo:', error);
            alert('Erro ao processar o laudo no servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-8 bg-white shadow-lg rounded-xl border border-gray-100">
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
                        required
                    >
                        <option value="">-- Selecione a Espécie --</option>
                        <option value="Eficiencia Armas de Fogo e/ou municoes">Eficiência de Arma de Fogo e Munição (Balística)</option>
                        <option value="Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem">Eficiência e Prestabilidade de Objeto (Patrimônio)</option>
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Documento Base do PCNet (.docx)</label>
                    <input 
                        type="file" 
                        accept=".docx" 
                        onChange={(e) => setArquivoPcnet(e.target.files[0])}
                        className="w-full p-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                        required
                    />
                </div>

                {especie === 'Eficiencia Armas de Fogo e/ou municoes' && (
                    <FormBalistica form={form} onChange={handleChange} />
                )}

                {especie === 'Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem' && (
                    <FormPatrimonio form={form} onChange={handleChange} />
                )}

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
        </div>
    );
}