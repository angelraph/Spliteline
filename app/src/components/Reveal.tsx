import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PropsWithChildren } from "react";

type Direction = "up" | "left" | "right";

/// Fades/slides a section in once it scrolls into view, with an optional stagger delay
/// and direction — pure CSS transition driven by a single IntersectionObserver per
/// instance, no animation library. Wrap each grid item individually (not the whole grid)
/// to get Stripe/Uniswap's staggered, one-after-another reveal instead of everything
/// appearing at once.
export function Reveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
}: PropsWithChildren<{ className?: string; delay?: number; direction?: Direction }>) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties = { transitionDelay: `${delay}ms` };

  return (
    <div ref={ref} className={`reveal reveal-${direction} ${inView ? "in-view" : ""} ${className}`} style={style}>
      {children}
    </div>
  );
}
