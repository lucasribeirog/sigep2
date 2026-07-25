import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import LoginStep from './components/LoginStep';
import TokenStep from './components/TokenStep';
import UnitStep from './components/UnitStep';
import Dashboard from './components/Dashboard';
import AlertMessage from './components/AlertMessage';

export default function App() {
  // 1. Mude de localStorage para sessionStorage aqui
  const [sessao, setSessao] = useState(() => {
    const salva = sessionStorage.getItem('pcnet_sessao');
    return salva ? JSON.parse(salva) : { 
      logado: false, 
      tokenValidado: false, 
      unidades: [], 
      unidadeAtiva: null 
    };
  });

  const [mensagem, setMensagem] = useState({ texto: '', tipo: 'sucesso' });
  const [loading, setLoading] = useState(false);

  // 2. Mude aqui também para salvar no sessionStorage
  useEffect(() => {
    sessionStorage.setItem('pcnet_sessao', JSON.stringify(sessao));
  }, [sessao]);

  const mostrarMsg = (texto, tipo = 'sucesso') => setMensagem({ texto, tipo });

  // 3. E mude na hora de resetar
  const resetarSessao = () => {
    setSessao({ logado: false, tokenValidado: false, unidades: [], unidadeAtiva: null });
    sessionStorage.removeItem('pcnet_sessao');
    mostrarMsg('');
  };

  // Aqui está o SEGREDO: O return está direto no componente principal!
  return (
    <BrowserRouter>
      <div className="bg-slate-100 min-h-screen font-sans p-4 flex flex-col items-center justify-center">
        
        <div className={`bg-white p-8 rounded-xl shadow-lg w-full transition-all duration-300 ${sessao.unidadeAtiva ? 'max-w-6xl' : 'max-w-md'}`}>
          
          {!sessao.unidadeAtiva && (
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">PCNet - Automação</h1>
              <p className="text-sm text-slate-500">Gerenciamento de Requisições</p>
            </div>
          )}

          <Routes>
            <Route path="/" element={
              sessao.logado ? <Navigate to="/token" /> : 
              <LoginStep setSessao={setSessao} mostrarMsg={mostrarMsg} setLoading={setLoading} isLoading={loading} />
            }/>
            
            <Route path="/token" element={
              !sessao.logado ? <Navigate to="/" /> :
              sessao.tokenValidado ? <Navigate to="/unidades" /> :
              <TokenStep setSessao={setSessao} mostrarMsg={mostrarMsg} setLoading={setLoading} isLoading={loading} />
            }/>

            <Route path="/unidades" element={
              !sessao.tokenValidado ? <Navigate to="/token" /> :
              sessao.unidadeAtiva ? <Navigate to="/dashboard" /> :
              <UnitStep sessao={sessao} setSessao={setSessao} mostrarMsg={mostrarMsg} setLoading={setLoading} isLoading={loading} />
            }/>

            <Route path="/dashboard" element={
              !sessao.unidadeAtiva ? <Navigate to="/" /> :
              <Dashboard sessao={sessao} resetarSessao={resetarSessao} mostrarMsg={mostrarMsg} />
            }/>
          </Routes>

          <AlertMessage mensagem={mensagem.texto} tipo={mensagem.tipo} />
        </div>

      </div>
    </BrowserRouter>
  );
}