import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 引入新插件

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 啟用 Tailwind v4 插件
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
  }
})