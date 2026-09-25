import { useState, useEffect } from 'react';

export function useVideoPlayer({ durations }: { durations: Record<string, number> }) {
  const [currentScene, setCurrentScene] = useState(0);

  useEffect(() => {
    const durationArray = Object.values(durations);
    let timeout: any;

    if (typeof window !== 'undefined' && (window as any).startRecording) {
      (window as any).startRecording();
    }

    let hasRecordedOnce = false;

    const advance = (index: number) => {
      if (index >= durationArray.length) {
        if (!hasRecordedOnce && typeof window !== 'undefined' && (window as any).stopRecording) {
          (window as any).stopRecording();
          hasRecordedOnce = true;
        }
        setCurrentScene(0); // loop
        advance(0);
        return;
      }
      setCurrentScene(index);
      timeout = setTimeout(() => {
        advance(index + 1);
      }, durationArray[index]);
    };

    advance(0);

    return () => clearTimeout(timeout);
  }, []);

  return { currentScene };
}