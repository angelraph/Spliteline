import { useEffect, useRef, type ElementType, type ReactNode } from 'react'
import { clsx } from 'clsx'

let observer: IntersectionObserver | undefined

function getObserver() {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible')
          observer?.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  )
  return observer
}

/** Subtle fade-and-rise on scroll. Content stays visible without IntersectionObserver or with reduced motion. */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = 'div',
}: {
  children: ReactNode
  className?: string
  delay?: number
  as?: ElementType
}) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-visible')
      return
    }
    const io = getObserver()
    io.observe(el)
    // Safety net: never leave content hidden if the observer misses it.
    const timer = window.setTimeout(() => el.classList.add('is-visible'), 6000)
    return () => {
      window.clearTimeout(timer)
      io.unobserve(el)
    }
  }, [])

  return (
    <Tag ref={ref} className={clsx('reveal', className)} style={delay ? { ['--reveal-delay' as string]: `${delay}ms` } : undefined}>
      {children}
    </Tag>
  )
}
