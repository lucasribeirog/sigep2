import React, { useState } from 'react';
import api from '../api/api';

export default function MinhaConta({ usuario }) {
    const [senhaAtual, setSenhaAtual] = useState('');
    const [novaSenha, setNovaSenha] = useState('');
    const [confirmacao, setConfirmacao] = useState('');

    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const [sucesso, setSucesso] = useState('');

    async function alterarSenha(event) {
        event.preventDefault();

        setErro('');
        setSucesso('');

        if (novaSenha.length < 8) {
            setErro(
                'A nova senha deve possuir pelo menos 8 caracteres.'
            );
            return;
        }

        if (novaSenha !== confirmacao) {
            setErro(
                'A confirmação não corresponde à nova senha.'
            );
            return;
        }

        try {
            setSalvando(true);

            const resposta = await api.post(
                '/auth/alterar-senha',
                {
                    senhaAtual,
                    novaSenha
                }
            );

            setSenhaAtual('');
            setNovaSenha('');
            setConfirmacao('');

            setSucesso(
                resposta.data?.mensagem ||
                'Senha alterada com sucesso.'
            );

        } catch (err) {
            setErro(
                err.response?.data?.erro ||
                'Não foi possível alterar a senha.'
            );
        } finally {
            setSalvando(false);
        }
    }

    return (
        <div className="max-w-2xl mx-auto space-y-6">

            <div>
                <h2 className="text-2xl font-black text-gray-900">
                    Minha conta
                </h2>

                <p className="text-sm text-gray-500 mt-1">
                    Dados do usuário e segurança da conta.
                </p>
            </div>

            <div className="bg-white rounded-2xl border p-6">
                <h3 className="font-bold text-gray-900 mb-4">
                    Dados do usuário
                </h3>

                <div className="grid sm:grid-cols-2 gap-4 text-sm">

                    <div>
                        <div className="text-xs uppercase font-bold text-gray-400">
                            Nome
                        </div>
                        <div className="mt-1">
                            {usuario?.nome}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs uppercase font-bold text-gray-400">
                            E-mail
                        </div>
                        <div className="mt-1">
                            {usuario?.email}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs uppercase font-bold text-gray-400">
                            MASP
                        </div>
                        <div className="mt-1">
                            {usuario?.masp}
                        </div>
                    </div>

                    <div>
                        <div className="text-xs uppercase font-bold text-gray-400">
                            Unidade
                        </div>
                        <div className="mt-1">
                            {usuario?.unidade}
                        </div>
                    </div>

                </div>
            </div>

            <div className="bg-white rounded-2xl border p-6">

                <h3 className="font-bold text-gray-900">
                    Alterar senha
                </h3>

                <p className="text-xs text-gray-500 mt-1 mb-5">
                    Informe sua senha atual antes de definir uma nova.
                </p>

                {erro && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                        {erro}
                    </div>
                )}

                {sucesso && (
                    <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                        ✓ {sucesso}
                    </div>
                )}

                <form
                    onSubmit={alterarSenha}
                    className="space-y-4"
                >

                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">
                            Senha atual
                        </label>

                        <input
                            type="password"
                            autoComplete="current-password"
                            required
                            value={senhaAtual}
                            onChange={
                                e => setSenhaAtual(e.target.value)
                            }
                            className="w-full border rounded-lg p-3"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">
                            Nova senha
                        </label>

                        <input
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={8}
                            value={novaSenha}
                            onChange={
                                e => setNovaSenha(e.target.value)
                            }
                            className="w-full border rounded-lg p-3"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-gray-600 mb-1">
                            Confirmar nova senha
                        </label>

                        <input
                            type="password"
                            autoComplete="new-password"
                            required
                            minLength={8}
                            value={confirmacao}
                            onChange={
                                e => setConfirmacao(e.target.value)
                            }
                            className="w-full border rounded-lg p-3"
                        />
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="submit"
                            disabled={salvando}
                            className="bg-[#0284C7] hover:bg-sky-700 disabled:bg-gray-400 text-white font-semibold px-5 py-2.5 rounded-lg"
                        >
                            {salvando
                                ? 'Alterando...'
                                : 'Alterar senha'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
}