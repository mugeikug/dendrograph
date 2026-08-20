import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { getHttpsServerOptions } from 'office-addin-dev-certs'

// https://vite.dev/config/
export default defineConfig(async () => {
  const httpsOptions = await getHttpsServerOptions()

  return {
    plugins: [react()],
    server: {
      port: 3000,
      https: httpsOptions,
    },
  }
})
