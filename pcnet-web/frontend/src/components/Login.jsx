import React, { useState } from 'react';
import api from '../api/pcnet';
import Register from './Register'; // 🎯 Importa o componente de registro que criamos

export default function Login({ onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');
    const [registrando, setRegistrando] = useState(false); // 🎯 Estado para alternar entre Login e Cadastro

    const handleLogin = async (e) => {
        e.preventDefault();
        setErro('');
        setLoading(true);

        try {
            const response = await api.post('/login', { email, senha });
            
            if (response.data.sucesso) {
                const dadosUsuario = response.data.usuario;
                localStorage.setItem('usuario', JSON.stringify(dadosUsuario));

                if (onLoginSuccess) {
                    onLoginSuccess(dadosUsuario);
                }
            }
        } catch (err) {
            console.error('Erro no login local:', err);
            setErro(err.response?.data?.erro || 'E-mail ou senha incorretos.');
        } finally {
            setLoading(false);
        }
    };

    // 🎯 Se o usuário clicou em se cadastrar, renderizamos o componente Register.jsx
    if (registrando) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 px-4 py-8">
                <Register aoConcluirRegistro={() => setRegistrando(false)} />
                <div className="mt-4 text-center">
                    <button
                        onClick={() => setRegistrando(false)}
                        className="text-sm text-sky-400 hover:text-sky-300 font-medium underline cursor-pointer"
                    >
                        ← Voltar para a tela de Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-4">
                        <svg className="w-16 h-16 shadow-sm rounded-xl" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect width="40" height="40" rx="10" fill="#0284C7" />
                            <path d="M12 28V12L22 24V12" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M28 12V28" stroke="white" strokeWidth="4" strokeLinecap="round"/>
                        </svg>
                    </div>
                    <h1 className="text-2xl font-black text-gray-900 tracking-wider">NEXUS</h1>
                    <p className="text-sm font-bold text-sky-600 tracking-widest uppercase">Gestão Pericial</p>
                    <p className="text-sm text-gray-500 mt-4">Entre com sua conta interna do sistema</p>
                </div>

                {erro && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg text-center">
                        {erro}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">E-mail</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="seu.email@policiacivil.mg.gov.br" 
                            className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            required 
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Senha</label>
                        <input 
                            type="password" 
                            value={senha} 
                            onChange={(e) => setSenha(e.target.value)}
                            placeholder="••••••••" 
                            className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            required 
                        />
                    </div>

                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full bg-[#0284C7] hover:bg-sky-700 text-white font-semibold p-3.5 rounded-lg transition shadow-md disabled:bg-gray-400 cursor-pointer"
                    >
                        {loading ? 'Autenticando...' : 'Entrar no Nexus'}
                    </button>
                </form>

                {/* 🎯 Link para alternar para a tela de registro validado pelo PCNet */}
                <div className="mt-6 text-center border-t border-gray-100 pt-4">
                    <p className="text-xs text-gray-500">
                        Ainda não tem acesso ao sistema?{' '}
                        <button
                            onClick={() => setRegistrando(true)}
                            className="text-sky-600 hover:text-sky-800 font-semibold underline cursor-pointer"
                        >
                            Cadastre-se via PCNet
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}