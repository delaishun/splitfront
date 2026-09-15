import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import mkcert from 'vite-plugin-mkcert'

export default defineConfig({
  // 💡 修改 1：由于你使用独立域名 spappf.solpethouse.top 根目录部署，必须改为 '/'
  base: '/', 
  plugins: [
    vue(),
    vueDevTools(),
    process.env.HTTPS ? mkcert() : undefined,
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  publicDir: './public',
  server: {
    host: true,
  },
  // 💡 修改 2：增加打包兼容性目标，规避手机 WebView 闪退或白屏风险
  build: {
    target: 'es2020',
  }
})