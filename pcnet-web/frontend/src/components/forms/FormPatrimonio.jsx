import React from 'react';

export default function FormPatrimonio({ form, onChange }) {
    return (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 space-y-5 animate-fadeIn">
            <h3 className="text-md font-bold text-blue-900 border-b pb-2">
                ⚖️ Parâmetros de Prestabilidade de Objeto (Patrimônio)
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de Objeto</label>
                    <select name="tipo_objeto" value={form.tipo_objeto} onChange={onChange} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white text-sm">
                        <option value="faca">Faca</option>
                        <option value="canivete">Canivete</option>
                        <option value="madeira">Objeto de Madeira / Bastão</option>
                        <option value="outro">Outro Objeto</option>
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

            {(form.tipo_objeto === 'faca' || form.tipo_objeto === 'canivete') && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                    <div>
                        <label className="block text-xs font-semibold text-blue-900 mb-1">Marca</label>
                        <input type="text" name="marca" value={form.marca} onChange={onChange} placeholder="Ex: Tramontina" className="w-full p-2 border border-blue-200 rounded-md bg-white text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-blue-900 mb-1">Material do Cabo</label>
                        <input type="text" name="material_cabo" value={form.material_cabo} onChange={onChange} placeholder="Ex: plástico" className="w-full p-2 border border-blue-200 rounded-md bg-white text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-blue-900 mb-1">Comprimento da Lâmina</label>
                        <input type="text" name="comp_lamina" value={form.comp_lamina} onChange={onChange} placeholder="Ex: 15,0 cm" className="w-full p-2 border border-blue-200 rounded-md bg-white text-sm" />
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t">
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
    );
}