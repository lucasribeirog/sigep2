import React, { useState } from 'react';

export default function GeradorLaudo() {
    const [documento, setDocumento] = useState(null);
    const [tipoObjeto, setTipoObjeto] = useState('faca');
    const [loading, setLoading] = useState(false);
    
    const [dadosForm, setDadosForm] = useState({
        marca: '',
        material_cabo: 'plástico',
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
        n_lacre: '',
        n_fav: '',
        unidade_custodia: '',
        eficiente: 'sim'
    });

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setDadosForm(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        setDocumento(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!documento) {
            alert('Por favor, anexe o documento original do PCNet.');
            return;
        }

        setLoading(true);

        const formData = new FormData();
        formData.append('documento', documento);
        formData.append('tipo_objeto', tipoObjeto);

        Object.keys(dadosForm).forEach(key => {
            if (dadosForm[key]) {
                formData.append(key, dadosForm[key]);
            }
        });

        try {
            const response = await fetch('http://localhost:3000/api/gerar-laudo', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const erroData = await response.json();
                throw new Error(erroData.erro || 'Erro interno no servidor.');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `laudo_${tipoObjeto}_pronto.docx`;
            
            document.body.appendChild(a);
            a.click();
            
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            
            alert('✅ Laudo gerado com sucesso!');

        } catch (error) {
            alert('❌ Erro ao gerar laudo: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const inputClass = "w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all text-sm text-slate-800 shadow-sm";
    const labelClass = "block text-sm font-semibold text-slate-700 mb-1.5";

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <div className="mb-8 text-center">
                <h2 className="text-2xl font-bold text-slate-800">Gerador de Laudo Pericial</h2>
                <p className="text-sm text-slate-500 mt-1">Preencha os dados abaixo para estruturar e preencher o documento final.</p>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-6">
                
                {/* 1. DOCUMENTO ORIGINAL */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <label className={labelClass}>1. Documento Original (Baixado do PCNet)</label>
                    <input 
                        type="file" 
                        accept=".docx" 
                        onChange={handleFileChange} 
                        required 
                        className="block w-full text-sm text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 cursor-pointer" 
                    />
                </div>

                {/* 2. TIPO DE OBJETO */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <label className={labelClass}>2. Tipo de Material Examinado</label>
                    <select 
                        value={tipoObjeto} 
                        onChange={(e) => setTipoObjeto(e.target.value)}
                        className={inputClass}
                    >
                        <option value="faca">Faca</option>
                        <option value="canivete">Canivete</option>
                        <option value="madeira">Peça de Madeira</option>
                        <option value="outro">Outro (Genérico)</option>
                    </select>
                </div>

                {/* 3. CARACTERÍSTICAS DINÂMICAS */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
                    <h3 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-2">Características Específicas do Objeto</h3>
                    
                    {/* FACA OU CANIVETE */}
                    {(tipoObjeto === 'faca' || tipoObjeto === 'canivete') && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Marca</label>
                                <input type="text" name="marca" placeholder="Ex: Tramontina" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Material do Cabo</label>
                                <select name="material_cabo" onChange={handleInputChange} value={dadosForm.material_cabo} className={inputClass}>
                                    <option value="plástico">Plástico</option>
                                    <option value="madeira">Madeira</option>
                                    <option value="metal">Metal</option>
                                    <option value="osso">Osso/Chifre</option>
                                    <option value="material sintético">Material Sintético</option>
                                </select>
                            </div>
                            <div>
                                <label className={labelClass}>Cor do Cabo</label>
                                <input type="text" name="cor_cabo" placeholder="Ex: preta" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Comprimento da Lâmina (mm)</label>
                                <input type="number" name="comp_lamina" placeholder="Ex: 120" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Comprimento Total (mm)</label>
                                <input type="number" name="comp_total" placeholder="Ex: 220" onChange={handleInputChange} className={inputClass} />
                            </div>
                            
                            {tipoObjeto === 'faca' && (
                                <div>
                                    <label className={labelClass}>Largura na Base (mm)</label>
                                    <input type="number" name="largura_base" placeholder="Ex: 40" onChange={handleInputChange} className={inputClass} />
                                </div>
                            )}
                            
                            {tipoObjeto === 'canivete' && (
                                <div>
                                    <label className={labelClass}>Tipo de Abertura</label>
                                    <input type="text" name="tipo_abertura" placeholder="Ex: mola" onChange={handleInputChange} className={inputClass} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* MADEIRA */}
                    {tipoObjeto === 'madeira' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Seção da Madeira</label>
                                <input type="text" name="secao_madeira" placeholder="Ex: quadrada/retangular" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Comprimento (mm)</label>
                                <input type="number" name="comp_madeira" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Largura (mm)</label>
                                <input type="number" name="larg_madeira" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Massa (gramas)</label>
                                <input type="number" name="massa" onChange={handleInputChange} className={inputClass} />
                            </div>
                        </div>
                    )}

                    {/* OUTROS */}
                    {tipoObjeto === 'outro' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className={labelClass}>Nome do Objeto</label>
                                <input type="text" name="nome_objeto" placeholder="Ex: Barra de ferro" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Marca</label>
                                <input type="text" name="marca" placeholder="Deixe em branco se não houver" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Material Predominante</label>
                                <input type="text" name="material_predominante" placeholder="Ex: Metal" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Cor</label>
                                <input type="text" name="cor_objeto" placeholder="Ex: Cinza" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Comprimento (cm)</label>
                                <input type="text" name="compr_objeto" placeholder="Ex: 100" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Largura (cm)</label>
                                <input type="text" name="larg_objeto" placeholder="Ex: 20" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Espessura / Altura (cm)</label>
                                <input type="text" name="espessura_objeto" placeholder="Ex: 5" onChange={handleInputChange} className={inputClass} />
                            </div>
                            <div>
                                <label className={labelClass}>Massa</label>
                                <input type="text" name="massa_objeto" placeholder="Ex: 1kg ou 500 gramas" onChange={handleInputChange} className={inputClass} />
                            </div>
                        </div>
                    )}
                </div>

                {/* 4. DADOS DE CUSTÓDIA E CONCLUSÃO */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4">
                    <h3 className="text-base font-bold text-slate-800 border-b border-slate-200 pb-2">Custódia e Conclusão Pericial</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className={labelClass}>Nº do Lacre de Segurança</label>
                            <input type="text" name="n_lacre" placeholder="Ex: 1234567" onChange={handleInputChange} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Nº da FAV</label>
                            <input type="text" name="n_fav" placeholder="Ex: 2128447" onChange={handleInputChange} className={inputClass} />
                        </div>
                        <div>
                            <label className={labelClass}>Unidade de Custódia</label>
                            <input type="text" name="unidade_custodia" placeholder="Ex: Pedra Azul-MG" onChange={handleInputChange} className={inputClass} />
                        </div>
                    </div>

                    <div>
                        <label className={labelClass}>O objeto é eficiente para ofender a integridade física?</label>
                        <select name="eficiente" onChange={handleInputChange} value={dadosForm.eficiente} className={inputClass}>
                            <option value="sim">Sim (Eficiente)</option>
                            <option value="nao">Não (Ineficiente / Quebrado)</option>
                        </select>
                    </div>
                </div>

                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl shadow-lg transition-all transform hover:-translate-y-0.5 cursor-pointer disabled:bg-slate-400"
                >
                    {loading ? '⚙️ Processando XML e Gerando Laudo...' : '📄 GERAR LAUDO E BAIXAR'}
                </button>
            </form>
        </div>
    );
}