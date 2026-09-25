import { useEffect, useRef, useState } from "react";

export function useMinimumLoading(active: boolean, minimumMs = 2_000): boolean {
  const [visible, setVisible] = useState(true);
  const startedAt = useRef<number | null>(Date.now());
  const wasActive = useRef(active);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }

    if (active) {
      if (!wasActive.current || startedAt.current === null) startedAt.current = Date.now();
      wasActive.current = true;
      setVisible(true);
      return () => {
        if (timer.current !== null) {
          window.clearTimeout(timer.current);
          timer.current = null;
        }
      };
    }

    wasActive.current = false;
    const remaining = startedAt.current === null
      ? 0
      : Math.max(0, minimumMs - (Date.now() - startedAt.current));
    timer.current = window.setTimeout(() => {
      timer.current = null;
      startedAt.current = null;
      setVisible(false);
    }, remaining);

    return () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    };
  }, [active, minimumMs]);

  return visible || active;
}