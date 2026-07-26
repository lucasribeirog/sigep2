import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // Porta padrão do Vite para o front-end
    open: true  // Abre o navegador automaticamente ao rodar npm run dev
  }
});