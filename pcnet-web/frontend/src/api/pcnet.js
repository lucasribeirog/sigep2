const API_URL = 'http://localhost:3000/api';

export const pcnetApi = {
  login: async (usuario, senha) => {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });
    return { ok: res.ok, data: await res.json() };
  },

  validarToken: async (token) => {
    const res = await fetch(`${API_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    return { ok: res.ok, data: await res.json() };
  },

  selecionarUnidade: async (unidadeDesejada) => {
    const res = await fetch(`${API_URL}/selecionar-unidade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unidadeDesejada })
    });
    return { ok: res.ok, data: await res.json() };
  },

  extrairCsv: async () => {
    const res = await fetch(`${API_URL}/extrair-csv`);
    if (!res.ok) throw new Error('Erro na extração');
    return await res.blob();
  }
};