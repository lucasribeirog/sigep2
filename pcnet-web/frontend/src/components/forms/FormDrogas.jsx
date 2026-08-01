import React from 'react';

export default function FormDrogas({ dados, onChange }) {
    const {
        droga = 'cocaina',
        cor_material = 'branca',
        qtd_involucros = '',
        massa_liquida = '',
        extenso_massa = '',
        envelope_recebimento = '',
        resultado = 'positivo',
        tipo_encaminhamento = 'unificado',
        envelope_encaminhamento = '',
        massa_amostra = '',
        fav_amostra = '',
        envelope_amostra = '',
        envelope_restante = ''
    } = dados;

    const isCocaina = droga === 'cocaina';
    const isFragmentado = tipo_encaminhamento === 'fragmentado';

    // 🎯 Conversor forense blindado com suporte a milhares (ex: 900.000 gramas)
    const handleMassaBlur = () => {
        if (!massa_liquida) return;

        const valorLimpoStr = String(massa_liquida).replace(',', '.').trim();
        const [parteInteiraStr, parteDecimalStr = ''] = valorLimpoStr.split('.');
        
        const gramas = parseInt(parteInteiraStr, 10);
        if (isNaN(gramas)) return;
        
        let decimalNum = 0;
        let tipoDecimal = '';
        
        if (parteDecimalStr.length > 0) {
            const decimalPadded = parteDecimalStr.padEnd(2, '0');
            decimalNum = parseInt(decimalPadded.slice(0, 2), 10) || 0;
            tipoDecimal = parteDecimalStr.length === 1 ? 'decigrama' : 'centigrama';
        }

        const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
        const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
        const centenasStr = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

        const numeroParaTexto = (n) => {
            if (n === 0) return 'zero';
            if (n < 20) return unidades[n];
            if (n < 100) {
                const d = Math.floor(n / 10);
                const u = n % 10;
                return u === 0 ? dezenas[d] : dezenas[d] + ' e ' + unidades[u];
            }
            if (n === 100) return 'cem';
            if (n < 1000) {
                const c = Math.floor(n / 100);
                const resto = n % 100;
                return resto === 0 ? centenasStr[c] : centenasStr[c] + ' e ' + numeroParaTexto(resto);
            }
            if (n < 1000000) {
                const milhares = Math.floor(n / 1000);
                const resto = n % 1000;
                let milStr = '';
                if (milhares === 1) {
                    milStr = 'mil';
                } else {
                    milStr = numeroParaTexto(milhares) + ' mil';
                }
                if (resto === 0) return milStr;
                // Regra culta da língua portuguesa: se o resto for menor que 100 ou terminar em centena redonda, usa 'e', senão vírgula/espaço
                const separador = (resto < 100 || resto % 100 === 0) ? ' e ' : ' e ';
                return milStr + separador + numeroParaTexto(resto);
            }
            return String(n);
        };

        let textoG = numeroParaTexto(gramas) + ' grama' + (gramas !== 1 ? 's' : '');
        
        if (decimalNum > 0) {
            const textoDec = numeroParaTexto(decimalNum);
            const nomeUnidadeDecimal = decimalNum === 1 ? tipoDecimal : (tipoDecimal + 's');
            textoG += ' e ' + textoDec + ' ' + nomeUnidadeDecimal;
        }

        onChange({
            target: {
                name: 'extenso_massa',
                value: textoG
            }
        });
    };

    return (
        <div className="space-y-6">
            {/* 1. Classificação da Droga */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Droga *</label>
                    <select
                        name="droga"
                        value={droga}
                        onChange={onChange}
                        className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        required
                    >
                        <option value="cocaina">Cocaína</option>
                        <option value="maconha">Maconha</option>
                    </select>
                </div>

                {isCocaina && (
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Cor do Material *</label>
                        <select
                            name="cor_material"
                            value={cor_material}
                            onChange={onChange}
                            className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                            required={isCocaina}
                        >
                            <option value="branca">Branca</option>
                            <option value="esbranquiçada">Esbranquiçada</option>
                            <option value="bege">Bege</option>
                            <option value="amarronzada">Amarronzada</option>
                            <option value="acinzentada">Acinzentada</option>
                            <option value="amarelada">Amarelada</option>
                        </select>
                    </div>
                )}
            </div>

            {/* 2. Quantidade e Massa */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Qtd. de Invólucros *</label>
                    <input
                        type="number"
                        name="qtd_involucros"
                        value={qtd_involucros}
                        onChange={onChange}
                        min="1"
                        placeholder="ex: 3"
                        className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        required
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Massa (g) *</label>
                    <input
                        type="text"
                        name="massa_liquida"
                        value={massa_liquida}
                        onChange={onChange}
                        onBlur={handleMassaBlur} // 🎯 Dispara a conversão ao sair do campo
                        placeholder="ex: 15,2"
                        className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        required
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Massa por Extenso *</label>
                <input
                    type="text"
                    name="extenso_massa"
                    value={extenso_massa}
                    onChange={onChange}
                    placeholder="ex: quinze gramas e dois decigramas"
                    className="w-full border border-gray-300 rounded p-2 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                    required
                />
            </div>

            {/* 3. Recebimento e Resultado */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Envelope de Chegada (Opcional)</label>
                    <input
                        type="text"
                        name="envelope_recebimento"
                        value={envelope_recebimento}
                        onChange={onChange}
                        placeholder="Nº lacre original"
                        className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    />
                </div>
                <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Resultado Preliminar *</label>
                    <select
                        name="resultado"
                        value={resultado}
                        onChange={onChange}
                        className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        required
                    >
                        <option value="positivo">Positivo</option>
                        <option value="negativo">Negativo</option>
                        <option value="inconclusivo">Inconclusivo</option>
                    </select>
                </div>
            </div>

            <hr className="border-gray-200" />

            {/* 4. Encaminhamento e Guarda */}
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo de Encaminhamento *</label>
                <select
                    name="tipo_encaminhamento"
                    value={tipo_encaminhamento}
                    onChange={onChange}
                    className="w-full border border-gray-300 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                    required
                >
                    <option value="unificado">Unificado (Apenas um envelope de guarda)</option>
                    <option value="fragmentado">Fragmentado (Amostra para Definitivo + Restante)</option>
                </select>
            </div>

            {/* Renderização Condicional: Unificado */}
            {!isFragmentado && (
                <div className="bg-blue-50 p-4 rounded-md border border-blue-100">
                    <label className="block text-sm font-semibold text-blue-900 mb-1">Envelope de Encaminhamento/Guarda *</label>
                    <input
                        type="text"
                        name="envelope_encaminhamento"
                        value={envelope_encaminhamento}
                        onChange={onChange}
                        placeholder="Nº do novo lacre"
                        className="w-full border border-blue-200 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        required={!isFragmentado}
                    />
                </div>
            )}

            {/* Renderização Condicional: Fragmentado */}
            {isFragmentado && (
                <div className="bg-orange-50 p-4 rounded-md border border-orange-200 space-y-4">
                    <h3 className="font-bold text-orange-900 text-sm uppercase tracking-wide">Dados da Amostra (Exame Definitivo)</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-orange-800 mb-1">FAV da Amostra *</label>
                            <input
                                type="text"
                                name="fav_amostra"
                                value={fav_amostra}
                                onChange={onChange}
                                placeholder="ex: 12345/2026"
                                className="w-full border border-orange-200 rounded p-2 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                                required={isFragmentado}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-orange-800 mb-1">Massa (g) *</label>
                            <input
                                type="text"
                                name="massa_amostra"
                                value={massa_amostra}
                                onChange={onChange}
                                placeholder="ex: 2,5"
                                className="w-full border border-orange-200 rounded p-2 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                                required={isFragmentado}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-orange-800 mb-1">Envelope Amostra *</label>
                            <input
                                type="text"
                                name="envelope_amostra"
                                value={envelope_amostra}
                                onChange={onChange}
                                placeholder="Nº Lacre"
                                className="w-full border border-orange-200 rounded p-2 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                                required={isFragmentado}
                            />
                        </div>
                    </div>

                    <hr className="border-orange-200" />
                    
                    <div>
                        <label className="block text-sm font-semibold text-orange-900 mb-1">Envelope do Restante (Guarda) *</label>
                        <input
                            type="text"
                            name="envelope_restante"
                            value={envelope_restante}
                            onChange={onChange}
                            placeholder="Nº Lacre do material remanescente"
                            className="w-full border border-orange-200 rounded p-2 bg-white focus:ring-2 focus:ring-orange-500 outline-none"
                            required={isFragmentado}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}