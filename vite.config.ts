import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { getHttpsServerOptions } from 'office-addin-dev-certs'

// https://vite.dev/config/
export default defineConfig(async ({ command }) => {
  const httpsOptions = await getHttpsServerOptions()

  return {
    // GitHub Pages project sites are served from a /<repo>/ subpath, but the local dev
    // server (and Office Add-in sideloading against it) needs to stay at the root.
    base: command === 'build' ? '/dendrograph/' : '/',
    plugins: [react()],
    server: {
      port: 3000,
      https: httpsOptions,
    },
  }
})
