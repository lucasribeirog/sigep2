import { useState } from 'react';
import { pcnetApi } from '../api/pcnet';

export default function TokenStep({ setSessao, mostrarMsg, setLoading, isLoading }) {
  const [token, setToken] = useState('');

  const handleToken = async (e) => {
    e.preventDefault();
    if (!token) return alert('Digite o token enviado por e-mail.');
    
    setLoading(true);
    try {
      const { ok, data } = await pcnetApi.validarToken(token);
      if (ok) {
        // Atualiza a sessão marcando o token como validado e guardando as unidades
        setSessao(prev => ({ 
          ...prev, 
          tokenValidado: true, 
          unidades: data.unidadesDisponiveis 
        }));
        mostrarMsg(data.mensagem);
      } else {
        mostrarMsg(data.erro, 'erro');
      }
    } catch {
      mostrarMsg('Erro ao validar token.', 'erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleToken} className="space-y-4">
      <h2 className="text-lg font-semibold text-slate-700">2. Validação</h2>
      <p className="text-xs text-slate-500">Insira o código enviado para o seu e-mail.</p>
      
      <div>
        <label className="block text-sm font-medium text-slate-600">Código do Token</label>
        <input type="text" value={token} onChange={(e) => setToken(e.target.value)} className="w-full mt-1 p-2 border rounded-lg focus:ring-2 focus:ring-blue-500 outline-none tracking-widest text-center font-bold text-lg" placeholder="000000" />
      </div>
      
      <button type="submit" disabled={isLoading} className="w-full bg-emerald-600 text-white p-2 rounded-lg font-semibold hover:bg-emerald-700 transition disabled:opacity-50">
        {isLoading ? 'Validando...' : 'Validar Token'}
      </button>
    </form>
  );
}