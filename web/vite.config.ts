import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

/**
 * Fills the static parts of index.html (the title shown before JavaScript runs, the meta
 * description, the favicon) from the same VITE_APP_* values as src/config/app.ts. These are
 * only fallbacks: once the app loads, the backend's GET /meta (MONETARY_APP_NAME) takes over.
 */
function htmlBranding(env: Record<string, string>): Plugin {
  const name = env.VITE_APP_NAME || 'Monetary'
  const tagline = env.VITE_APP_TAGLINE || 'Personal expense ledger'
  const mark = env.VITE_APP_LOGO_MARK
  const favicon = mark
    ? `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${mark}</text></svg>`,
      )}`
    : '/favicon.svg'
  return {
    name: 'html-branding',
    transformIndexHtml: (html) =>
      html.replaceAll('%APP_NAME%', name).replaceAll('%APP_TAGLINE%', tagline).replaceAll('%APP_FAVICON%', favicon),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), htmlBranding(loadEnv(mode, process.cwd(), 'VITE_'))],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
}))
