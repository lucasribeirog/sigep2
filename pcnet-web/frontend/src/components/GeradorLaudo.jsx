import React, { useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/api';
import FormBalistica from './forms/FormBalistica';
import FormPatrimonio from './forms/FormPatrimonio';
import FormDrogas from './forms/FormDrogas';
import TemplateCamposExtras from './forms/TemplateCamposExtras';
import PcnetLaudoMovimentacao from './PcnetLaudoMovimentacao';

function nomeSeguro(v) {
  return String(v || 'Laudo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100) || 'Laudo';
}
function nomeSaida(arquivoBase, formato, especie) {
  if (arquivoBase?.name) return `${nomeSeguro(arquivoBase.name.replace(/\.docx$/i, ''))}.${formato}`;
  return `Laudo_${nomeSeguro(especie?.nome_exibicao)}.${formato}`;
}

const FORM_INICIAL = {
  tipo_material: 'revolver', pertence_pm: false,
  instituicao_carga: 'Polícia Militar do Estado de Minas Gerais', resultado_exame: 'eficiente', destino: 'custodia',
  calibre: '', marca: '', modelo: '', numero_serie: '', acabamento: 'oxidado', comprimento_cano: '', comprimento_total: '', capacidade: '',
  n_lacre: '', municoes: [{ quantidade: '', calibre: '', marca: '' }], defeito_constatado: 'mecanismo de disparo emperrado',
  tipo_acao_carabina: 'repetição (não automática)', detalhes_coronha: 'coronha e telha em madeira', sistema_alimentacao: 'sistema próprio',
  empunhadura_revolver: '', carregador_info: 'acompanhada de um carregador compatível', detalhes_armacao: '', detalhes_fuzil: 'coronha rebatível e empunhadura em polímero',
  qtd_municao: '02 (dois)', nome_arma_livre: '', descricao_livre: '',
  tipo_objeto: 'faca', resultado_eficiencia: 'eficiente', n_fav: '', pcnet_fav: '', unidade_custodia: '', material_cabo: '', cor_cabo: '', comp_lamina: '', largura_base: '', comp_total: '',
  tipo_abertura: '', secao_madeira: '', comp_madeira: '', larg_madeira: '', massa: '', nome_objeto: '', material_predominante: '', cor_objeto: '', compr_objeto: '', larg_objeto: '', espessura_objeto: '', massa_objeto: '',
  droga: 'cocaina', cor_material: 'branca', qtd_involucros: '', massa_liquida: '', extenso_massa: '', envelope_recebimento: '', numero_fav: '', resultado: 'positivo', tipo_encaminhamento: 'unificado', envelope_encaminhamento: '', massa_amostra: '', fav_amostra: '', envelope_amostra: '',
  numero_laudo_pcnet: '', numero_laudo_completo: '', pcnet_movimentacoes: {}, pcnet_amostra_criada: null,
};

export default function GeradorLaudo({ catalogo = [], especieInicialId = null, dadosIniciaisIA = null, fotoObjetoInicial = null, usuario = null }) {
  const [especieId, setEspecieId] = useState(especieInicialId || '');
  const [arquivoPcnet, setArquivoPcnet] = useState(null);
  const [fotoObjeto, setFotoObjeto] = useState(fotoObjetoInicial || null);
  const [loading, setLoading] = useState(false);
  const [iaLoading, setIaLoading] = useState(false);
  const [aviso, setAviso] = useState('');
  const [unidades, setUnidades] = useState([]);
  const formRef = useRef(null);

  const [form, setForm] = useState(() => ({
    ...FORM_INICIAL,
    unidade_custodia: usuario?.unidade || '',
    ...(dadosIniciaisIA || {}),
    municoes: dadosIniciaisIA ? [{ quantidade: dadosIniciaisIA.qtd_municao || '', calibre: dadosIniciaisIA.calibre || '', marca: dadosIniciaisIA.marca || '' }] : FORM_INICIAL.municoes,
  }));

  useEffect(() => { if (especieInicialId) setEspecieId(especieInicialId); }, [especieInicialId]);
  useEffect(() => { api.get('/unidades').then(r => setUnidades(r.data || [])).catch(() => setUnidades([])); }, []);
  const especie = useMemo(() => catalogo.find(x => Number(x.id) === Number(especieId)) || null, [catalogo, especieId]);
  const manifesto = especie?.template_manifesto || null;
  const suportaIA = ['balistica', 'drogas'].includes(especie?.formulario);
  const usaImagemNoTemplate = Boolean(manifesto?.imagens?.includes('imagem_vestigio'));

  const change = e => {
    const { name, value, type, checked } = e.target;
    const finalValue = type === 'checkbox' ? checked : (type === 'array' ? value : value);
    setForm(v => ({ ...v, [name]: finalValue }));
  };

  async function escolherPcnet(file) {
    setAviso('');
    if (!file) return setArquivoPcnet(null);
    if (!/\.docx$/i.test(file.name || '')) { setArquivoPcnet(null); return alert('Selecione o arquivo .docx exportado pelo PCNet.'); }
    setArquivoPcnet(file);

    // Inspeciona apenas os metadados úteis do DOCX-base. A geração do laudo continua
    // usando o arquivo original sem qualquer alteração.
    try {
      const fd = new FormData();
      fd.append('arquivo_pcnet', file);
      const r = await api.post('/inspecionar-docx', fd);
      const fav = String(r.data?.fav || '').trim();
      const numeroLaudoPcnet = String(r.data?.numeroLaudoPcnet || r.data?.numeroLaudo || '').trim();
      const numeroLaudoCompleto = String(r.data?.numeroLaudoCompleto || '').trim();
      setForm(v => ({
        ...v,
        numero_laudo_pcnet: numeroLaudoPcnet || v.numero_laudo_pcnet || '',
        numero_laudo_completo: numeroLaudoCompleto || v.numero_laudo_completo || '',
        numero_fav: fav || v.numero_fav || '',
        n_fav: fav || v.n_fav || '',
        pcnet_fav: fav || v.pcnet_fav || '',
      }));
      if (fav || numeroLaudoPcnet || numeroLaudoCompleto) {
        const itens = [];
        if (fav) itens.push(`FAV ${fav}`);
        if (numeroLaudoPcnet) itens.push(`Laudo PCNet ${numeroLaudoPcnet}`);
        if (numeroLaudoCompleto && numeroLaudoCompleto !== numeroLaudoPcnet) itens.push(`identificador completo ${numeroLaudoCompleto}`);
        setAviso(`DOCX-base identificado: ${itens.join(' · ')}.`);
      }
    } catch (e) {
      // Não impede a elaboração: número do laudo/FAV continuam editáveis no formulário.
      console.warn('Nexus: não foi possível extrair metadados do DOCX-base:', e?.response?.data?.erro || e?.message || e);
    }
  }

  async function analisarFoto() {
    if (!fotoObjeto || !especie || !suportaIA) return;
    const fd = new FormData();
    fd.append('foto_objeto', fotoObjeto);
    fd.append('especieId', String(especie.id));
    try {
      setIaLoading(true);
      const r = await api.post('/analisar-foto', fd);
      setForm(v => ({ ...v, ...(r.data?.dadosForm || {}) }));
      setAviso('A IA preencheu os campos que conseguiu identificar. Revise todos os dados antes de gerar o laudo.');
    } catch (e) { alert(e.response?.data?.erro || 'Falha ao analisar imagem.'); }
    finally { setIaLoading(false); }
  }

  async function gerar(formato) {
    setAviso('');
    if (!arquivoPcnet) return alert('Selecione primeiro o documento-base .docx exportado pelo PCNet.');
    if (!especie) return alert('Selecione a espécie pericial.');
    if (!especie.tem_template) return alert('Esta espécie ainda não possui template ativo.');
    if (especie.status_template === 'invalido') return alert('O template ativo foi marcado como inválido. Procure o administrador.');
    if (formRef.current && !formRef.current.reportValidity()) return;

    const fd = new FormData();
    fd.append('arquivo_pcnet', arquivoPcnet);
    fd.append('especieId', String(especie.id));
    fd.append('dadosForm', JSON.stringify(form));
    if (fotoObjeto) fd.append('foto_objeto', fotoObjeto);

    try {
      setLoading(true);
      const r = await api.post(
        formato === 'pdf'
          ? '/gerar-laudo-pdf'
          : '/gerar-laudo',
        fd,
        {
          responseType: 'blob',
          ...(formato === 'pdf'
            ? { timeout: 90000 }
            : {}),
        }
      );
      const ext = formato === 'pdf' ? 'pdf' : 'docx';
      const url = URL.createObjectURL(r.data);
      const a = document.createElement('a'); a.href = url; a.download = nomeSaida(arquivoPcnet, ext, especie);
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);

      const fav = r.headers?.['x-fav-detectada'];
      const achouHistorico = r.headers?.['x-nexus-historico-detectado'];
      if (achouHistorico === '0') setAviso('O arquivo foi gerado, mas o Nexus não encontrou “HISTÓRICO” no DOCX-base. O template foi anexado ao final. Confira o documento.');
      else if (fav) setAviso(`Documento gerado com a estrutura do PCNet preservada. FAV detectada: ${fav}.`);
      else setAviso('Documento gerado com o conteúdo anterior a “HISTÓRICO” preservado e o template ativo inserido no ponto correto.');
    } catch (err) {
      let msg = 'Erro ao processar o laudo.';
      const d = err.response?.data;
      if (d instanceof Blob) { try { msg = JSON.parse(await d.text()).erro || msg; } catch { /* noop */ } }
      else msg = d?.erro || msg;
      alert(msg);
    } finally { setLoading(false); }
  }

  return <div className="max-w-5xl mx-auto p-8 bg-white shadow-lg rounded-xl border border-gray-100">
    <div className="mb-8 border-b pb-4">
      <h2 className="text-2xl font-bold text-gray-800">Elaboração e Emissão de Laudos</h2>
      <p className="text-sm text-gray-500 mt-1">O DOCX-base do PCNet fornece a capa/identificação. A partir de “HISTÓRICO”, o Nexus usa o template ativo da espécie.</p>
    </div>

    <form ref={formRef} onSubmit={e => e.preventDefault()} className="space-y-6">
      <section className="rounded-xl border border-sky-200 bg-sky-50 p-5">
        <div className="flex items-start gap-3"><div className="text-2xl">📎</div><div className="flex-1">
          <label className="block text-sm font-bold text-sky-950 mb-1">Documento-base do PCNet (.docx) *</label>
          <p className="text-xs text-sky-800 mb-3">Selecione o Word exportado pelo PCNet. O Nexus mantém tudo o que vem antes de “HISTÓRICO”.</p>
          <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e => escolherPcnet(e.target.files?.[0] || null)} required className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-sky-700 file:px-4 file:py-2 file:font-semibold file:text-white hover:file:bg-sky-800" />
          {arquivoPcnet && <div className="mt-3 text-xs font-semibold text-emerald-700">✓ {arquivoPcnet.name}</div>}
        </div></div>
      </section>

      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-2">Espécie Pericial *</label>
        <select value={especieId} onChange={e => setEspecieId(e.target.value)} required className="w-full p-3 border border-gray-300 rounded-lg bg-white text-sm">
          <option value="">-- Selecione a Espécie --</option>
          {catalogo.map(x => <option key={x.id} value={x.id} disabled={!x.tem_template || x.status_template === 'invalido'}>{x.nome_exibicao}{!x.tem_template ? ' — sem template' : x.status_template === 'invalido' ? ' — template inválido' : ''}</option>)}
        </select>
        {especie && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <span>{especie.natureza}</span><span>·</span><span>{especie.tem_template ? `Template v${especie.template_versao}` : 'Sem template'}</span>
          {especie.status_template === 'atencao' && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">template com avisos</span>}
        </div>}
      </div>

      {especie && (suportaIA || usaImagemNoTemplate) && <section className="rounded-xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1"><div className="font-semibold text-sm">Foto do vestígio <span className="font-normal text-gray-400">(opcional)</span></div>
            <div className="text-xs text-gray-500">{usaImagemNoTemplate ? 'A foto será inserida no template quando houver a tag de imagem.' : 'Pode ser usada para auxiliar o preenchimento por IA; este template não possui tag de imagem.'}</div></div>
          <input type="file" accept="image/*" onChange={e => setFotoObjeto(e.target.files?.[0] || null)} className="text-xs" />
          {suportaIA && <button type="button" disabled={!fotoObjeto || iaLoading} onClick={analisarFoto} className="border border-sky-600 text-sky-700 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40">{iaLoading ? 'Analisando...' : '✨ Analisar com IA'}</button>}
        </div>
      </section>}

      {especie?.formulario === 'balistica' && <FormBalistica form={form} onChange={change} />}
      {especie?.formulario === 'eficiencia_objeto' && <FormPatrimonio form={form} onChange={change} unidades={unidades} unidadePadrao={usuario?.unidade || ''} />}
      {especie?.formulario === 'drogas' && <FormDrogas dados={form} onChange={change} />}

      {especie && ['balistica', 'eficiencia_objeto', 'drogas'].includes(especie.formulario) && <PcnetLaudoMovimentacao formulario={especie.formulario} form={form} onChange={change} unidadeUsuario={usuario?.unidade || ''} />}

      <TemplateCamposExtras manifesto={manifesto} form={form} onChange={change} />

      {!!especie?.template_avisos?.length && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <b>Diagnóstico do template:</b> {especie.template_avisos.join(' · ')}
      </div>}
      {aviso && <div className={`rounded-lg border p-3 text-sm ${aviso.includes('não encontrou') ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{aviso}</div>}

      {especie?.tem_template && especie.status_template !== 'invalido' && <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t">
        <button type="button" onClick={() => gerar('docx')} disabled={loading || !arquivoPcnet} className="bg-gray-100 p-3.5 rounded-lg font-semibold disabled:opacity-50">📄 {loading ? 'Processando...' : 'Baixar Word (.docx)'}</button>
        <button type="button" onClick={() => gerar('pdf')} disabled={loading || !arquivoPcnet} className="bg-[#0284C7] text-white p-3.5 rounded-lg font-semibold disabled:opacity-50">📑 {loading ? 'Processando...' : 'Baixar PDF (.pdf)'}</button>
      </div>}
    </form>
  </div>;
}
