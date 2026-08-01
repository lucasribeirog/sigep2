import React, { useState } from 'react';
import api from '../api/pcnet';

export default function PcnetConfig() {
    const [cpf, setCpf] = useState('');
    const [senha, setSenha] = useState('');
    const [tipoEmail, setTipoEmail] = useState('principal');
    
    const [etapa2FA, setEtapa2FA] = useState(false);
    const [token, setToken] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');
    const [sucesso, setSucesso] = useState(false);

    const handleIniciarLogin = async (e) => {
        e.preventDefault();
        setErro('');
        setSucesso(false);
        setLoading(true);

        try {
            await api.post('/pcnet/login', { cpf, senha, tipoEmail });
            setEtapa2FA(true);
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro ao conectar o robô ao PCNet.');
        } finally {
            setLoading(false);
        }
    };

    const handleValidar2FA = async (e) => {
        e.preventDefault();
        setErro('');
        setLoading(true);

        try {
            const response = await api.post('/pcnet/confirmar-2fa', { cpf, token });
            if (response.data.status === 'SUCESSO') {
                localStorage.setItem('cpf_perito', cpf);
                setSucesso(true);
                setEtapa2FA(false);
                setToken('');
                setSenha(''); // Limpa a senha por segurança
            }
        } catch (err) {
            setErro(err.response?.data?.erro || 'Token inválido ou incorreto.');
        } finally {
            setLoading(false);
        }
    };

    const handleDesconectar = async () => {
        setLoading(true);
        try {
            await api.post('/pcnet/logout', { cpf });
            localStorage.removeItem('cpf_perito');
            setCpf('');
            setSucesso(false);
        } catch (err) {
            setErro('Erro ao tentar desconectar o robô.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-3xl mx-auto p-8 bg-white shadow-lg rounded-xl border border-gray-100">
            <div className="mb-8 border-b pb-4">
                <h2 className="text-2xl font-bold text-gray-800">Conexão PCNet (Robô)</h2>
                <p className="text-sm text-gray-500 mt-1">Conecte sua conta institucional para habilitar a automação de FAVs e exportação de CSV.</p>
            </div>

            {erro && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                    {erro}
                </div>
            )}

            {sucesso && (
                <div className="mb-6 p-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg flex justify-between items-center">
                    <div>
                        <strong>✅ Robô Conectado!</strong> A sessão do Puppeteer está ativa para o CPF: {cpf}.
                    </div>
                    <button 
                        onClick={handleDesconectar} 
                        disabled={loading}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-xs font-bold transition cursor-pointer"
                    >
                        Desconectar
                    </button>
                </div>
            )}

            {!etapa2FA ? (
                <form onSubmit={handleIniciarLogin} className="space-y-5 bg-gray-50 p-6 rounded-xl border border-gray-200" autoComplete="off">
                    <h3 className="font-bold text-gray-700 mb-2">Credenciais Institucionais</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">CPF</label>
                            <input 
                                type="text" 
                                value={cpf} 
                                onChange={(e) => setCpf(e.target.value)}
                                placeholder="Digite apenas números ou com pontos" 
                                className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white"
                                autoComplete="off"
                                required 
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Senha do PCNet</label>
                            <input 
                                type="password" 
                                value={senha} 
                                onChange={(e) => setSenha(e.target.value)}
                                placeholder="••••••••" 
                                className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white"
                                autoComplete="new-password"
                                required 
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 uppercase mb-1">Canal do Token 2FA</label>
                        <select 
                            value={tipoEmail} 
                            onChange={(e) => setTipoEmail(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white"
                        >
                            <option value="principal">E-mail Principal</option>
                            <option value="secundario">E-mail Secundário</option>
                        </select>
                    </div>
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="w-full md:w-auto bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition cursor-pointer"
                    >
                        {loading ? 'Ligando o Robô...' : 'Conectar ao PCNet'}
                    </button>
                </form>
            ) : (
                <form onSubmit={handleValidar2FA} className="space-y-5 bg-blue-50 p-6 rounded-xl border border-blue-200" autoComplete="off">
                    <h3 className="font-bold text-blue-900 mb-2">Verificação em Duas Etapas</h3>
                    <div>
                        <label className="block text-xs font-semibold text-blue-800 uppercase mb-1">Código de 6 Dígitos</label>
                        <input 
                            type="text" 
                            maxLength="6"
                            value={token} 
                            onChange={(e) => setToken(e.target.value)}
                            placeholder="000000" 
                            className="w-full md:w-1/2 p-3 border border-blue-300 rounded-lg text-center tracking-widest text-lg font-bold bg-white"
                            autoComplete="off"
                            required 
                        />
                    </div>
                    <div className="flex gap-4">
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition cursor-pointer"
                        >
                            {loading ? 'Validando...' : 'Confirmar Token'}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setEtapa2FA(false); setToken(''); }}
                            className="bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg transition cursor-pointer"
                        >
                            Cancelar
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
}