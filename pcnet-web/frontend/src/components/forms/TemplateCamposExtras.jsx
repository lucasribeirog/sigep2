import React from 'react';

function titulo(nome) {
  return String(nome || '')
    .replace(/^is_/, '')
    .replace(/^tem_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function TemplateCamposExtras({ manifesto, form, onChange }) {
  const campos = manifesto?.camposCustomizados || [];
  const condicoes = manifesto?.condicoesCustomizadas || [];
  const imagens = manifesto?.imagensCustomizadas || [];
  if (!campos.length && !condicoes.length && !imagens.length) return null;

  return (
    <section className="rounded-xl border border-violet-200 bg-violet-50/60 p-5 space-y-4">
      <div>
        <h3 className="font-bold text-violet-950">Campos adicionais do template</h3>
        <p className="text-xs text-violet-700 mt-1">Estes campos foram detectados automaticamente no DOCX e não fazem parte do formulário padrão da espécie.</p>
      </div>

      {!!campos.length && <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {campos.map((nome) => <div key={nome}>
          <label className="block text-xs font-semibold text-violet-900 mb-1">{titulo(nome)}</label>
          <input
            type="text"
            name={nome}
            value={form[nome] ?? ''}
            onChange={onChange}
            className="w-full border border-violet-200 rounded-lg p-2.5 bg-white text-sm"
            placeholder={`{${nome}}`}
          />
          <div className="text-[10px] text-violet-500 mt-1 font-mono">{`{${nome}}`}</div>
        </div>)}
      </div>}

      {!!condicoes.length && <div className="space-y-2">
        <div className="text-xs font-bold text-violet-900 uppercase tracking-wide">Condições adicionais</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {condicoes.map((nome) => <label key={nome} className="flex items-center gap-2 bg-white border border-violet-100 rounded-lg p-3 text-sm">
            <input
              type="checkbox"
              name={nome}
              checked={Boolean(form[nome])}
              onChange={onChange}
            />
            <span>{titulo(nome)}</span>
            <code className="ml-auto text-[10px] text-violet-500">{`{#${nome}}`}</code>
          </label>)}
        </div>
      </div>}

      {!!imagens.length && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        O template contém imagem(ns) dinâmica(s) personalizada(s) ainda sem campo de upload: <b>{imagens.join(', ')}</b>. Configure essas imagens no código antes de usar este template em produção.
      </div>}
    </section>
  );
}
