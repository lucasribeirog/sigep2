export default function AlertMessage({ mensagem, tipo }) {
  if (!mensagem) return null;
  return (
    <div className={`mt-4 text-center text-sm font-medium ${tipo === 'erro' ? 'text-red-600' : 'text-emerald-600'}`}>
      {mensagem}
    </div>
  );
}