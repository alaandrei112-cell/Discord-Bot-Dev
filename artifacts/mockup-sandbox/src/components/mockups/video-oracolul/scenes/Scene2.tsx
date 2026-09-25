import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 4500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center z-10 overflow-hidden"
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, x: '-10vw' }}
      transition={{ duration: 1.5, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.div 
        className="absolute inset-0 bg-[#c0392b]/10 mix-blend-multiply"
        animate={phase >= 1 ? { scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] } : {}}
        transition={{ duration: 4, repeat: Infinity }}
      />
      
      <div className="relative text-center max-w-[80vw]">
        <motion.h2 
          className="text-[6vw] font-bold text-[#e8e0d0] leading-none"
          initial={{ opacity: 0, scale: 0.8, rotateX: 20 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1, rotateX: 0 } : { opacity: 0, scale: 0.8, rotateX: 20 }}
          transition={{ duration: 1, ease: 'easeOut' }}
        >
          Ora Umbrelor<br/>
          <motion.span 
            className="text-[#c0392b] block mt-4 text-[7vw]"
            initial={{ opacity: 0, y: 50 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 50 }}
            transition={{ duration: 0.8, type: 'spring', stiffness: 100 }}
          >
            a început
          </motion.span>
        </motion.h2>

        {/* Abstract slashing shapes in background of text */}
        {phase >= 2 && (
          <>
            <motion.div 
              className="absolute top-1/2 left-[-10%] w-[120%] h-[2px] bg-[#c0392b] -rotate-12"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 0.8 }}
              transition={{ duration: 0.4, ease: 'easeIn' }}
            />
            <motion.div 
              className="absolute top-1/3 left-[-10%] w-[120%] h-[1px] bg-[#d4a017] rotate-6"
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 0.5 }}
              transition={{ duration: 0.6, delay: 0.2, ease: 'easeIn' }}
            />
          </>
        )}
      </div>
    </motion.div>
  );
}