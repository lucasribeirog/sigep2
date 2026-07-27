import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import GeradorLaudo from './components/GeradorLaudo';

export default function App() {
    const [usuario, setUsuario] = useState(null);
    const [abaAtiva, setAbaAtiva] = useState('inicio'); 
    const [especieSelecionada, setEspecieSelecionada] = useState(''); 

    // Estados do Modal de Foto
    const [modalFotoAberto, setModalFotoAberto] = useState(false);
    const [arquivoFoto, setArquivoFoto] = useState(null);
    const [carregandoIA, setCarregandoIA] = useState(false);
    const [dadosPreenchidosIA, setDadosPreenchidosIA] = useState(null);

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

    const lidarComCliqueBalistica = () => {
        setArquivoFoto(null); // Reseta a foto anterior ao abrir
        setDadosPreenchidosIA(null);
        setModalFotoAberto(true);
    };

    // Modo Manual SEM foto
    const prosseguirSemFoto = () => {
        setModalFotoAberto(false);
        setArquivoFoto(null);
        setDadosPreenchidosIA(null);
        setEspecieSelecionada('Eficiencia Armas de Fogo e/ou municoes');
        setAbaAtiva('gerador');
    };

    // Modo Manual COM a foto que já foi colocada no modal
    const prosseguirManualComFoto = () => {
        setModalFotoAberto(false);
        setDadosPreenchidosIA(null); // Sem dados da IA, preenchimento manual, mas COM a foto
        setEspecieSelecionada('Eficiencia Armas de Fogo e/ou municoes');
        setAbaAtiva('gerador');
    };

    // Modo com IA COM a foto do modal
    const enviarFotoParaIA = async () => {
        if (!arquivoFoto) return;

        const formData = new FormData();
        formData.append('foto_objeto', arquivoFoto);
        formData.append('especie', 'Eficiencia Armas de Fogo e/ou municoes');

        try {
            setCarregandoIA(true);
            const response = await fetch('http://localhost:3000/api/analisar-foto', {
                method: 'POST',
                body: formData
            });
            const resultado = await response.json();

            if (response.ok) {
                setDadosPreenchidosIA(resultado.dadosForm);
                setModalFotoAberto(false);
                setEspecieSelecionada('Eficiencia Armas de Fogo e/ou municoes');
                setAbaAtiva('gerador');
            } else {
                alert('Erro na análise da IA: ' + resultado.erro);
            }
        } catch (error) {
            console.error(error);
            alert('Falha ao comunicar com o servidor de IA.');
        } finally {
            setCarregandoIA(false);
        }
    };

    if (!usuario) {
        return <Login onLoginSuccess={(dados) => setUsuario(dados)} />;
    }

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col">
            <header className="bg-white shadow-sm border-b px-8 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <svg className="w-10 h-10 flex-shrink-0 shadow-sm rounded-xl" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect width="40" height="40" rx="10" fill="#0284C7" />
                        <path d="M12 28V12L22 24V12" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M28 12V28" stroke="white" strokeWidth="4" strokeLinecap="round"/>
                    </svg>
                    <div>
                        <h1 className="text-lg font-black text-gray-900 tracking-wider leading-none">NEXUS</h1>
                        <span className="text-[10px] font-bold text-sky-600 tracking-widest uppercase">Gestão Pericial</span>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <p className="text-xs text-gray-500 hidden sm:block">Perito(a): <span className="font-medium text-gray-700">{usuario.email}</span></p>
                    <button 
                        onClick={handleLogout}
                        className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg transition font-medium cursor-pointer"
                    >
                        Sair
                    </button>
                </div>
            </header>

            <nav className="bg-white border-b px-8 flex gap-6 shadow-xs">
                <button
                    onClick={() => { setEspecieSelecionada(''); setAbaAtiva('inicio'); }}
                    className={`py-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
                        abaAtiva === 'inicio' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    🏠 Início / Boas-Vindas
                </button>
                <button
                    onClick={() => setAbaAtiva('gerador')}
                    className={`py-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
                        abaAtiva === 'gerador' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                    📄 Elaboração de Laudos
                </button>
            </nav>

            <main className="flex-1 p-8 max-w-6xl mx-auto w-full relative">
                {abaAtiva === 'inicio' ? (
                    <div className="space-y-6">
                        <div className="bg-[#0284C7] text-white p-8 rounded-2xl shadow-lg flex flex-col md:flex-row justify-between items-center">
                            <div className="space-y-2">
                                <h2 className="text-3xl font-bold">Bem-vindo(a) ao Painel Pericial</h2>
                                <p className="text-sky-100 text-sm max-w-xl">
                                    Plataforma automatizada para suporte à elaboração, padronização e emissão de laudos periciais de balística e patrimônio.
                                </p>
                            </div>
                            <button
                                onClick={lidarComCliqueBalistica}
                                className="mt-6 md:mt-0 bg-white text-sky-800 hover:bg-sky-50 font-bold px-6 py-3 rounded-xl shadow transition cursor-pointer text-sm"
                            >
                                Iniciar Novo Laudo ➔
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                            <div 
                                onClick={lidarComCliqueBalistica}
                                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-sky-300 transition cursor-pointer group flex items-start gap-4"
                            >
                                <div className="p-3 bg-sky-50 text-[#0284C7] rounded-xl group-hover:bg-[#0284C7] group-hover:text-white transition flex-shrink-0 flex items-center justify-center">
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" />
                                        <circle cx="12" cy="12" r="6" />
                                        <circle cx="12" cy="12" r="2" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 group-hover:text-[#0284C7] transition">Eficiência de Arma de Fogo</h3>
                                    <p className="text-sm text-gray-500 mt-1">Preencha com suporte opcional de IA visual e parâmetros de balística.</p>
                                </div>
                            </div>

                            <div 
                                onClick={() => { setEspecieSelecionada('Eficiencia e Prestabilidade de Objeto Utilizado Para Ofender a Integridade Fisica de Outrem'); setAbaAtiva('gerador'); }}
                                className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 hover:shadow-md hover:border-sky-300 transition cursor-pointer group flex items-start gap-4"
                            >
                                <div className="p-3 bg-sky-50 text-[#0284C7] rounded-xl group-hover:bg-[#0284C7] group-hover:text-white transition flex-shrink-0 flex items-center justify-center">
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-800 group-hover:text-[#0284C7] transition">Eficiência de Objeto (Patrimônio)</h3>
                                    <p className="text-sm text-gray-500 mt-1">Gere laudos de instrumentos utilizados para ofender a integridade física.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <GeradorLaudo 
                        especieInicial={especieSelecionada} 
                        dadosIniciaisIA={dadosPreenchidosIA} 
                        fotoObjetoInicial={arquivoFoto}
                    />
                )}

                {/* MODAL MODERNO DE UPLOAD DE FOTO */}
                {modalFotoAberto && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl text-center space-y-6">
                            <div>
                                <h3 className="text-xl font-bold text-gray-800">Foto do Vestígio (Opcional)</h3>
                                <p className="text-gray-500 text-sm mt-1">Insira a foto com régua se deseja que ela apareça no laudo.</p>
                            </div>

                            <label className="border-2 border-dashed border-sky-300 bg-sky-50/50 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:bg-sky-50 transition-all">
                                <input 
                                    type="file" 
                                    accept="image/*" 
                                    className="hidden" 
                                    onChange={(e) => setArquivoFoto(e.target.files[0])}
                                />
                                <svg className="w-10 h-10 text-sky-500 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path>
                                </svg>
                                <span className="text-sm font-medium text-gray-700">
                                    {arquivoFoto ? arquivoFoto.name : "Arraste a foto ou clique para selecionar"}
                                </span>
                            </label>

                            {/* Renderização dinâmica dos botões dependendo se o usuário colocou a imagem ou não */}
                            {arquivoFoto ? (
                                <div className="flex flex-col gap-3">
                                    <button 
                                        onClick={enviarFotoParaIA}
                                        disabled={carregandoIA}
                                        className="w-full bg-[#0284C7] hover:bg-[#0284C7]/90 text-white font-medium py-3 rounded-xl transition-all text-sm shadow-md cursor-pointer flex items-center justify-center"
                                    >
                                        {carregandoIA ? 'Analisando...' : '✨ Analisar com IA e Preencher'}
                                    </button>
                                    <button 
                                        onClick={prosseguirManualComFoto}
                                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl transition-all text-sm cursor-pointer"
                                    >
                                        ✏️ Preencher Manualmente (Com esta Foto)
                                    </button>
                                </div>
                            ) : (
                                <div className="flex gap-3">
                                    <button 
                                        onClick={prosseguirSemFoto}
                                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 rounded-xl transition-all text-sm cursor-pointer"
                                    >
                                        Continuar sem Foto (Modo Manual)
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}