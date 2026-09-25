import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 2800),
      setTimeout(() => setPhase(5), 6500),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const keywords = ["Luptă.", "Supraviețuiește.", "Evoluează."];

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ x: '100vw', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ y: '20vh', opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex gap-[4vw] mb-16 text-[3vw] font-bold uppercase tracking-widest text-[#d4a017]">
        {keywords.map((word, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= i + 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8, type: 'spring', stiffness: 200, damping: 20 }}
          >
            {word}
          </motion.span>
        ))}
      </div>

      <div className="flex gap-[2vw]">
        {[
          { name: "Lupul de Cenușă", color: "#e8e0d0" },
          { name: "Corbul Umbrelor", color: "#1a0a00" },
          { name: "Spiritul Stins", color: "#c0392b" },
          { name: "Golem de Fum", color: "#d4a017" }
        ].map((companion, i) => (
          <motion.div
            key={i}
            className="w-[15vw] h-[20vw] border border-[#d4a017]/30 rounded-lg relative overflow-hidden flex items-end p-[1vw] bg-gradient-to-t from-black/80 to-transparent"
            initial={{ opacity: 0, scale: 0.8, rotateY: 90 }}
            animate={phase >= 4 ? { opacity: 1, scale: 1, rotateY: 0 } : { opacity: 0, scale: 0.8, rotateY: 90 }}
            transition={{ duration: 1, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
            style={{ backgroundColor: companion.color, mixBlendMode: i === 1 ? 'normal' : 'screen' }}
          >
            <div className="absolute inset-0 opacity-20 bg-black mix-blend-multiply" />
            <motion.p 
              className="text-[#e8e0d0] text-[1.2vw] font-semibold relative z-10"
              initial={{ opacity: 0, y: 10 }}
              animate={phase >= 4 ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ delay: 0.5 + i * 0.15 }}
            >
              {companion.name}
            </motion.p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}