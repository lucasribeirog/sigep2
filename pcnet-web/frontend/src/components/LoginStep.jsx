import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginStep({ setSessao, mostrarMsg, setLoading, isLoading }) {
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!usuario || !senha) {
      mostrarMsg('Informe o usuário e a senha.', 'erro');
      return;
    }

    setLoading(true);
    mostrarMsg('Conectando ao PCNet...', 'sucesso');

    try {
      const response = await fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, senha })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.erro || 'Erro ao realizar login.');
      }

      // Atualiza a sessão e avança para a tela de token
      setSessao(prev => ({ ...prev, logado: true }));
      mostrarMsg(data.mensagem, 'sucesso');
      navigate('/token');

    } catch (error) {
      mostrarMsg(error.message, 'erro');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            CPF / Usuário
          </label>
          <input 
            type="text" 
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
            placeholder="Digite seu CPF"
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm text-slate-800"
          />
        </div>
        
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Senha
          </label>
          <input 
            type="password" 
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="••••••••"
            className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all shadow-sm text-slate-800"
          />
        </div>

        <button 
          type="submit" 
          disabled={isLoading}
          className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-colors flex justify-center items-center cursor-pointer disabled:bg-slate-400"
        >
          {isLoading ? 'Autenticando...' : 'Entrar no Sistema'}
        </button>
      </form>
    </div>
  );
}