import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

// SmoothUI's fade-through pattern, adapted to user-triggered view changes.
// No cycling text, timers, or layout animation in a data-dense terminal.
export function ViewTransition({ children, view }: { children: ReactNode; view: string }) {
  const reduced = useReducedMotion();
  return <motion.div key={view} initial={reduced ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}>{children}</motion.div>;
}
