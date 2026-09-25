import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 2000),
      setTimeout(() => setPhase(3), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, filter: 'blur(20px)', scale: 1.2 }}
      transition={{ duration: 1.5, ease: 'easeOut' }}
    >
      <div className="relative">
        <motion.div
          className="absolute -inset-10 bg-[#c0392b] blur-[80px] rounded-full"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 0.15 } : { opacity: 0 }}
          transition={{ duration: 2 }}
        />
        <motion.h1 
          className="text-[8vw] font-black tracking-[0.2em] text-[#e8e0d0] uppercase text-center drop-shadow-2xl"
          style={{ textShadow: '0 10px 30px rgba(0,0,0,0.8)' }}
        >
          {'Regatul'.split('').map((char, i) => (
            <motion.span 
              key={`r-${i}`} 
              className="inline-block"
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              animate={phase >= 1 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 40, filter: 'blur(10px)' }}
              transition={{ duration: 1, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              {char}
            </motion.span>
          ))}
          <br />
          {'Cenușii'.split('').map((char, i) => (
            <motion.span 
              key={`c-${i}`} 
              className="inline-block text-[#d4a017]"
              initial={{ opacity: 0, y: 40, filter: 'blur(10px)' }}
              animate={phase >= 1 ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 40, filter: 'blur(10px)' }}
              transition={{ duration: 1, delay: 0.5 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              {char}
            </motion.span>
          ))}
        </motion.h1>
      </div>

      <motion.p
        className="mt-8 text-[1.5vw] tracking-[0.4em] uppercase text-[#e8e0d0]/60"
        initial={{ opacity: 0, y: 20 }}
        animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
        transition={{ duration: 1.5, ease: 'easeOut' }}
      >
        A dark fantasy RPG
      </motion.p>
    </motion.div>
  );
}