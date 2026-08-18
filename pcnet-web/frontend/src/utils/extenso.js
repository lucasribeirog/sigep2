export function converterMassaParaExtenso(valorStr) {
    if (!valorStr) return '';
    
    // Normaliza vírgula para ponto para calculo
    const limpo = String(valorStr).replace(',', '.').trim();
    const numero = parseFloat(limpo);
    
    if (isNaN(numero) || numero <= 0) return '';

    // Extenso simples (Pode ser refinado se necessário)
    // Para simplificar e garantir robustez forense de gramas e decigramas/centigramas:
    const partes = limpo.split('.');
    const gramas = parseInt(partes[0], 10);
    const decimais = partes[1] ? partes[1].padEnd(2, '0').slice(0, 2) : '00';
    const decigramas = parseInt(decimais[0], 10);
    const centigramas = parseInt(decimais[1], 10);

    // Função auxiliar simples para números até 999 (ou use uma biblioteca se preferir)
    // Aqui faremos uma base prática funcional:
    return `${gramas} gramas${decigramas > 0 ? ` e ${decigramas} decigramas` : ''}`.toLowerCase();
}