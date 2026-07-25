export default function PanelStep({ unidadeAtiva, onDownloadCsv, onLogout }) {
  return (
    <div className="space-y-6 text-center">
      <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
        <h2 className="text-lg font-bold text-emerald-800">Sistema Conectado!</h2>
        <p className="text-sm text-emerald-600 font-medium mt-1">Unidade Ativa: {unidadeAtiva}</p>
      </div>
      <div className="space-y-3">
        <button onClick={onDownloadCsv} className="w-full bg-slate-800 text-white p-3 rounded-lg font-semibold hover:bg-slate-900 transition flex items-center justify-center gap-2">
          📥 Baixar Requisições (CSV)
        </button>
        <button onClick={onLogout} className="w-full text-sm text-slate-500 hover:text-red-600 transition">
          Encerrar Sessão / Trocar de Conta
        </button>
      </div>
    </div>
  );
}