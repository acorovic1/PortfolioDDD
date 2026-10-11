import { useEffect, useState, type RefObject } from 'react';

// Fullscreen state for one element, kept in step with the browser (Esc, F11).
export function useFullscreen(elementRef: RefObject<HTMLElement | null>) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(document.fullscreenElement === elementRef.current);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, [elementRef]);

  const toggleFullscreen = () => {
    const element = elementRef.current;
    if (!element) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      element.requestFullscreen().catch(err => console.error('Fullscreen request failed:', err));
    }
  };

  return { isFullscreen, toggleFullscreen };
}
