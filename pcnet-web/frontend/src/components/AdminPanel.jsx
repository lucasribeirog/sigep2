import React, { useEffect, useMemo, useState } from 'react';
import api from '../api/api';

const emptySpecies = { natureza: '', especie: '', nome_exibicao: '', formulario: 'balistica', descricao: '', ativo: true, ordem: 0 };
const emptyUser = { nome: '', email: '', masp: '', unidadeId: '', senha: '', role: 'usuario' };
const emptyUnit = { codigo_externo: '', nome: '', ativo: true, ordem: 0 };

const fmtBytes = n => !n ? '—' : n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;

async function baixar(url, nome) {
  const r = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(r.data);
  const a = document.createElement('a');
  a.href = href; a.download = nome || 'template.docx';
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(href);
}

function Modal({ children, max = 'max-w-xl' }) {
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"><div className={`bg-white rounded-2xl p-6 w-full ${max} max-h-[92vh] overflow-auto shadow-2xl`}>{children}</div></div>;
}

export default function AdminPanel({ usuario, onCatalogoAlterado }) {
  const [tab, setTab] = useState('visao');
  const [dash, setDash] = useState({});
  const [especies, setEspecies] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [formularios, setFormularios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [speciesModal, setSpeciesModal] = useState(null);
  const [userModal, setUserModal] = useState(null);
  const [unitModal, setUnitModal] = useState(null);
  const [importModal, setImportModal] = useState(null);
  const [senhaModal, setSenhaModal] = useState(null);
  const [history, setHistory] = useState(null);
  const [diagnostic, setDiagnostic] = useState(null);

  const unidadesAtivas = useMemo(() => unidades.filter(u => u.ativo), [unidades]);

  async function carregar() {
    setLoading(true);
    try {
      const [d, e, u, f, un] = await Promise.all([
        api.get('/admin/dashboard'), api.get('/admin/especies'), api.get('/admin/usuarios'), api.get('/admin/formularios'), api.get('/admin/unidades')
      ]);
      setDash(d.data || {}); setEspecies(e.data || []); setUsuarios(u.data || []); setFormularios(f.data || []); setUnidades(un.data || []);
    } catch (e) { alert(e.response?.data?.erro || 'Falha ao carregar administração.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { carregar(); }, []);

  async function saveSpecies(e) {
    e.preventDefault(); setBusy(true);
    try {
      if (speciesModal.id) await api.patch(`/admin/especies/${speciesModal.id}`, speciesModal.data);
      else await api.post('/admin/especies', speciesModal.data);
      setSpeciesModal(null); await carregar(); onCatalogoAlterado?.();
    } catch (e) { alert(e.response?.data?.erro || 'Erro ao salvar espécie.'); }
    finally { setBusy(false); }
  }
  async function toggleSpecies(s) {
    try { await api.patch(`/admin/especies/${s.id}`, { ativo: !s.ativo }); await carregar(); onCatalogoAlterado?.(); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao alterar espécie.'); }
  }
  async function uploadTemplate(s, file) {
    if (!file) return; const fd = new FormData(); fd.append('arquivo', file); setBusy(true);
    try {
      const r = await api.post(`/admin/especies/${s.id}/template`, fd);
      const avisos = r.data?.diagnostico?.avisos || [];
      alert(`${r.data.mensagem || 'Template salvo.'}${avisos.length ? `\n\nAtenção:\n- ${avisos.join('\n- ')}` : ''}`);
      await carregar(); onCatalogoAlterado?.();
    }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao enviar template.'); }
    finally { setBusy(false); }
  }
  async function openHistory(s) {
    try { setHistory({ s, rows: (await api.get(`/admin/especies/${s.id}/templates`)).data || [] }); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao carregar histórico.'); }
  }
  async function restoreVersion(v) {
    if (!confirm(`Restaurar a versão ${v.versao} como novo template ativo?`)) return;
    try { await api.post(`/admin/especies/${history.s.id}/templates/${v.versao}/restaurar`); setHistory(null); await carregar(); onCatalogoAlterado?.(); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao restaurar.'); }
  }
  async function removeTemplate(s) {
    if (!confirm('Remover o template atual? O histórico de versões será preservado.')) return;
    try { await api.delete(`/admin/especies/${s.id}/template`); await carregar(); onCatalogoAlterado?.(); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao remover template.'); }
  }

  async function saveUser(e) {
    e.preventDefault(); setBusy(true);
    try {
      const data = { ...userModal.data, unidadeId: Number(userModal.data.unidadeId) };
      if (userModal.id) { delete data.senha; await api.patch(`/admin/usuarios/${userModal.id}`, data); }
      else await api.post('/admin/usuarios', data);
      setUserModal(null); await carregar();
    } catch (e) { alert(e.response?.data?.erro || 'Erro ao salvar usuário.'); }
    finally { setBusy(false); }
  }
  async function toggleUser(u) {
    try { await api.patch(`/admin/usuarios/${u.id}`, { ativo: !u.ativo }); await carregar(); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao alterar usuário.'); }
  }
  async function resetPassword(e) {
    e.preventDefault(); setBusy(true);
    try { await api.post(`/admin/usuarios/${senhaModal.id}/redefinir-senha`, { senha: senhaModal.senha }); setSenhaModal(null); alert('Senha redefinida.'); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao redefinir senha.'); }
    finally { setBusy(false); }
  }

  async function saveUnit(e) {
    e.preventDefault(); setBusy(true);
    try {
      if (unitModal.id) await api.patch(`/admin/unidades/${unitModal.id}`, unitModal.data);
      else await api.post('/admin/unidades', unitModal.data);
      setUnitModal(null); await carregar();
    } catch (e) { alert(e.response?.data?.erro || 'Erro ao salvar unidade.'); }
    finally { setBusy(false); }
  }
  async function toggleUnit(u) {
    try { await api.patch(`/admin/unidades/${u.id}`, { ativo: !u.ativo }); await carregar(); }
    catch (e) { alert(e.response?.data?.erro || 'Erro ao alterar unidade.'); }
  }
  async function importarUnidades(e) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await api.post('/admin/unidades/importar', { conteudo: importModal.conteudo });
      alert(r.data?.mensagem || 'Importação concluída.'); setImportModal(null); await carregar();
    } catch (e) { alert(e.response?.data?.erro || 'Erro ao importar unidades.'); }
    finally { setBusy(false); }
  }

  if (loading) return <div className="bg-white border rounded-2xl p-10 text-center">Carregando administração...</div>;

  return <div className="space-y-6">
    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
      <div><h2 className="text-2xl font-black">Administração do Nexus</h2><p className="text-sm text-gray-500">Espécies, templates, usuários e unidades gerenciados pelo próprio aplicativo.</p></div>
      <div className="bg-white border rounded-xl p-1 flex flex-wrap">
        {[['visao','Visão geral'],['especies','Espécies e templates'],['usuarios','Usuários'],['unidades','Unidades']].map(([k,l]) => <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === k ? 'bg-sky-600 text-white' : 'text-gray-600'}`}>{l}</button>)}
      </div>
    </div>

    {tab === 'visao' && <>
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[['Usuários',dash.usuarios,'👥'],['Admins',dash.administradores,'🔐'],['Espécies ativas',dash.especiesAtivas,'🧾'],['Templates',dash.templates,'📄'],['Sem template',dash.semTemplate,'⚠️'],['Unidades ativas',dash.unidades,'🏢']].map(([l,n,i]) => <div key={l} className="bg-white border rounded-2xl p-5"><div className="text-2xl">{i}</div><div className="text-3xl font-black mt-2">{n ?? 0}</div><div className="text-sm text-gray-500">{l}</div></div>)}
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white border rounded-2xl p-6 text-sm text-gray-600"><h3 className="font-bold text-gray-900 text-lg mb-3">Catálogo de laudos</h3><p>Uma espécie precisa estar <b>ativa</b> e possuir um <b>template DOCX ativo</b>. O formulário selecionado define os campos e a lógica técnica usados na geração.</p></div>
        <div className="bg-white border rounded-2xl p-6 text-sm text-gray-600"><h3 className="font-bold text-gray-900 text-lg mb-3">Cadastro institucional</h3><p>Usuários selecionam uma <b>unidade cadastrada</b>. Novas unidades podem ser criadas manualmente ou importadas em lote na aba Unidades.</p></div>
      </div>
    </>}

    {tab === 'especies' && <div className="space-y-4">
      <div className="flex justify-between items-center gap-3"><div><h3 className="font-bold text-lg">Catálogo de espécies</h3><p className="text-xs text-gray-500">Templates são versionados automaticamente a cada upload.</p></div><button onClick={() => setSpeciesModal({ id: null, data: { ...emptySpecies } })} className="bg-sky-600 text-white px-4 py-2 rounded-lg font-semibold">+ Nova espécie</button></div>
      <div className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr>{['Espécie','Formulário','Status','Template','Ações'].map(x => <th key={x} className="text-left px-4 py-3">{x}</th>)}</tr></thead><tbody>
        {especies.map(s => <tr key={s.id} className="border-t align-top"><td className="px-4 py-4 min-w-[260px]"><b>{s.nome_exibicao}</b><div className="text-xs text-sky-700">{s.natureza}</div><div className="text-[11px] text-gray-400">{s.especie}</div></td><td className="px-4 py-4 text-xs">{formularios.find(f => f.id === s.formulario)?.nome || s.formulario}</td><td className="px-4 py-4"><button onClick={() => toggleSpecies(s)} className={`px-2 py-1 rounded-full text-xs font-bold ${s.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{s.ativo ? 'Ativa' : 'Inativa'}</button></td><td className="px-4 py-4 min-w-[230px]">{s.tem_template ? <><div className="text-emerald-700 font-semibold">✓ v{s.template_versao} — {s.nome_arquivo}</div><div className="flex items-center gap-2 mt-1"><span className="text-xs text-gray-400">{fmtBytes(s.template_bytes)}</span><span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${s.status_template === 'compativel' ? 'bg-emerald-100 text-emerald-700' : s.status_template === 'invalido' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{s.status_template === 'compativel' ? 'COMPATÍVEL' : s.status_template === 'invalido' ? 'INVÁLIDO' : 'ATENÇÃO'}</span></div></> : <div className="text-amber-700 font-semibold">Sem template</div>}<label className="block mt-2 text-xs text-sky-700 font-semibold cursor-pointer"><input className="hidden" type="file" accept=".docx" disabled={busy} onChange={e => { uploadTemplate(s, e.target.files?.[0]); e.target.value = ''; }} />{s.tem_template ? 'Substituir template' : 'Enviar template DOCX'}</label></td><td className="px-4 py-4"><div className="flex flex-wrap gap-2"><button onClick={() => setSpeciesModal({ id: s.id, data: { natureza: s.natureza, especie: s.especie, nome_exibicao: s.nome_exibicao, formulario: s.formulario, descricao: s.descricao || '', ativo: s.ativo, ordem: s.ordem || 0 } })} className="border px-2 py-1 rounded">Editar</button>{s.tem_template && <button onClick={() => baixar(`/admin/especies/${s.id}/template`, s.nome_arquivo)} className="border px-2 py-1 rounded">Baixar</button>}{s.tem_template && <button onClick={() => setDiagnostic(s)} className="border px-2 py-1 rounded text-violet-700">Diagnóstico</button>}<button onClick={() => openHistory(s)} className="border px-2 py-1 rounded">Histórico</button>{s.tem_template && <button onClick={() => removeTemplate(s)} className="border px-2 py-1 rounded text-red-600">Remover</button>}</div></td></tr>)}
      </tbody></table></div>
    </div>}

    {tab === 'usuarios' && <div className="space-y-4">
      <div className="flex justify-between items-center gap-3"><div><h3 className="font-bold text-lg">Usuários</h3><p className="text-xs text-gray-500">A unidade é sempre escolhida do catálogo institucional.</p></div><button onClick={() => setUserModal({ id: null, data: { ...emptyUser } })} className="bg-sky-600 text-white px-4 py-2 rounded-lg font-semibold">+ Novo usuário</button></div>
      <div className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr>{['Nome','MASP','Unidade','Perfil','Status','Ações'].map(x => <th key={x} className="text-left px-4 py-3">{x}</th>)}</tr></thead><tbody>
        {usuarios.map(u => <tr key={u.id} className="border-t"><td className="px-4 py-4"><b>{u.nome}</b><div className="text-xs text-gray-500">{u.email}</div></td><td className="px-4 py-4">{u.masp}</td><td className="px-4 py-4 min-w-[200px]">{u.unidade}</td><td className="px-4 py-4"><span className={`text-xs font-bold px-2 py-1 rounded-full ${u.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600'}`}>{u.role === 'admin' ? 'Administrador' : 'Usuário'}</span></td><td className="px-4 py-4"><button disabled={u.id === usuario.id} onClick={() => toggleUser(u)} className={`px-2 py-1 rounded-full text-xs font-bold disabled:opacity-40 ${u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{u.ativo ? 'Ativo' : 'Inativo'}</button></td><td className="px-4 py-4"><div className="flex gap-2"><button onClick={() => setUserModal({ id: u.id, data: { nome: u.nome, email: u.email, masp: u.masp, unidadeId: String(u.unidade_id || ''), senha: '', role: u.role } })} className="border px-2 py-1 rounded">Editar</button><button onClick={() => setSenhaModal({ id: u.id, nome: u.nome, senha: '' })} className="border px-2 py-1 rounded">Senha</button></div></td></tr>)}
      </tbody></table></div>
    </div>}

    {tab === 'unidades' && <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3"><div><h3 className="font-bold text-lg">Unidades</h3><p className="text-xs text-gray-500">Lista usada no cadastro inicial e na gestão de usuários.</p></div><div className="flex gap-2"><button onClick={() => setImportModal({ conteudo: '' })} className="border border-sky-600 text-sky-700 px-4 py-2 rounded-lg font-semibold">⇩ Importar lista</button><button onClick={() => setUnitModal({ id: null, data: { ...emptyUnit, ordem: unidades.length + 1 } })} className="bg-sky-600 text-white px-4 py-2 rounded-lg font-semibold">+ Nova unidade</button></div></div>
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><b>Importação rápida:</b> você pode colar diretamente linhas HTML como <code className="bg-white px-1 rounded">&lt;option value="71"&gt;STRC Pedra Azul - STRC Pedra Azul&lt;/option&gt;</code>. O Nexus extrai código e nome automaticamente.</div>
      <div className="bg-white border rounded-2xl overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50"><tr>{['Código','Unidade','Usuários','Status','Ações'].map(x => <th key={x} className="text-left px-4 py-3">{x}</th>)}</tr></thead><tbody>
        {unidades.map(u => <tr key={u.id} className="border-t"><td className="px-4 py-4 text-gray-500">{u.codigo_externo || '—'}</td><td className="px-4 py-4 font-semibold min-w-[240px]">{u.nome}</td><td className="px-4 py-4">{u.usuarios_vinculados || 0}</td><td className="px-4 py-4"><button onClick={() => toggleUnit(u)} className={`px-2 py-1 rounded-full text-xs font-bold ${u.ativo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{u.ativo ? 'Ativa' : 'Inativa'}</button></td><td className="px-4 py-4"><button onClick={() => setUnitModal({ id: u.id, data: { codigo_externo: u.codigo_externo || '', nome: u.nome, ativo: u.ativo, ordem: u.ordem || 0 } })} className="border px-2 py-1 rounded">Editar</button></td></tr>)}
      </tbody></table></div>
    </div>}

    {speciesModal && <Modal><form onSubmit={saveSpecies} className="space-y-4"><div className="flex justify-between"><h3 className="text-xl font-black">{speciesModal.id ? 'Editar espécie' : 'Nova espécie'}</h3><button type="button" onClick={() => setSpeciesModal(null)}>✕</button></div>{[['Natureza','natureza'],['Nome oficial da espécie','especie'],['Nome de exibição','nome_exibicao']].map(([l,k]) => <div key={k}><label className="block text-xs font-semibold mb-1">{l} *</label><input required value={speciesModal.data[k]} onChange={e => setSpeciesModal(v => ({...v,data:{...v.data,[k]:e.target.value}}))} className="w-full border rounded-lg p-2.5" /></div>)}<div><label className="block text-xs font-semibold mb-1">Modelo de formulário *</label><select required value={speciesModal.data.formulario} onChange={e => setSpeciesModal(v => ({...v,data:{...v.data,formulario:e.target.value}}))} className="w-full border rounded-lg p-2.5 bg-white">{formularios.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}</select></div><div><label className="block text-xs font-semibold mb-1">Descrição</label><textarea rows="3" value={speciesModal.data.descricao} onChange={e => setSpeciesModal(v => ({...v,data:{...v.data,descricao:e.target.value}}))} className="w-full border rounded-lg p-2.5" /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-semibold mb-1">Ordem</label><input type="number" value={speciesModal.data.ordem} onChange={e => setSpeciesModal(v => ({...v,data:{...v.data,ordem:Number(e.target.value)}}))} className="w-full border rounded-lg p-2.5" /></div><label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={speciesModal.data.ativo} onChange={e => setSpeciesModal(v => ({...v,data:{...v.data,ativo:e.target.checked}}))} /> Ativa</label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setSpeciesModal(null)} className="border px-4 py-2 rounded-lg">Cancelar</button><button disabled={busy} className="bg-sky-600 text-white px-4 py-2 rounded-lg">Salvar</button></div></form></Modal>}

    {userModal && <Modal><form onSubmit={saveUser} className="space-y-4"><div className="flex justify-between"><h3 className="text-xl font-black">{userModal.id ? 'Editar usuário' : 'Novo usuário'}</h3><button type="button" onClick={() => setUserModal(null)}>✕</button></div>{[['Nome','nome','text'],['E-mail','email','email'],['MASP','masp','text']].map(([l,k,t]) => <div key={k}><label className="block text-xs font-semibold mb-1">{l} *</label><input type={t} required value={userModal.data[k]} onChange={e => setUserModal(v => ({...v,data:{...v.data,[k]:e.target.value}}))} className="w-full border rounded-lg p-2.5" /></div>)}<div><label className="block text-xs font-semibold mb-1">Unidade *</label><select required value={userModal.data.unidadeId} onChange={e => setUserModal(v => ({...v,data:{...v.data,unidadeId:e.target.value}}))} className="w-full border rounded-lg p-2.5 bg-white"><option value="">-- Selecione --</option>{unidadesAtivas.map(u => <option key={u.id} value={u.id}>{u.codigo_externo ? `${u.codigo_externo} — ` : ''}{u.nome}</option>)}</select></div><div><label className="block text-xs font-semibold mb-1">Perfil *</label><select value={userModal.data.role} onChange={e => setUserModal(v => ({...v,data:{...v.data,role:e.target.value}}))} className="w-full border rounded-lg p-2.5 bg-white"><option value="usuario">Usuário</option><option value="admin">Administrador</option></select></div>{!userModal.id && <div><label className="block text-xs font-semibold mb-1">Senha inicial *</label><input type="password" minLength="8" required value={userModal.data.senha} onChange={e => setUserModal(v => ({...v,data:{...v.data,senha:e.target.value}}))} className="w-full border rounded-lg p-2.5" /></div>}<div className="flex justify-end gap-2"><button type="button" onClick={() => setUserModal(null)} className="border px-4 py-2 rounded-lg">Cancelar</button><button disabled={busy} className="bg-sky-600 text-white px-4 py-2 rounded-lg">Salvar</button></div></form></Modal>}

    {unitModal && <Modal><form onSubmit={saveUnit} className="space-y-4"><div className="flex justify-between"><h3 className="text-xl font-black">{unitModal.id ? 'Editar unidade' : 'Nova unidade'}</h3><button type="button" onClick={() => setUnitModal(null)}>✕</button></div><div><label className="block text-xs font-semibold mb-1">Código externo</label><input value={unitModal.data.codigo_externo} onChange={e => setUnitModal(v => ({...v,data:{...v.data,codigo_externo:e.target.value}}))} placeholder="Ex.: 71" className="w-full border rounded-lg p-2.5" /></div><div><label className="block text-xs font-semibold mb-1">Nome da unidade *</label><input required value={unitModal.data.nome} onChange={e => setUnitModal(v => ({...v,data:{...v.data,nome:e.target.value}}))} placeholder="Ex.: STRC Pedra Azul" className="w-full border rounded-lg p-2.5" /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-semibold mb-1">Ordem</label><input type="number" value={unitModal.data.ordem} onChange={e => setUnitModal(v => ({...v,data:{...v.data,ordem:Number(e.target.value)}}))} className="w-full border rounded-lg p-2.5" /></div><label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={unitModal.data.ativo} onChange={e => setUnitModal(v => ({...v,data:{...v.data,ativo:e.target.checked}}))} /> Ativa</label></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setUnitModal(null)} className="border px-4 py-2 rounded-lg">Cancelar</button><button disabled={busy} className="bg-sky-600 text-white px-4 py-2 rounded-lg">Salvar</button></div></form></Modal>}

    {importModal && <Modal max="max-w-2xl"><form onSubmit={importarUnidades} className="space-y-4"><div className="flex justify-between"><div><h3 className="text-xl font-black">Importar unidades em lote</h3><p className="text-xs text-gray-500 mt-1">Uma unidade por linha. Duplicadas são ignoradas.</p></div><button type="button" onClick={() => setImportModal(null)}>✕</button></div><div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1"><div><b>HTML:</b> &lt;option value="71"&gt;STRC Pedra Azul - STRC Pedra Azul&lt;/option&gt;</div><div><b>CSV simples:</b> 71;STRC Pedra Azul</div><div><b>Texto:</b> STRC Pedra Azul</div></div><textarea autoFocus required rows="14" value={importModal.conteudo} onChange={e => setImportModal({conteudo:e.target.value})} placeholder="Cole aqui a lista de unidades..." className="w-full border rounded-lg p-3 font-mono text-xs" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setImportModal(null)} className="border px-4 py-2 rounded-lg">Cancelar</button><button disabled={busy} className="bg-sky-600 text-white px-4 py-2 rounded-lg">Importar</button></div></form></Modal>}

    {senhaModal && <Modal max="max-w-md"><form onSubmit={resetPassword} className="space-y-4"><h3 className="text-lg font-black">Redefinir senha — {senhaModal.nome}</h3><input type="password" minLength="8" required value={senhaModal.senha} onChange={e => setSenhaModal(v => ({...v,senha:e.target.value}))} placeholder="Nova senha (mín. 8 caracteres)" className="w-full border rounded-lg p-3" /><div className="flex justify-end gap-2"><button type="button" onClick={() => setSenhaModal(null)} className="border px-4 py-2 rounded-lg">Cancelar</button><button disabled={busy} className="bg-sky-600 text-white px-4 py-2 rounded-lg">Redefinir</button></div></form></Modal>}

    {diagnostic && <Modal max="max-w-3xl"><div className="flex justify-between mb-4"><div><h3 className="text-xl font-black">Diagnóstico do template</h3><p className="text-xs text-gray-500">{diagnostic.nome_exibicao} · v{diagnostic.template_versao}</p></div><button onClick={() => setDiagnostic(null)}>✕</button></div>{diagnostic.template_manifesto ? <div className="space-y-4 text-sm"><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Status',diagnostic.status_template],['Tags',diagnostic.template_manifesto.totalTags],['Campos extras',diagnostic.template_manifesto.camposCustomizados?.length || 0],['Condições extras',diagnostic.template_manifesto.condicoesCustomizadas?.length || 0]].map(([l,v]) => <div key={l} className="border rounded-xl p-3"><div className="text-[10px] uppercase text-gray-400 font-bold">{l}</div><div className="font-bold mt-1">{v}</div></div>)}</div><div><b>Variáveis detectadas</b><div className="mt-2 flex flex-wrap gap-1">{(diagnostic.template_manifesto.simples || []).map(x => <code key={x} className="bg-gray-100 px-2 py-1 rounded text-xs">{`{${x}}`}</code>)}</div></div><div><b>Condições detectadas</b><div className="mt-2 flex flex-wrap gap-1">{(diagnostic.template_manifesto.secoes || []).map(x => <code key={x} className="bg-violet-50 text-violet-700 px-2 py-1 rounded text-xs">{`{#${x}}`}</code>)}</div></div>{!!diagnostic.template_manifesto.camposCustomizados?.length && <div className="rounded-lg bg-blue-50 border border-blue-200 p-3"><b>Campos personalizados:</b> {diagnostic.template_manifesto.camposCustomizados.join(', ')}. O Nexus cria inputs genéricos para eles automaticamente.</div>}{diagnostic.template_manifesto.recursos && <div className="rounded-lg bg-gray-50 border p-3"><b>Recursos do DOCX</b><div className="mt-2 flex flex-wrap gap-2 text-xs">{Object.entries(diagnostic.template_manifesto.recursos).filter(([,v]) => v).map(([k]) => <span key={k} className="bg-white border rounded-full px-2 py-1">{k.replace(/([A-Z])/g, ' $1').toLowerCase()}</span>)}</div></div>}{!!diagnostic.template_avisos?.length && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3"><b>Avisos</b><ul className="list-disc pl-5 mt-1">{diagnostic.template_avisos.map((a,i) => <li key={i}>{a}</li>)}</ul></div>}<div className="text-xs text-gray-400">SHA-256: <code>{diagnostic.hash_sha256}</code></div></div> : <div className="text-gray-500">Este template ainda não possui manifesto de análise.</div>}</Modal>}

    {history && <Modal max="max-w-2xl"><div className="flex justify-between mb-4"><div><h3 className="text-xl font-black">Histórico de templates</h3><p className="text-xs text-gray-500">{history.s.nome_exibicao}</p></div><button onClick={() => setHistory(null)}>✕</button></div><div className="divide-y max-h-[60vh] overflow-auto">{history.rows.length ? history.rows.map(v => <div key={v.id} className="py-3 flex flex-col sm:flex-row sm:justify-between gap-3"><div><b>v{v.versao} — {v.nome_arquivo}</b><div className="text-xs text-gray-500">{fmtBytes(v.bytes)} · {v.usuario_nome || 'migração do sistema'} · {v.status_template || 'não analisado'}</div></div><div className="flex gap-2"><button onClick={() => baixar(`/admin/especies/${history.s.id}/templates/${v.versao}`, v.nome_arquivo)} className="border px-2 py-1 rounded">Baixar</button><button onClick={() => restoreVersion(v)} className="border px-2 py-1 rounded text-sky-700">Restaurar</button></div></div>) : <div className="py-8 text-center text-gray-400">Nenhuma versão cadastrada.</div>}</div></Modal>}
  </div>;
}
