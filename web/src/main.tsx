import { StrictMode, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './styles/index.css'
import App from './App.tsx'
import { ToastProvider } from '@/components/ui/Toast'
import { useAuthStore } from '@/store/authStore'
import { useUiStore } from '@/store/uiStore'
import { queryClient } from '@/lib/queryClient'
import { applyTheme } from '@/lib/utils/themeTransition'

function Root() {
  const hydrate = useAuthStore((s) => s.hydrate)
  const theme = useUiStore((s) => s.theme)

  useEffect(() => {
    hydrate()
  }, [hydrate])

  // the first paint takes the saved theme as it is; only a later switch is animated
  const firstTheme = useRef(true)
  useEffect(() => {
    applyTheme(theme, !firstTheme.current)
    firstTheme.current = false
  }, [theme])

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
