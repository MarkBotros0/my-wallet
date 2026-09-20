"use client";

import { useEffect, useState } from "react";

/**
 * A figure that counts up from 0 to `value` over `ms` on the expo-out curve
 * — the hero number arriving rather than appearing. Under
 * prefers-reduced-motion it is `value` from the first frame. The animation
 * runs once, on mount; the caller keys the component if a fresh count is
 * wanted for a new value.
 */
export function useCountUp(value: number, ms = 600): number {
  const [progress, setProgress] = useState(() => (prefersReducedMotion() ? 1 : 0));

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const t0 = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const p = Math.min(1, (now - t0) / ms);
      setProgress(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [ms]);

  return value * easeOutExpo(progress);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** The same curve as --ease-out-expo in globals.css. */
function easeOutExpo(t: number): number {
  return t >= 1 ? 1 : 1 - Math.pow(2, -10 * t);
}
