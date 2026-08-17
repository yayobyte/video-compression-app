import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { tokenCssVars } from '../shared/tokens'
import './index.css'
import App from './App.tsx'

// Inject the shared design tokens as CSS custom properties (:root) so the web
// app uses the same palette/spacing/radius as the mobile theme (shared/tokens.ts).
const style = document.createElement('style')
style.textContent = tokenCssVars()
document.head.appendChild(style)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
