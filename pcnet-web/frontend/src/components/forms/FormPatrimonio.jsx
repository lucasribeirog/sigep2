import React, { useState } from 'react';

function InputComSugestoes({ label, value, onChange, sugestoes, placeholder }) {
    const [aberto, setAberto] = useState(false);
    const sugestoesFiltradas = sugestoes.filter(s => 
        s.toLowerCase().includes((value || '').toLowerCase())
    );

    return (
        <div className="relative">
            {label && <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>}
            <div className="relative flex items-center">
                <input 
                    type="text"
                    value={value || ''}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => setAberto(true)}
                    onBlur={() => setTimeout(() => setAberto(false), 200)}
                    placeholder={placeholder}
                    className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white pr-8 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
                <button 
                    type="button"
                    onClick={() => setAberto(!aberto)}
                    className="absolute right-2 text-gray-400 hover:text-gray-600 focus:outline-none px-1 text-xs"
                    title="Ver opções comuns"
                >
                    ▼
                </button>
            </div>

            {aberto && sugestoesFiltradas.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto text-sm">
                    {sugestoesFiltradas.map((item, idx) => (
                        <li 
                            key={idx}
                            onMouseDown={(e) => {
                                e.preventDefault();
                                onChange(item);
                                setAberto(false);
                            }}
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-gray-700 border-b border-gray-50 last:border-none"
                        >
                            {item}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

export default function FormPatrimonio({ form, onChange }) {
    const setFieldValue = (name, value) => {
        onChange({ target: { name, value, type: 'text' } });
    };

    const LISTA_MARCAS = ['Tramontina', 'Tramontina Century', 'Inox', 'Corneta', 'Stainless', 'Não aparente'];
    const LISTA_MATERIAIS = ['plástico', 'madeira', 'polímero', 'borracha', 'metal', 'alumínio'];
    const LISTA_CORES = ['preto', 'marrom', 'prateado', 'branco', 'vermelho', 'amarelo'];
    const LISTA_ABERTURAS = ['manual', 'Assistida (Semiautomática)', 'Automática', 'Flipper'];

    const tipo = form.tipo_objeto;

    return (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 space-y-6">
            
            {/* DADOS BÁSICOS */}
            <div>
                <h3 className="text-md font-bold text-blue-900 border-b pb-2 mb-4">🎯 Dados Básicos do Exame</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de Objeto</label>
                        <select name="tipo_objeto" value={form.tipo_objeto} onChange={onChange} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-sm">
                            <option value="faca">Faca</option>
                            <option value="canivete">Canivete</option>
                            <option value="madeira">Objeto de Madeira / Bastão</option>
                            <option value="outro">Outro Objeto (Coringa Livre)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Conclusão de Eficiência</label>
                        <select name="resultado_eficiencia" value={form.resultado_eficiencia} onChange={onChange} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-sm">
                            <option value="eficiente">Eficiente</option>
                            <option value="ineficiente">Ineficiente</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* FACA (Template específico) */}
            {tipo === 'faca' && (
                <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 space-y-4">
                    <h3 className="text-md font-bold text-blue-900 border-b pb-2">🔪 Características da Faca</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <InputComSugestoes 
                            label="Marca"
                            value={form.marca}
                            onChange={(val) => setFieldValue('marca', val)}
                            sugestoes={LISTA_MARCAS}
                            placeholder="Ex: Tramontina"
                        />
                        <InputComSugestoes 
                            label="Material do Cabo"
                            value={form.material_cabo}
                            onChange={(val) => setFieldValue('material_cabo', val)}
                            sugestoes={LISTA_MATERIAIS}
                            placeholder="Ex: plástico"
                        />
                        <InputComSugestoes 
                            label="Cor do Cabo"
                            value={form.cor_cabo}
                            onChange={(val) => setFieldValue('cor_cabo', val)}
                            sugestoes={LISTA_CORES}
                            placeholder="Ex: preto"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-blue-900 mb-1">Comp. Lâmina (mm)</label>
                            <input type="number" name="comp_lamina" value={form.comp_lamina} onChange={onChange} placeholder="Ex: 150" className="w-full p-2 border border-blue-200 rounded-md bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-blue-900 mb-1">Largura Base (mm)</label>
                            <input type="number" name="largura_base" value={form.largura_base} onChange={onChange} placeholder="Ex: 25" className="w-full p-2 border border-blue-200 rounded-md bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-blue-900 mb-1">Comp. Total (mm)</label>
                            <input type="number" name="comp_total" value={form.comp_total} onChange={onChange} placeholder="Ex: 280" className="w-full p-2 border border-blue-200 rounded-md bg-white text-sm" />
                        </div>
                    </div>
                </div>
            )}

            {/* CANIVETE (Template específico - sem cor do cabo) */}
            {tipo === 'canivete' && (
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-4">
                    <h3 className="text-md font-bold text-indigo-900 border-b pb-2">🗡️ Características do Canivete</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <InputComSugestoes 
                            label="Tipo de Abertura"
                            value={form.tipo_abertura}
                            onChange={(val) => setFieldValue('tipo_abertura', val)}
                            sugestoes={LISTA_ABERTURAS}
                            placeholder="Ex: manual"
                        />
                        <InputComSugestoes 
                            label="Marca"
                            value={form.marca}
                            onChange={(val) => setFieldValue('marca', val)}
                            sugestoes={LISTA_MARCAS}
                            placeholder="Ex: Inox"
                        />
                        <InputComSugestoes 
                            label="Material do Cabo"
                            value={form.material_cabo}
                            onChange={(val) => setFieldValue('material_cabo', val)}
                            sugestoes={LISTA_MATERIAIS}
                            placeholder="Ex: metal"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-indigo-900 mb-1">Comp. da Lâmina (mm)</label>
                            <input type="number" name="comp_lamina" value={form.comp_lamina} onChange={onChange} placeholder="Ex: 90" className="w-full p-2 border border-indigo-200 rounded-md bg-white text-sm" />
                        </div>
                    </div>
                </div>
            )}

            {/* MADEIRA */}
            {tipo === 'madeira' && (
                <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 space-y-4">
                    <h3 className="text-md font-bold text-amber-900 border-b pb-2">🪵 Características da Peça de Madeira</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-amber-900 mb-1">Seção</label>
                            <input type="text" name="secao_madeira" value={form.secao_madeira} onChange={onChange} placeholder="Ex: cilíndrica" className="w-full p-2 border border-amber-200 rounded-md bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-amber-900 mb-1">Espessura/Larg (mm)</label>
                            <input type="number" name="larg_madeira" value={form.larg_madeira} onChange={onChange} placeholder="Ex: 40" className="w-full p-2 border border-amber-200 rounded-md bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-amber-900 mb-1">Comp. Total (mm)</label>
                            <input type="number" name="comp_total" value={form.comp_total} onChange={onChange} placeholder="Ex: 500" className="w-full p-2 border border-amber-200 rounded-md bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-amber-900 mb-1">Massa (gramas)</label>
                            <input type="number" name="massa" value={form.massa} onChange={onChange} placeholder="Ex: 350" className="w-full p-2 border border-amber-200 rounded-md bg-white text-sm" />
                        </div>
                    </div>
                </div>
            )}

            {/* OUTRO OBJETO */}
            {tipo === 'outro' && (
                <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 space-y-4">
                    <h3 className="text-md font-bold text-purple-900 border-b pb-2">📦 Especificação do Objeto (Livre)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-purple-900 mb-1">Nome do Objeto</label>
                            <input type="text" name="nome_objeto" value={form.nome_objeto} onChange={onChange} placeholder="Ex: barra de ferro" className="w-full p-2 border border-purple-200 rounded-md bg-white text-sm" />
                        </div>
                        <InputComSugestoes 
                            label="Material Predominante"
                            value={form.material_predominante}
                            onChange={(val) => setFieldValue('material_predominante', val)}
                            sugestoes={LISTA_MATERIAIS}
                            placeholder="Ex: aço"
                        />
                        <InputComSugestoes 
                            label="Cor Predominante"
                            value={form.cor_objeto}
                            onChange={(val) => setFieldValue('cor_objeto', val)}
                            sugestoes={LISTA_CORES}
                            placeholder="Ex: cinza"
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-purple-900 mb-1">Comprimento (cm)</label>
                            <input type="text" name="compr_objeto" value={form.compr_objeto} onChange={onChange} placeholder="Ex: 40,0" className="w-full p-2 border border-purple-200 rounded-md bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-purple-900 mb-1">Largura (cm)</label>
                            <input type="text" name="larg_objeto" value={form.larg_objeto} onChange={onChange} placeholder="Ex: 3,0" className="w-full p-2 border border-purple-200 rounded-md bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-purple-900 mb-1">Espessura (cm)</label>
                            <input type="text" name="espessura_objeto" value={form.espessura_objeto} onChange={onChange} placeholder="Ex: 0,5" className="w-full p-2 border border-purple-200 rounded-md bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-purple-900 mb-1">Massa</label>
                            <input type="text" name="massa_objeto" value={form.massa_objeto} onChange={onChange} placeholder="Ex: 500 g" className="w-full p-2 border border-purple-200 rounded-md bg-white text-sm" />
                        </div>
                    </div>
                </div>
            )}

            {/* CUSTÓDIA */}
            <div>
                <h3 className="text-md font-bold text-blue-900 border-b pb-2 mb-4">🚨 Custódia e Rastreabilidade</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Nº do Lacre</label>
                        <input type="text" name="n_lacre" value={form.n_lacre} onChange={onChange} placeholder="Ex: 998877" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Nº do FAV</label>
                        <input type="text" name="n_fav" value={form.n_fav} onChange={onChange} placeholder="Ex: FAV-2026/001" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Unidade de Custódia</label>
                        <input type="text" name="unidade_custodia" value={form.unidade_custodia} onChange={onChange} placeholder="Ex: Delegacia" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" />
                    </div>
                </div>
            </div>

        </div>
    );
}