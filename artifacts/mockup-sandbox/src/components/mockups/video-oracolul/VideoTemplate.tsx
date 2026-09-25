import { motion, AnimatePresence } from 'framer-motion';
import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './scenes/Scene1';
import { Scene2 } from './scenes/Scene2';
import { Scene3 } from './scenes/Scene3';
import { Scene4 } from './scenes/Scene4';
import { Scene5 } from './scenes/Scene5';

const SCENE_DURATIONS = { 
  open: 6000, 
  call: 6000, 
  progression: 8000, 
  economy: 6000, 
  close: 8000 
};

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#1a0a00] text-[#e8e0d0]" style={{ fontFamily: '"Inter", sans-serif' }}>
      
      {/* Persistent Background Layer */}
      <div className="absolute inset-0 z-0">
        <motion.div 
          className="absolute w-[120vw] h-[120vw] rounded-full opacity-10 blur-3xl"
          style={{ background: 'radial-gradient(circle, #c0392b, transparent 60%)' }}
          animate={{
            x: currentScene === 1 ? '-20vw' : currentScene === 4 ? '10vw' : '0vw',
            y: currentScene === 2 ? '-30vh' : currentScene === 3 ? '10vh' : '-10vh',
            scale: currentScene === 1 ? 1.5 : currentScene === 0 ? 1 : 1.2,
            opacity: currentScene === 1 ? 0.3 : 0.1,
          }}
          transition={{ duration: 4, ease: 'easeInOut' }}
        />
        <motion.div 
          className="absolute w-[80vw] h-[80vw] rounded-full opacity-10 blur-3xl right-[-20vw] bottom-[-20vh]"
          style={{ background: 'radial-gradient(circle, #d4a017, transparent 60%)' }}
          animate={{
            x: currentScene === 3 ? '-20vw' : '10vw',
            scale: currentScene === 3 ? 1.5 : 1,
            opacity: currentScene === 3 ? 0.2 : 0.05,
          }}
          transition={{ duration: 5, ease: 'easeInOut' }}
        />
        
        {/* Embers overlay (simulated with CSS background noise / radial spots) */}
        <motion.div
          className="absolute inset-0 opacity-20 mix-blend-screen"
          style={{
            backgroundImage: 'radial-gradient(#c0392b 1px, transparent 1px)',
            backgroundSize: '40px 40px',
            backgroundPosition: '0 0'
          }}
          animate={{ y: ['0%', '-5%'], opacity: [0.1, 0.3, 0.1] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
        />
      </div>

      {/* Persistent Midground Lines */}
      <motion.div
        className="absolute h-[1px] bg-[#d4a017]/40 z-0"
        animate={{
          left: ['10%', '0%', '20%', '10%', '30%'][currentScene],
          width: ['80%', '100%', '60%', '80%', '40%'][currentScene],
          top: ['50%', '20%', '80%', '40%', '60%'][currentScene],
          opacity: [0.2, 0.4, 0.3, 0.5, 0.1][currentScene],
        }}
        transition={{ duration: 2, ease: [0.22, 1, 0.36, 1] }}
      />

      <AnimatePresence mode="popLayout">
        {currentScene === 0 && <Scene1 key="open" />}
        {currentScene === 1 && <Scene2 key="call" />}
        {currentScene === 2 && <Scene3 key="progression" />}
        {currentScene === 3 && <Scene4 key="economy" />}
        {currentScene === 4 && <Scene5 key="close" />}
      </AnimatePresence>
    </div>
  );
}