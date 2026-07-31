import React, { useState } from 'react';

// Componente reutilizável de Input com Sugestões Visíveis e Filtráveis
function InputComSugestoes({ label, value, onChange, sugestoes, placeholder, rightElement }) {
    const [aberto, setAberto] = useState(false);
    const sugestoesFiltradas = sugestoes.filter(s => 
        s.toLowerCase().includes((value || '').toLowerCase())
    );

    return (
        <div className="relative">
            {label && (
                <div className="block text-xs font-semibold text-gray-600 mb-1 flex justify-between items-center">
                    <span>{label}</span>
                    {rightElement}
                </div>
            )}
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
                                e.preventDefault(); // Evita que o blur feche antes do clique
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

export default function FormBalistica({ form, onChange }) {
    const setFieldValue = (name, value) => {
        onChange({ target: { name, value, type: 'text' } });
    };

    const isMunicao = form.tipo_material === 'municao_isolada';
    const isCoringa = form.tipo_material === 'coringa' || form.tipo_material === 'outro';

    // Listas de sugestões periciais comuns
    const LISTA_CALIBRES = ['.38 SPL', '.380 Auto', '9mm Luger', '.40 S&W', '.45 ACP', '.357 Magnum', '12 GA', '.22 Long Rifle', '7.62x39mm', '5.56x45mm NATO'];
    const LISTA_MARCAS = ['Taurus', 'CBC', 'Glock', 'Imbel', 'Beretta', 'Rossi', 'Smith & Wesson', 'CZ', 'Remington', 'Colt'];
    const LISTA_MODELOS = ['não aparente', 'RT 82', 'RT 85', 'G2C', 'G3', 'MD1', 'PT 940', 'PT 100'];
    
    // Novas listas para Carabina
    const LISTA_ACOES_CARABINA = ['repetição (não automática)', 'semiautomática', 'ação por ferrolho (bolt-action)', 'ação por alavanca (lever-action)', 'ação por bomba (pump-action)'];
    const LISTA_CORONHAS = ['coronha e telha em madeira', 'coronha em polímero preto', 'coronha rebatível em metal', 'coronha telescópica em polímero'];
    const LISTA_SISTEMA_ALIMENTACAO = ['sistema próprio', 'carregador tubular', 'carregador destacável', 'carregador fixo'];

    const handleMunicaoChange = (index, field, value) => {
        const novasMunicoes = [...(form.municoes || [])];
        novasMunicoes[index][field] = value;
        onChange({ target: { name: 'municoes', value: novasMunicoes, type: 'array' } });
    };

    const adicionarMunicao = () => {
        const novasMunicoes = [...(form.municoes || []), { quantidade: 1, calibre: '', marca: '' }];
        onChange({ target: { name: 'municoes', value: novasMunicoes, type: 'array' } });
    };

    const removerMunicao = (index) => {
        const novasMunicoes = form.municoes.filter((_, i) => i !== index);
        onChange({ target: { name: 'municoes', value: novasMunicoes, type: 'array' } });
    };

    return (
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 space-y-6">
            
            {/* DADOS BÁSICOS */}
            <div>
                <h3 className="text-md font-bold text-blue-900 border-b pb-2 mb-4">🎯 Dados Básicos</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo de Material</label>
                        <select 
                            name="tipo_material" 
                            value={form.tipo_material || ''} 
                            onChange={onChange}
                            className="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm"
                        >
                            <option value="">Selecione...</option>
                            <option value="revolver">Revólver</option>
                            <option value="pistola">Pistola</option>
                            <option value="carabina">Carabina</option>
                            <option value="fuzil">Fuzil</option>
                            <option value="municao_isolada">Munição Isolada</option>
                            <option value="coringa">Coringa / Outro (Livre)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-600 mb-1">Resultado do Exame</label>
                        <select 
                            name="resultado_exame" 
                            value={form.resultado_exame || ''} 
                            onChange={onChange} 
                            className="w-full p-2 border border-gray-300 rounded-lg bg-white text-sm"
                        >
                            <option value="">Selecione o resultado...</option>
                            {!isMunicao ? (
                                <>
                                    <option value="eficiente">Eficiente</option>
                                    <option value="ineficiente">Ineficiente</option>
                                    <option value="nao_calcou">Não Calçou</option>
                                    <option value="rajada">Rajada</option>
                                </>
                            ) : (
                                <>
                                    <option value="municao_eficiente">Eficiente (Munição)</option>
                                    <option value="municao_ineficiente">Ineficiente (Munição)</option>
                                </>
                            )}
                        </select>
                    </div>
                </div>
            </div>

            {/* CORINGA */}
            {isCoringa && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 space-y-4">
                    <h3 className="text-md font-bold text-blue-900 border-b pb-2">🛠️ Especificação da Arma (Livre)</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-blue-900 mb-1">Nome da Arma</label>
                            <input type="text" name="nome_arma_livre" value={form.nome_arma_livre || ''} onChange={onChange} placeholder="Ex: garrucha artesanal" className="w-full p-2 border border-blue-200 rounded-md bg-white text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-blue-900 mb-1">Descrição / Acabamento</label>
                            <input type="text" name="descricao_livre" value={form.descricao_livre || ''} onChange={onChange} placeholder="Ex: coronha em madeira" className="w-full p-2 border border-blue-200 rounded-md bg-white text-sm" />
                        </div>
                    </div>
                </div>
            )}

            {/* MUNIÇÃO ISOLADA OU ARMAS */}
            {isMunicao ? (
                <div className="bg-white p-4 rounded-xl border border-blue-200 space-y-4 shadow-sm">
                    <div className="flex justify-between items-center border-b pb-2">
                        <h3 className="text-md font-bold text-blue-900">📦 Lotes de Munições Encaminhadas</h3>
                        <button type="button" onClick={adicionarMunicao} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700 transition cursor-pointer">
                            + Adicionar Outro Lote / Calibre
                        </button>
                    </div>

                    {(form.municoes || []).map((mun, index) => (
                        <div key={index} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <div className="md:col-span-3">
                                <label className="block text-[11px] font-semibold text-gray-600 mb-1">Quantidade</label>
                                <input 
                                    type="number" 
                                    min="1" 
                                    value={mun.quantidade} 
                                    onChange={(e) => handleMunicaoChange(index, 'quantidade', e.target.value)} 
                                    placeholder="Ex: 1" 
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm bg-white" 
                                />
                            </div>
                            <div className="md:col-span-4">
                                <InputComSugestoes 
                                    label="Calibre"
                                    value={mun.calibre}
                                    onChange={(val) => handleMunicaoChange(index, 'calibre', val)}
                                    sugestoes={LISTA_CALIBRES}
                                    placeholder="Ex: .38 SPL"
                                />
                            </div>
                            <div className="md:col-span-4">
                                <InputComSugestoes 
                                    label="Marca"
                                    value={mun.marca}
                                    onChange={(val) => handleMunicaoChange(index, 'marca', val)}
                                    sugestoes={LISTA_MARCAS}
                                    placeholder="Ex: CBC"
                                />
                            </div>
                            <div className="md:col-span-1 flex justify-center">
                                {form.municoes.length > 1 && (
                                    <button type="button" onClick={() => removerMunicao(index)} className="bg-red-100 text-red-600 hover:bg-red-200 p-2 rounded-md text-xs font-bold transition w-full flex items-center justify-center cursor-pointer">
                                        ✕
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div>
                    <h3 className="text-md font-bold text-blue-900 border-b pb-2 mb-4">📋 Identificação</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <InputComSugestoes 
                                label="Calibre"
                                value={form.calibre}
                                onChange={(val) => setFieldValue('calibre', val)}
                                sugestoes={LISTA_CALIBRES}
                                placeholder="Ex: .40 S&W"
                            />
                        </div>
                        <div>
                            <InputComSugestoes 
                                label="Marca"
                                value={form.marca}
                                onChange={(val) => setFieldValue('marca', val)}
                                sugestoes={LISTA_MARCAS}
                                placeholder="Ex: Imbel"
                            />
                        </div>
                        <div>
                            <InputComSugestoes 
                                label="Modelo"
                                value={form.modelo}
                                onChange={(val) => setFieldValue('modelo', val)}
                                sugestoes={LISTA_MODELOS}
                                placeholder="Ex: não aparente"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1 flex justify-between">
                                Número de Série
                                <span className="space-x-1">
                                    <button type="button" onClick={() => setFieldValue('numero_serie', 'Suprimido')} className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded hover:bg-red-200 cursor-pointer">Suprimido</button>
                                    <button type="button" onClick={() => setFieldValue('numero_serie', 'Não aparente')} className="text-[10px] bg-gray-200 text-gray-700 px-1.5 py-0.5 rounded hover:bg-gray-300 cursor-pointer">Não aparente</button>
                                </span>
                            </label>
                            <input type="text" name="numero_serie" value={form.numero_serie || ''} onChange={onChange} placeholder="Digite ou use os botões" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" />
                        </div>
                    </div>
                </div>
            )}

            {/* MEDIDAS E CARACTERÍSTICAS (Apenas para Armas) */}
            {!isMunicao && (
                <div>
                    <h3 className="text-md font-bold text-blue-900 border-b pb-2 mb-4">📏 Medidas e Características</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Comp. do Cano (mm)</label>
                            <input type="number" name="comprimento_cano" value={form.comprimento_cano || ''} onChange={onChange} placeholder="Ex: 60" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Comp. Total (mm)</label>
                            <input type="number" name="comprimento_total" value={form.comprimento_total || ''} onChange={onChange} placeholder="Ex: 180" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Acabamento</label>
                            <input type="text" name="acabamento" value={form.acabamento || ''} onChange={onChange} placeholder="Ex: oxidado" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">Capacidade (Tiros)</label>
                            <input type="text" name="capacidade" value={form.capacidade || ''} onChange={onChange} placeholder="Ex: 06" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" />
                        </div>
                    </div>

                    <div className="mb-4 bg-white p-3 border border-gray-200 rounded-lg shadow-sm">
                        <label className="block text-xs font-semibold text-gray-600 mb-2 flex items-center justify-between">
                            Placas da Empunhadura
                            <span className="space-x-1">
                                <button type="button" onClick={() => setFieldValue('empunhadura_revolver', 'placas da empunhadura em borracha')} className="text-[10px] bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 border border-blue-200 cursor-pointer">Borracha</button>
                                <button type="button" onClick={() => setFieldValue('empunhadura_revolver', 'placas da empunhadura em madeira')} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-1 rounded hover:bg-amber-100 border border-amber-200 cursor-pointer">Madeira</button>
                                <button type="button" onClick={() => setFieldValue('empunhadura_revolver', 'placas da empunhadura em polímero')} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200 border border-gray-300 cursor-pointer">Polímero</button>
                                <button type="button" onClick={() => setFieldValue('empunhadura_revolver', 'placas da empunhadura em plástico')} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-1 rounded hover:bg-gray-200 border border-gray-300 cursor-pointer">Plástico</button>
                            </span>
                        </label>
                        <input type="text" name="empunhadura_revolver" value={form.empunhadura_revolver || ''} onChange={onChange} placeholder="Ex: placas da empunhadura em polímero" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-gray-50 focus:bg-white" />
                    </div>

                    {form.tipo_material === 'pistola' && (
                        <div className="mb-4 bg-blue-50 p-4 border border-blue-100 rounded-lg shadow-sm">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-semibold text-blue-800 mb-1">
                                        Detalhes da Armação
                                    </label>
                                    <input 
                                        type="text" 
                                        name="detalhes_armacao" 
                                        value={form.detalhes_armacao || ''} 
                                        onChange={onChange} 
                                        placeholder="Ex: em polímero na cor preta" 
                                        className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500" 
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-blue-800 mb-1">
                                        Informações do Carregador
                                    </label>
                                    <input 
                                        type="text" 
                                        name="carregador_info" 
                                        value={form.carregador_info || ''} 
                                        onChange={onChange} 
                                        placeholder="Ex: desprovida de carregador" 
                                        className="w-full p-2 border border-blue-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500" 
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {form.tipo_material === 'carabina' && (
                        <div className="mb-4 bg-green-50 p-4 border border-green-100 rounded-lg shadow-sm">
                            <h4 className="text-sm font-bold text-green-900 mb-3">Detalhes da Carabina</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <InputComSugestoes 
                                        label="Tipo de Ação"
                                        value={form.tipo_acao_carabina}
                                        onChange={(val) => setFieldValue('tipo_acao_carabina', val)}
                                        sugestoes={LISTA_ACOES_CARABINA}
                                        placeholder="Ex: repetição (não automática)"
                                    />
                                </div>
                                <div>
                                    <InputComSugestoes 
                                        label="Detalhes da Coronha"
                                        value={form.detalhes_coronha}
                                        onChange={(val) => setFieldValue('detalhes_coronha', val)}
                                        sugestoes={LISTA_CORONHAS}
                                        placeholder="Ex: coronha e telha em madeira"
                                    />
                                </div>
                                <div>
                                    <InputComSugestoes 
                                        label="Sistema de Alimentação"
                                        value={form.sistema_alimentacao}
                                        onChange={(val) => setFieldValue('sistema_alimentacao', val)}
                                        sugestoes={LISTA_SISTEMA_ALIMENTACAO}
                                        placeholder="Ex: sistema próprio"
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* SITUAÇÃO E ENCAMINHAMENTO */}
            <div>
                <h3 className="text-md font-bold text-blue-900 border-b pb-2 mb-4">🚨 Situação e Encaminhamento</h3>
                
                {/* Pergunta de Destino da Munição (Aparece logo no topo para guiar o fluxo) */}
                {isMunicao && (
                    <div className="mb-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                        <label className="block text-sm font-bold text-yellow-900 mb-2">Qual foi o destino das munições?</label>
                        <div className="flex flex-col md:flex-row gap-4">
                            <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="destino" 
                                    value="custodia" 
                                    checked={form.destino !== 'consumida'} 
                                    onChange={onChange} 
                                    className="h-4 w-4 text-blue-600 mr-2" 
                                />
                                Foram devolvidas e encaminhadas para a Custódia
                            </label>
                            <label className="flex items-center text-sm text-gray-700 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="destino" 
                                    value="consumida" 
                                    checked={form.destino === 'consumida'} 
                                    onChange={onChange} 
                                    className="h-4 w-4 text-red-600 mr-2" 
                                />
                                Foram consumidas nos exames (não há custódia)
                            </label>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* CAMPO DE LACRE CONDICIONAL: Só aparece se for Arma OU se a Munição for para Custódia */}
                    {(!isMunicao || form.destino !== 'consumida') && (
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 mb-1">
                                Nº do Lacre <span className="text-red-500 font-bold">*</span>
                            </label>
                            <input 
                                type="text" 
                                name="n_lacre" 
                                value={form.n_lacre || ''} 
                                onChange={onChange} 
                                placeholder="Ex: 998877" 
                                required 
                                className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                            />
                        </div>
                    )}
                    
                    {/* DEFEITO CONSTATADO */}
                    {(form.resultado_exame === 'ineficiente' || form.resultado_exame === 'municao_ineficiente') && (
                        <div>
                            <label className="block text-xs font-semibold text-red-700 mb-1">Defeito Constatado</label>
                            <input 
                                type="text" 
                                name="defeito_constatado" 
                                value={form.defeito_constatado || ''} 
                                onChange={onChange} 
                                placeholder="Ex: espoleta inoperante" 
                                className="w-full p-2 border border-red-300 rounded-lg text-sm bg-red-50 focus:border-red-500 focus:ring-1 focus:ring-red-500" 
                            />
                        </div>
                    )}
                </div>

                {!isMunicao && (
                    <div className="mt-4 p-4 bg-gray-100 rounded-lg border border-gray-200">
                        <div className="flex items-center space-x-2 mb-3">
                            <input type="checkbox" id="pertence_pm" name="pertence_pm" checked={form.pertence_pm || false} onChange={onChange} className="h-4 w-4 text-blue-600 rounded border-gray-400 cursor-pointer" />
                            <label htmlFor="pertence_pm" className="text-sm font-semibold text-gray-800 cursor-pointer">Pertence à carga de Instituição?</label>
                        </div>
                        {form.pertence_pm && (
                            <div>
                                <label className="block text-xs font-semibold text-gray-600 mb-1">Nome da Instituição</label>
                                <input type="text" name="instituicao_carga" value={form.instituicao_carga || ''} onChange={onChange} placeholder="Ex: Polícia Militar do Estado de Minas Gerais" className="w-full p-2 border border-gray-300 rounded-lg text-sm bg-white" />
                            </div>
                        )}
                    </div>
                )}
            </div>
            
        </div>
    );
}