import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles/index.css'
import App from './App.tsx'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { appConfig } from '@/config/app'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
})

function Root() {
  const hydrate = useAuthStore((s) => s.hydrate)
  const theme = useUiStore((s) => s.theme)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Branding comes from src/config/app.ts (env-overridable), never hardcoded in HTML.
  useEffect(() => {
    document.title = `${appConfig.name} — ${appConfig.tagline}`
    const icon = document.querySelector<HTMLLinkElement>("link[rel='icon']")
    if (icon) {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>${appConfig.logoMark}</text></svg>`
      icon.href = `data:image/svg+xml,${encodeURIComponent(svg)}`
    }
  }, [])

  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
