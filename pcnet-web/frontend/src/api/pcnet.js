import axios from 'axios';

const api = axios.create({
    //baseURL: 'http://${window.location.hostname}:3000/api'
    //baseURL: 'http://192.168.3.187:3000/api'
    baseURL: 'http://localhost:3000/api'
    // Removido o headers['Content-Type'] fixo para permitir multipart/form-data nos arquivos
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => {
    return Promise.reject(error);
});

export default api;