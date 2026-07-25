import { useState, useEffect } from 'react';
import { pcnetApi } from '../api/pcnet';

export default function UnitStep({ sessao, setSessao, mostrarMsg, setLoading, isLoading }) {
  const [unidadeSelecionada, setUnidadeSelecionada] = useState('');

  // Define a primeira unidade da lista como padrão assim que a tela abre
  useEffect(() => {
    if (sessao.unidades && sessao.unidades.length > 0) {
      setUnidadeSelecionada(sessao.unidades[0]);
    }
  }, [sessao.unidades]);

  const handleUnidade = async (e) => {
    e.preventDefault();
    if (!unidadeSelecionada) return alert('Selecione uma unidade.');
    
    setLoading(true);
    try {
      const { ok, data } = await pcnetApi.selecionarUnidade(unidadeSelecionada);
      if (ok) {
        // Define a unidade ativa na sessão (O Router vai jogar para o Dashboard)
        setSessao(prev => ({ ...prev, unidadeAtiva: unidadeSelecionada }));
        mostrarMsg('');
      } else {
        mostrarMsg(data.erro, 'erro');
      }
    } catch {
      mostrarMsg('Erro ao selecionar unidade.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleUnidade} className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-700">3. Escolha a Unidade</h2>
      <p className="text-xs text-slate-500">Selecione o seu local de trabalho para continuar.</p>
      
      <div>
        <label className="block text-sm font-medium text-slate-600">Unidades Disponíveis</label>
        <select value={unidadeSelecionada} onChange={(e) => setUnidadeSelecionada(e.target.value)} className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
          {sessao.unidades.map((und) => (
            <option key={und} value={und}>{und}</option>
          ))}
        </select>
      </div>
      
      <button type="submit" disabled={isLoading} className="w-full bg-indigo-600 text-white p-2 rounded-lg font-semibold hover:bg-indigo-700 transition disabled:opacity-50">
        {isLoading ? 'Entrando na Unidade...' : 'Confirmar Unidade e Acessar'}
      </button>
    </form>
  );
}