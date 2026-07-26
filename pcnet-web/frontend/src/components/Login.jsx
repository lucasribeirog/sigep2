import React, { useState } from 'react';
import api from '../api/pcnet';

export default function Login({ onLoginSuccess }) {
    const [email, setEmail] = useState('');
    const [senha, setSenha] = useState('');
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setErro('');
        setLoading(true);

        try {
            const response = await api.post('/login', { email, senha });
            const { token, usuario } = response.data;
            
            localStorage.setItem('token', token);
            localStorage.setItem('usuario', JSON.stringify(usuario || { email }));

            if (onLoginSuccess) {
                onLoginSuccess(usuario || { email });
            }
        } catch (err) {
            console.error('Erro no login:', err);
            setErro('E-mail ou senha inválidos, ou erro de conexão com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-800">PCNet - Sistema Pericial</h1>
                    <p className="text-sm text-gray-500 mt-1">Entre com sua conta institucional</p>
                </div>

                {erro && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                        {erro}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">E-mail Institucional</label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="perito@policiacivil.mg.gov.br" 
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
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold p-3.5 rounded-lg transition shadow-md disabled:bg-gray-400 cursor-pointer"
                    >
                        {loading ? 'Autenticando...' : 'Entrar no Sistema'}
                    </button>
                </form>
            </div>
        </div>
    );
}