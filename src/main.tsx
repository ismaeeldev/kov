import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import './index.css'

// `reducedMotion="user"` makes every Framer Motion component in the tree respect
// the OS/browser `prefers-reduced-motion` setting automatically (docs/02_ThemeGuideline.md
// §9.1 rule 3 / §10 — a hard accessibility requirement, not optional). This is the
// Framer-Motion-specific complement to globals.css's CSS-level reduced-motion rule —
// that CSS rule only covers native CSS transitions/animations, not Framer's own
// JS-driven initial/animate/whileTap transforms (e.g. PlanReviewCard's staggered
// reveal, ContextualActionCard's tap-scale, OfflineBanner's slide-in) — both are
// required together, neither alone is sufficient.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MotionConfig>
  </StrictMode>,
)
