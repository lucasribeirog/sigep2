import React, { useState } from 'react';
import api from '../api/pcnet';

export default function Login({ onLoginSuccess }) {
    const [cpf, setCpf] = useState('');
    const [senha, setSenha] = useState('');
    const [tipoEmail, setTipoEmail] = useState('principal');
    
    // Estado para controlar se já estamos na etapa de digitar o token 2FA
    const [etapa2FA, setEtapa2FA] = useState(false);
    const [token, setToken] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');

    // Passo 1: Envia o CPF, Senha e o tipo de e-mail para disparar o 2FA
    const handleIniciarLogin = async (e) => {
        e.preventDefault();
        setErro('');
        setLoading(true);

        try {
            // Enviamos os dois formatos ('email' e 'cpf') para garantir que o backend pegue o correto
            const payload = {
                email: cpf,  // se o backend usa req.body.email
                cpf: cpf,    // se o backend usa req.body.cpf
                senha: senha,
                tipoEmail: tipoEmail
            };

            const response = await api.post('/pcnet/login', payload);
            
            // Se passou, avança para a tela de 2FA
            setEtapa2FA(true);
        } catch (err) {
            console.error('Erro no login:', err);
            setErro(err.response?.data?.erro || 'Erro ao conectar com o servidor.');
        } finally {
            setLoading(false);
        }
    };

    // Passo 2: Valida o token 2FA de 6 dígitos enviando o CPF junto
    const handleValidar2FA = async (e) => {
        e.preventDefault();
        setErro('');
        setLoading(true);

        try {
            const response = await api.post('/pcnet/confirmar-2fa', { cpf, token });
            const { status } = response.data;

            if (status === 'SUCESSO') {
                const dadosUsuario = { cpf }; 
                localStorage.setItem('usuario', JSON.stringify(dadosUsuario));

                if (onLoginSuccess) {
                    onLoginSuccess(dadosUsuario);
                }
            }
        } catch (err) {
            console.error('Erro no 2FA:', err);
            setErro(err.response?.data?.erro || 'Token inválido ou incorreto.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-800">PCNet - Sistema Pericial</h1>
                    <p className="text-sm text-gray-500 mt-1">
                        {etapa2FA ? 'Digite o código de verificação enviado por e-mail' : 'Entre com sua conta institucional'}
                    </p>
                </div>

                {erro && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                        {erro}
                    </div>
                )}

                {!etapa2FA ? (
                    /* ETAPA 1: CREDENCIAIS (CPF) */
                    <form onSubmit={handleIniciarLogin} className="space-y-5">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">CPF</label>
                            <input 
                                type="text" 
                                value={cpf} 
                                onChange={(e) => setCpf(e.target.value)}
                                placeholder="Digite seu CPF" 
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

                        <div>
                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Canal do Token 2FA</label>
                            <select 
                                value={tipoEmail} 
                                onChange={(e) => setTipoEmail(e.target.value)}
                                className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none bg-white cursor-pointer"
                            >
                                <option value="principal">E-mail Principal</option>
                                <option value="secundario">E-mail Secundário</option>
                            </select>
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold p-3.5 rounded-lg transition shadow-md disabled:bg-gray-400 cursor-pointer"
                        >
                            {loading ? 'Conectando ao PCNet...' : 'Avançar / Enviar 2FA'}
                        </button>
                    </form>
                ) : (
                    /* ETAPA 2: DIGITAÇÃO DO TOKEN 2FA */
                    <form onSubmit={handleValidar2FA} className="space-y-5">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Código de 6 Dígitos</label>
                            <input 
                                type="text" 
                                maxLength="6"
                                value={token} 
                                onChange={(e) => setToken(e.target.value)}
                                placeholder="000000" 
                                className="w-full p-3 border border-gray-300 rounded-lg text-center tracking-widest text-lg font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                required 
                            />
                            <p className="text-[11px] text-gray-400 mt-2 text-center">
                                O código de segurança expira em aproximadamente 2 minutos.
                            </p>
                        </div>

                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold p-3.5 rounded-lg transition shadow-md disabled:bg-gray-400 cursor-pointer"
                        >
                            {loading ? 'Validando Token...' : 'Confirmar e Entrar'}
                        </button>

                        {/* Botão de retorno caso o token expire */}
                        <div className="text-center mt-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setEtapa2FA(false); 
                                    setToken('');       
                                    setErro('');        
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium transition cursor-pointer"
                            >
                                Não recebeu ou o token expirou? Voltar e solicitar novo código
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}