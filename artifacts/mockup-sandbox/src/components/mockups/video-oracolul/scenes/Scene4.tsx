import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, rotate: -5, scale: 0.8 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="text-center relative">
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] bg-[#d4a017] rounded-full blur-[100px] opacity-10"
          animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        <div className="flex flex-col gap-6 relative z-10">
          <motion.h3
            className="text-[7vw] font-bold text-[#d4a017] tracking-wider uppercase drop-shadow-[0_0_15px_rgba(212,160,23,0.5)]"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, type: 'spring' }}
          >
            Oboli
          </motion.h3>
          <motion.h3
            className="text-[6vw] font-bold text-[#e8e0d0] tracking-widest uppercase"
            initial={{ opacity: 0, y: 30 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
            transition={{ duration: 0.8, type: 'spring' }}
          >
            Experiență
          </motion.h3>
        </div>

        <motion.div
          className="absolute -left-[10vw] top-1/2 w-[60vw] h-[2px] bg-gradient-to-r from-transparent via-[#d4a017] to-transparent"
          initial={{ opacity: 0, scaleX: 0 }}
          animate={phase >= 1 ? { opacity: 0.5, scaleX: 1 } : { opacity: 0, scaleX: 0 }}
          transition={{ duration: 1.5 }}
        />
      </div>
    </motion.div>
  );
}