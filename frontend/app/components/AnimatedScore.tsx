"use client";

import { useEffect, useRef, useState, CSSProperties } from "react";

interface AnimatedScoreProps {
  value: number;
  className?: string;
  style?: CSSProperties;
}

const DURATION_MS = 800;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export default function AnimatedScore({ value, className = "", style }: AnimatedScoreProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const displayValueRef = useRef(displayValue);
  const frameRef = useRef<number | null>(null);

  // Refs must not be written during render (react-hooks/refs) — mirror the
  // latest committed displayValue here so the animation effect below can
  // read a fresh "from" value without depending on (and re-running for)
  // every displayValue tick it itself produces.
  useEffect(() => {
    displayValueRef.current = displayValue;
  }, [displayValue]);

  useEffect(() => {
    const from = displayValueRef.current;
    const to = value;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (from === to) {
      return;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / DURATION_MS, 1);
      const current = Math.round(from + (to - from) * easeOutCubic(progress));
      setDisplayValue(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [value]);

  return (
    <span className={className} style={style}>
      {displayValue}
    </span>
  );
}
