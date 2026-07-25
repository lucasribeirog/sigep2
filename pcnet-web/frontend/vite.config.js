import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'; // <-- ESTA LINHA É A QUE FALTOU

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // <-- Usando a função importada aqui
  ],
});