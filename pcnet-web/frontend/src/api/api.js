import axios from 'axios';

const api = axios.create({
    // Em produção, prefira servir front e API no mesmo domínio e mantenha /api.
    // Para outro host, configure VITE_API_URL no ambiente do frontend.
    baseURL: import.meta.env.VITE_API_URL || '/api',
    withCredentials: true,
    timeout: 30000
});

export default api;
