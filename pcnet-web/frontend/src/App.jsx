import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import GeradorLaudo from './components/GeradorLaudo';

export default function App() {
    const [usuario, setUsuario] = useState(null);
    const [abaAtiva, setAbaAtiva] = useState('inicio'); // 'inicio' ou 'gerador'
    const [especieSelecionada, setEspecieSelecionada] = useState(''); // <--- NOVO: guarda a espécie escolhida na home

    useEffect(() => {
        const usuarioSalvo = localStorage.getItem('usuario');
        if (usuarioSalvo) {
            setUsuario(JSON.parse(usuarioSalvo));
        }
    }, []);

    const handleLogout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('usuario');
        setUsuario(null);
    };

    // Função para navegar direto para a aba de laudo com uma espécie específica
    const irParaLaudoComEspecie = (especie) => {
        setEspecieSelecionada(especie);
        setAbaAtiva('gerador');
    };

    if (!usuario) {
        return <Login onLoginSuccess={(dados) => setUsuario(dados)} />;
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            {/* Barra Superior Institucional */}
            <header className="bg-white shadow-sm border-b px-8 py-4 flex justify-between items-center">
                <div>
                    <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                        🛡️ PCNet <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Sistema Pericial</span>
                    </h1>
                    <p className="text-xs text-gray-500 mt-0.5">Perito(a): <span className="font-medium text-gray-700">{usuario.email}</span></p>
                </div>

                <div className="flex items-center gap-4">
                    <button 
                        onClick={handleLogout}
                        className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition font-medium cursor-pointer"
                    >
                        Sair
                    </button>
                </div>
            </header>

            {/* Menu de Abas / Navegação Interna */}
            <nav className="bg-white border-b px-8 flex gap-6 shadow-xs">
                <button
                    onClick={() => { setEspecieSelecionada(''); setAbaAtiva('inicio'); }}
                    className={`py-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
                        abaAtiva === 'inicio' 
                            ? 'border-blue-600 text-blue-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    🏠 Início / Boas-Vindas
                </button>
                <button
                    onClick={() => setAbaAtiva('gerador')}
                    className={`py-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
                        abaAtiva === 'gerador' 
                            ? 'border-blue-600 text-blue-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    📄 Elaboração de Laudos
                </button>
            </nav>

            {/* Conteúdo Dinâmico das Abas */}
            <main className="flex-1 p-8 max-w-6xl mx-auto w-full">
                {abaAtiva === 'inicio' ? (
                    <div className="space-y-6">
                        {/* Card de Boas-Vindas */}
                        <div className="bg-gradient-to-r from-blue-900 to-blue-700 text-white p-8 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center">
                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold">Bem-vindo(a) ao Painel Pericial</h2>
                                <p className="text-blue-100 text-sm max-w-xl">
                                    Plataforma automatizada para suporte à elaboração, padronização e emissão de laudos periciais de balística e patrimônio.
                                </p>
                            </div>
                            <button
                                onClick={() => irParaLaudoComEspecie('Eficiencia Armas de Fogo e/ou municoes')}
                                className="mt-6 md:mt-0 bg-white text-blue-900 hover:bg-blue-50 font-bold px-6 py-3 rounded-xl shadow transition cursor-pointer text-sm"
                            >
                                Iniciar Novo Laudo ➔
                            </button>
                        </div>

                        {/* Atalhos Rápidos / Cards informativos */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                            <div 
                                onClick={() => irParaLaudoComEspecie('Eficiencia Armas de Fogo e/ou municoes')}
                                className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer group"
                            >
                                <div className="text-3xl mb-3">🎯</div>
                                <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition">Eficiência de Arma de Fogo</h3>
                                <p className="text-sm text-gray-500 mt-1">Preencha os parâmetros de balística, modo coringa e verificação de carga institucional.</p>
                            </div>

                            <div 
                                onClick={() => irParaLaudoComEspecie('Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem')}
                                className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer group"
                            >
                                <div className="text-3xl mb-3">⚖️</div>
                                <h3 className="text-lg font-bold text-gray-800 group-hover:text-blue-600 transition">Eficiência de Objeto (Patrimônio)</h3>
                                <p className="text-sm text-gray-500 mt-1">Gere laudos de instrumentos utilizados para ofender a integridade física.</p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <GeradorLaudo especieInicial={especieSelecionada} />
                )}
            </main>
        </div>
    );
}