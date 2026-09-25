import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 2500),
      setTimeout(() => setPhase(3), 6000),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, y: '20vh' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div 
        className="w-[10vw] h-[10vw] rounded-full border border-[#c0392b] relative mb-12 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0 }}
        animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0 }}
        transition={{ duration: 1.2, type: 'spring', stiffness: 100 }}
      >
        <motion.div 
          className="absolute inset-0 rounded-full border border-[#d4a017]"
          animate={{ rotate: 360, scale: [1, 1.1, 1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        />
        <div className="w-[4vw] h-[4vw] bg-[#c0392b] rounded-full blur-[10px] opacity-60" />
      </motion.div>

      <motion.h1 
        className="text-[6vw] font-black tracking-[0.1em] text-[#e8e0d0] uppercase"
        initial={{ opacity: 0, filter: 'blur(20px)' }}
        animate={phase >= 1 ? { opacity: 1, filter: 'blur(0px)' } : { opacity: 0, filter: 'blur(20px)' }}
        transition={{ duration: 2, ease: 'easeOut' }}
      >
        Oracolul Cenușii
      </motion.h1>

      <motion.p
        className="mt-6 text-[2vw] tracking-[0.5em] uppercase text-[#c0392b] font-semibold"
        initial={{ opacity: 0, letterSpacing: '0em' }}
        animate={phase >= 2 ? { opacity: 1, letterSpacing: '0.5em' } : { opacity: 0, letterSpacing: '0em' }}
        transition={{ duration: 2, ease: 'easeOut' }}
      >
        Umbrele te cheamă
      </motion.p>
    </motion.div>
  );
}