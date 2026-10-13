import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTheme } from '@/frontend/hooks/useTheme';
import { createLoginCarousel, type LoginCarousel } from '@/frontend/three/loginCarousel';
import { handOffBackdrop, takeBackdrop, type BackdropOwner } from '@/frontend/three/backdropHandoff';

type LoginBackdropProps = {
    className?: string;
    // Which page this is on; the running scene is handed between the landing
    // page and the login page instead of being rebuilt (backdropHandoff.ts).
    owner?: BackdropOwner;
    // Called on mount with the page the running scene came from (null when
    // it was started fresh), before the first paint.
    onAdopt?: (from: BackdropOwner | null) => void;
};

// Interactive 3D carousel behind the sign-in card (and in the home page's hero).
// Purely decorative: without WebGL the page keeps its plain gradient background.
export default function LoginBackdrop({ className = 'auth-backdrop', owner = 'login', onAdopt }: LoginBackdropProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const carouselRef = useRef<LoginCarousel | null>(null);
    const { theme } = useTheme();

    // A layout effect, so the scene is handed over within the same update as
    // the page change: the old page's cleanup leaves it before the new page
    // takes it, all before anything is painted.
    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!host) return;

        // Pick up the scene the previous page left running, or start one.
        const handedOver = takeBackdrop();
        let scene = handedOver;
        if (!scene) {
            const canvas = document.createElement('canvas');
            try {
                const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
                scene = { canvas, carousel: createLoginCarousel(canvas, { reducedMotion }), from: owner };
            } catch {
                return;
            }
        }
        const { canvas, carousel } = scene;
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        host.appendChild(canvas);
        carouselRef.current = carousel;
        carousel.setTheme(theme);

        const resize = () => carousel.resize(canvas.clientWidth, canvas.clientHeight);
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();

        const onPointerDown = (e: PointerEvent) => {
            canvas.setPointerCapture(e.pointerId);
            carousel.dragStart(e.clientX);
        };
        // On window, so the parallax also follows the pointer over the card.
        const onPointerMove = (e: PointerEvent) => {
            carousel.dragMove(e.clientX);
            const rect = canvas.getBoundingClientRect();
            carousel.setPointer((e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height);
        };
        const onPointerUp = () => carousel.dragEnd();
        const onVisibilityChange = () => carousel.setRunning(!document.hidden);

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointercancel', onPointerUp);
        window.addEventListener('pointermove', onPointerMove);
        document.addEventListener('visibilitychange', onVisibilityChange);
        onVisibilityChange();
        onAdopt?.(handedOver?.from ?? null);

        return () => {
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('pointercancel', onPointerUp);
            window.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            observer.disconnect();
            carousel.dragEnd();
            carouselRef.current = null;
            // Left running for the next page; disposed if nobody takes it.
            handOffBackdrop({ canvas, carousel }, owner);
        };
        // The theme is applied separately below; the scene is set up once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [owner]);

    useEffect(() => {
        carouselRef.current?.setTheme(theme);
    }, [theme]);

    return <div ref={hostRef} className={className} aria-hidden="true" />;
}
