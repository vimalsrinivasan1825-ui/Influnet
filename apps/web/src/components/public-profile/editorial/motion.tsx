'use client';

import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import styles from './editorial.module.css';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
const reduced = prefersReducedMotion;

/**
 * Fade-and-rise when scrolled into view.
 *
 * Server HTML is fully visible. Only after mount, and only for an element that
 * is still below the fold, is it hidden and handed to an IntersectionObserver.
 * So nothing depends on JavaScript to appear, nothing above the fold flashes,
 * and a browser that never runs the observer still shows everything once the
 * element is reached (the fallback timer).
 */
export function Reveal({
  as: Tag = 'div',
  className,
  delay = 0,
  children,
  ...rest
}: {
  as?: ElementType;
  className?: string;
  delay?: number;
  children: ReactNode;
  [key: string]: unknown;
}) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<'idle' | 'pending' | 'in'>('idle');

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || typeof IntersectionObserver === 'undefined') return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    setState('pending');
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setState('in');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const cls = [className, state === 'pending' ? styles.revealPending : '', state === 'in' ? styles.revealIn : '']
    .filter(Boolean)
    .join(' ');
  return (
    <Tag ref={ref} className={cls || undefined} style={delay ? { transitionDelay: `${delay}ms` } : undefined} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * "8.9M" counts up from 0 when it first scrolls into view. The server renders
 * the real value; the animation only ever runs after mount, so a crawler, a
 * screenshot or a reduced-motion visitor always reads the true number.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
    const el = ref.current;
    const m = value.match(/^([^\d]*)([\d,]*\.?\d+)(.*)$/);
    if (!el || !m || reduced() || typeof IntersectionObserver === 'undefined') return;
    const [, pre, num, post] = m;
    const target = parseFloat(num.replace(/,/g, ''));
    const decimals = num.includes('.') ? num.split('.')[1].length : 0;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1400);
        const eased = 1 - Math.pow(1 - t, 3);
        setText(`${pre}${(target * eased).toFixed(decimals)}${post}`);
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      // If frames never run (a throttled tab), land on the real value anyway.
      setTimeout(() => setText(value), 1800);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
