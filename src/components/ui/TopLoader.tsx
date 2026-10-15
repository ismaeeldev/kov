import * as React from 'react'
import { useLocation } from 'react-router-dom'

/**
 * TopLoader — ultra-sleek, glowing steel-blue progress bar at the top of the screen.
 * Triggers on route / tab navigation, giving an instant, luxurious loading feedback.
 */
export function TopLoader() {
  const location = useLocation()
  const [progress, setProgress] = React.useState<number>(0)
  const [visible, setVisible] = React.useState<boolean>(false)

  React.useEffect(() => {
    let active = true
    let progressTimer: ReturnType<typeof setInterval> | null = null
    let finishTimer: ReturnType<typeof setTimeout> | null = null
    let hideTimer: ReturnType<typeof setTimeout> | null = null

    // Start asynchronously in next animation frame to satisfy React Hooks guidelines
    const startTimer = setTimeout(() => {
      if (!active) return
      setVisible(true)
      setProgress(20)

      progressTimer = setInterval(() => {
        if (!active) return
        setProgress((prev) => {
          if (prev >= 80) {
            if (progressTimer) clearInterval(progressTimer)
            return 80
          }
          return prev + Math.random() * 20 + 10
        })
      }, 70)

      finishTimer = setTimeout(() => {
        if (!active) return
        if (progressTimer) clearInterval(progressTimer)
        setProgress(100)

        hideTimer = setTimeout(() => {
          if (!active) return
          setVisible(false)
          setProgress(0)
        }, 220)
      }, 260)
    }, 0)

    return () => {
      active = false
      clearTimeout(startTimer)
      if (progressTimer) clearInterval(progressTimer)
      if (finishTimer) clearTimeout(finishTimer)
      if (hideTimer) clearTimeout(hideTimer)
    }
  }, [location.pathname, location.search])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed top-0 inset-x-0 z-[9999] h-[2.5px] overflow-hidden bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-brand-500 via-brand-300 to-brand-400 shadow-[0_0_12px_rgba(59,130,246,0.9),0_0_4px_rgba(96,165,250,0.8)] transition-all duration-150 ease-out"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
          transitionProperty: 'width, opacity',
        }}
      />
    </div>
  )
}
