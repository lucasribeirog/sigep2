import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { pcnetApi } from '../api/pcnet';
import GeradorLaudo from './GeradorLaudo';

export default function Dashboard({ sessao, resetarSessao, mostrarMsg }) {
  const [requisicoes, setRequisicoes] = useState([]);
  const [carregandoDados, setCarregandoDados] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState('requisicoes');

  useEffect(() => {
    carregarTabela();
  }, []);

  const carregarTabela = async () => {
    setCarregandoDados(true);
    mostrarMsg('Buscando requisições...', 'sucesso');
    
    try {
      const blob = await pcnetApi.extrairCsv();
      const textoCsv = await blob.text();

      Papa.parse(textoCsv, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
          setRequisicoes(results.data);
          mostrarMsg(`Carregado: ${results.data.length} requisições encontradas.`, 'sucesso');
        }
      });
    } catch (err) {
      mostrarMsg('Não foi possível carregar o CSV do PCNet no momento.', 'erro');
    } finally {
      setCarregandoDados(false);
    }
  };

  return (
    <div className="space-y-6 w-full">
      {/* CABEÇALHO DO DASHBOARD */}
      <div className="flex justify-between items-center bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            {abaAtiva === 'requisicoes' ? 'Painel de Requisições' : 'Gerador de Laudos'}
          </h2>
          <p className="text-sm text-slate-500 mt-1">Unidade: {sessao.unidadeAtiva}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* BOTÃO DE RECARREGAR (Substitui o F5) */}
          {abaAtiva === 'requisicoes' && (
            <button 
              onClick={carregarTabela} 
              disabled={carregandoDados}
              className="px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {carregandoDados ? 'Atualizando...' : '🔄 Atualizar Lista'}
            </button>
          )}
          <button onClick={resetarSessao} className="px-4 py-2 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors cursor-pointer">
            Sair do Sistema
          </button>
        </div>
      </div>

      {/* MENU DE NAVEGAÇÃO (ABAS) */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setAbaAtiva('requisicoes')}
          className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 ${
            abaAtiva === 'requisicoes'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          📋 Lista de Requisições
        </button>
        <button
          onClick={() => setAbaAtiva('gerador')}
          className={`px-6 py-3 text-sm font-bold transition-colors border-b-2 ${
            abaAtiva === 'gerador'
              ? 'border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
          }`}
        >
          🔬 Gerar Laudo
        </button>
      </div>

      {/* CONTEÚDO DA ABA DE REQUISIÇÕES */}
      {abaAtiva === 'requisicoes' && (
        <>
          {carregandoDados ? (
            <div className="text-center py-12 text-slate-500 font-medium animate-pulse bg-white rounded-xl border border-slate-200 shadow-sm">
              Lendo dados do sistema PCNet...
            </div>
          ) : (
            <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
                    <th className="p-4 font-semibold">Nº Requisição</th>
                    <th className="p-4 font-semibold">Data</th>
                    <th className="p-4 font-semibold">Status</th>
                    <th className="p-4 font-semibold">Exame</th>
                    <th className="p-4 font-semibold text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-100">
                  {requisicoes.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="p-8 text-center text-slate-500">Nenhuma requisição encontrada ou aguardando sincronização.</td>
                    </tr>
                  ) : (
                    requisicoes.slice(0, 10).map((req, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 transition">
                        <td className="p-4 font-medium text-slate-800">{req[Object.keys(req)[0]]}</td> 
                        <td className="p-4 text-slate-600">{req[Object.keys(req)[1]]}</td>
                        <td className="p-4 text-slate-600">{req[Object.keys(req)[2]]}</td>
                        <td className="p-4 text-slate-600">{req[Object.keys(req)[3]]}</td>
                        <td className="p-4 text-center">
                          <button className="text-blue-600 font-medium hover:underline">Ver Detalhes</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ABA DE GERAR LAUDOS */}
      {abaAtiva === 'gerador' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <GeradorLaudo />
        </div>
      )}
    </div>
  );
}