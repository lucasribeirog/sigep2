import React, { useEffect, useState } from 'react';
import api from '../api/api';

export default function Register({ aoConcluirRegistro }) {
  const [form, setForm] = useState({ nome: '', email: '', masp: '', unidadeId: '', senha: '' });
  const [unidades, setUnidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  useEffect(() => {
    api.get('/unidades').then(r => setUnidades(r.data || [])).catch(() => setErro('Não foi possível carregar a lista de unidades.'));
  }, []);

  async function submit(e) {
    e.preventDefault(); setErro(''); setSucesso(''); setLoading(true);
    try {
      const r = await api.post('/register', { ...form, unidadeId: Number(form.unidadeId) });
      setSucesso(r.data?.mensagem || 'Administrador criado com sucesso!');
      setTimeout(() => aoConcluirRegistro?.(), 900);
    } catch (err) { setErro(err.response?.data?.erro || 'Não foi possível concluir a configuração inicial.'); }
    finally { setLoading(false); }
  }

  return <div className="max-w-md w-full bg-white rounded-xl shadow-2xl p-8">
    <div className="text-center mb-6"><h2 className="text-2xl font-black text-gray-900">Configuração inicial</h2><p className="text-sm text-gray-500 mt-2">Crie o primeiro administrador. As demais contas e unidades serão gerenciadas dentro do Nexus.</p></div>
    {erro && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{erro}</div>}
    {sucesso && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg">{sucesso}</div>}
    <form onSubmit={submit} className="space-y-4">
      {[['Nome completo','nome','text'],['E-mail','email','email'],['MASP','masp','text']].map(([label,key,type]) => <div key={key}><label className="block text-xs font-semibold text-gray-700 mb-1">{label} *</label><input type={type} value={form[key]} onChange={e => setForm({...form,[key]:e.target.value})} required className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none" /></div>)}
      <div><label className="block text-xs font-semibold text-gray-700 mb-1">Unidade *</label><select value={form.unidadeId} onChange={e => setForm({...form,unidadeId:e.target.value})} required className="w-full p-2.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-sky-500 outline-none"><option value="">-- Selecione --</option>{unidades.map(u => <option key={u.id} value={u.id}>{u.codigo_externo ? `${u.codigo_externo} — ` : ''}{u.nome}</option>)}</select></div>
      <div><label className="block text-xs font-semibold text-gray-700 mb-1">Senha (mín. 8 caracteres) *</label><input type="password" minLength="8" value={form.senha} onChange={e => setForm({...form,senha:e.target.value})} required autoComplete="new-password" className="w-full p-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-sky-500 outline-none" /></div>
      <button type="submit" disabled={loading || !unidades.length} className="w-full bg-[#0284C7] hover:bg-sky-700 text-white font-semibold p-3 rounded-lg text-sm transition disabled:opacity-50">{loading ? 'Configurando...' : 'Criar administrador'}</button>
    </form>
  </div>;
}
