import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'

const REMOTE_API_TARGET = 'https://ark-autochess.microblock.cc:7998'
const LOCAL_API_TARGET = 'http://localhost:7999'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const apiTarget = mode === 'local-server' ? LOCAL_API_TARGET : REMOTE_API_TARGET

  return {
    plugins: [preact()],
    server: {
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ''),
        },
      },
    },
  }
})
