import React, { useState } from 'react';
import api from '../api/pcnet';

export default function Register({ aoConcluirRegistro }) {
    // Etapa 1: Credenciais do PCNet
    const [cpfPcnet, setCpfPcnet] = useState('');
    const [senhaPcnet, setSenhaPcnet] = useState('');
    
    // Controle de fases da validação
    const [etapa2Fa, setEtapa2Fa] = useState(false);
    const [token, setToken] = useState('');
    const [validadoPcnet, setValidadoPcnet] = useState(false);

    // Etapa 2: Dados do perfil no Nexus
    const [form, setForm] = useState({
        nome: '',
        email: '',
        senha: '',
        masp: '',
        unidade: ''
    });

    const [loading, setLoading] = useState(false);
    const [erro, setErro] = useState('');
    const [sucesso, setSucesso] = useState('');

    // 1. Envia CPF e Senha para solicitar o 2FA no PCNet
    const handleValidarPcnet = async (e) => {
        e.preventDefault();
        setErro('');
        setLoading(true);

        try {
            const res = await api.post('/pcnet/confirmar-2fa', { cpf: cpfPcnet, senha: senhaPcnet });
            if (res.data.status === 'REQUER_2FA') {
                setEtapa2Fa(true);
                setSucesso('Código de verificação enviado para o seu e-mail cadastrado no PCNet.');
            }
        } catch (err) {
            setErro(err.response?.data?.erro || 'Falha ao validar no PCNet. Verifique suas credenciais.');
        } finally {
            setLoading(false);
        }
    };

    // 2. Confirma o token 2FA para liberar o cadastro no Nexus
    const handleConfirmar2Fa = async (e) => {
        e.preventDefault();
        setErro('');
        setLoading(true);

        try {
            await api.post('/pcnet/2fa', { cpf: cpfPcnet, token });
            setValidadoPcnet(true);
            setSucesso('Acesso ao PCNet validado com sucesso! Preencha seus dados do Nexus.');
        } catch (err) {
            setErro(err.response?.data?.erro || 'Código 2FA inválido ou expirado.');
        } finally {
            setLoading(false);
        }
    };

    // 3. Finaliza o cadastro no banco local do Nexus
    const handleCadastrarNexus = async (e) => {
        e.preventDefault();
        setErro('');
        setLoading(true);

        try {
            await api.post('/registrar', form);
            alert('Cadastro realizado com sucesso! Faça login com sua nova conta.');
            if (aoConcluirRegistro) aoConcluirRegistro();
        } catch (err) {
            setErro(err.response?.data?.erro || 'Erro ao registrar usuário no Nexus.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto p-6 bg-white shadow-lg rounded-xl border border-gray-100 mt-10">
            <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">Registro de Perito - Nexus</h2>

            {erro && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded border border-red-200">{erro}</div>}
            {sucesso && <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded border border-green-200">{sucesso}</div>}

            {/* FASE 1: Digitar CPF e Senha do PCNet */}
            {!etapa2Fa && !validadoPcnet && (
                <form onSubmit={handleValidarPcnet} className="space-y-4">
                    <p className="text-xs text-gray-500 mb-2">
                        Para se cadastrar, valide primeiro suas credenciais oficiais do PCNet.
                    </p>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">CPF (PCNet) *</label>
                        <input
                            type="text"
                            value={cpfPcnet}
                            onChange={(e) => setCpfPcnet(e.target.value)}
                            required
                            className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="Somente números"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Senha (PCNet) *</label>
                        <input
                            type="password"
                            value={senhaPcnet}
                            onChange={(e) => setSenhaPcnet(e.target.value)}
                            required
                            className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="••••••••"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold p-2.5 rounded text-sm transition cursor-pointer disabled:opacity-50"
                    >
                        {loading ? 'Conectando ao PCNet...' : 'Avançar (Enviar Código)'}
                    </button>
                </form>
            )}

            {/* FASE 1.5: Digitar o código 2FA enviado por e-mail */}
            {etapa2Fa && !validadoPcnet && (
                <form onSubmit={handleConfirmar2Fa} className="space-y-4">
                    <p className="text-xs text-gray-600 mb-2 font-medium">
                        Digite o código de 6 dígitos enviado para o seu e-mail institucional:
                    </p>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Código 2FA *</label>
                        <input
                            type="text"
                            value={token}
                            onChange={(e) => setToken(e.target.value)}
                            required
                            maxLength="6"
                            className="w-full p-2 border border-gray-300 rounded text-center tracking-widest text-lg font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="000000"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold p-2.5 rounded text-sm transition cursor-pointer disabled:opacity-50"
                    >
                        {loading ? 'Verificando Código...' : 'Confirmar Código'}
                    </button>
                </form>
            )}

            {/* FASE 2: Formulário de Cadastro do Nexus (Liberado após 2FA) */}
            {validadoPcnet && (
                <form onSubmit={handleCadastrarNexus} className="space-y-4">
                    <p className="text-xs text-green-600 font-semibold mb-2">✔ Acesso validado! Agora defina seu perfil no Nexus:</p>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Nome Completo *</label>
                        <input
                            type="text"
                            name="nome"
                            value={form.nome}
                            onChange={(e) => setForm({ ...form, nome: e.target.value })}
                            required
                            className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">E-mail de Acesso *</label>
                        <input
                            type="email"
                            name="email"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                            required
                            className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">MASP *</label>
                            <input
                                type="text"
                                name="masp"
                                value={form.masp}
                                onChange={(e) => setForm({ ...form, masp: e.target.value })}
                                required
                                className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Unidade *</label>
                            <input
                                type="text"
                                name="unidade"
                                value={form.unidade}
                                onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                                required
                                className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Senha para o Nexus *</label>
                        <input
                            type="password"
                            name="senha"
                            value={form.senha}
                            onChange={(e) => setForm({ ...form, senha: e.target.value })}
                            required
                            className="w-full p-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold p-2.5 rounded text-sm transition cursor-pointer disabled:opacity-50"
                    >
                        {loading ? 'Salvando...' : 'Finalizar Cadastro'}
                    </button>
                </form>
            )}
        </div>
    );
}