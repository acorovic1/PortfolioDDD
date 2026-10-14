import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import VideoPlayer from './VideoPlayer';
import { formatVideoTime } from '@/frontend/utils/videoTime';

// jsdom doesn't play media: give each <video> a fake clock and play state.
function fakeMedia(video: HTMLVideoElement, duration = 60) {
  let time = 0;
  let paused = true;
  Object.defineProperties(video, {
    duration: { configurable: true, get: () => duration },
    currentTime: {
      configurable: true,
      get: () => time,
      set: (value: number) => {
        time = value;
        video.dispatchEvent(new Event('seeked'));
      },
    },
    paused: { configurable: true, get: () => paused },
    ended: { configurable: true, get: () => false },
  });
  video.play = vi.fn(() => {
    paused = false;
    video.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });
  video.pause = vi.fn(() => {
    paused = true;
    video.dispatchEvent(new Event('pause'));
  });
  video.dispatchEvent(new Event('durationchange'));
  return { time: () => time };
}

function renderPlayer(props: Partial<Parameters<typeof VideoPlayer>[0]> = {}) {
  const result = render(<VideoPlayer src="/uploads/videos/loop.mp4" label="Turntable" autoPlay={false} {...props} />);
  const video = result.container.querySelector('video')!;
  // The duration reaches React's state before anything is pressed.
  let media!: ReturnType<typeof fakeMedia>;
  act(() => { media = fakeMedia(video); });
  return { ...result, video, media };
}

const press = (key: string, target: Element | Window = window) => act(() => {
  fireEvent.keyDown(target, { key });
});

describe('VideoPlayer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('plays and pauses from the button and with K / Space', async () => {
    const { video } = renderPlayer();

    // The big button over the picture and the one in the controls.
    expect(screen.getAllByRole('button', { name: 'Play (K)' })).toHaveLength(2);
    fireEvent.click(document.querySelector('.video-player-play')!);
    expect(video.play).toHaveBeenCalledTimes(1);
    // Playing: the big button goes away and the control turns into pause.
    expect(screen.getByRole('button', { name: 'Pause (K)' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Play (K)' })).not.toBeInTheDocument();

    await press('k');
    expect(video.pause).toHaveBeenCalledTimes(1);
    await press(' ');
    expect(video.play).toHaveBeenCalledTimes(2);
  });

  it('jumps 10 s with J/L and the buttons, 5 s with the arrows', async () => {
    const { media } = renderPlayer();

    await press('l');
    expect(media.time()).toBe(10);
    await press('ArrowRight');
    expect(media.time()).toBe(15);
    await press('j');
    expect(media.time()).toBe(5);
    await press('ArrowLeft');
    expect(media.time()).toBe(0);
    // Not before the start.
    await press('ArrowLeft');
    expect(media.time()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds (L)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Forward 10 seconds (L)' }));
    expect(media.time()).toBe(20);
    fireEvent.click(screen.getByRole('button', { name: 'Back 10 seconds (J)' }));
    expect(media.time()).toBe(10);
  });

  it('steps single frames, pausing first', async () => {
    const { video, media } = renderPlayer();

    await press('.');
    expect(video.pause).toHaveBeenCalled();
    expect(media.time()).toBeCloseTo(1 / 30);
    fireEvent.click(screen.getByRole('button', { name: 'Next frame (.)' }));
    expect(media.time()).toBeCloseTo(2 / 30);
    await press(',');
    expect(media.time()).toBeCloseTo(1 / 30);
  });

  it('jumps to a tenth of the video with the digit keys, and to either end', async () => {
    const { media } = renderPlayer();

    await press('5');
    expect(media.time()).toBe(30);
    await press('End');
    expect(media.time()).toBe(60);
    await press('Home');
    expect(media.time()).toBe(0);
  });

  it('seeks with the scrubber', () => {
    const { media } = renderPlayer();

    fireEvent.change(screen.getByRole('slider', { name: 'Seek' }), { target: { value: '42' } });
    expect(media.time()).toBe(42);
  });

  it('changes speed, loop and sound', () => {
    const { video } = renderPlayer();

    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), { target: { value: '2' } });
    expect(video.playbackRate).toBe(2);

    expect(video.loop).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Loop' }));
    expect(video.loop).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Mute (M)' }));
    expect(video.muted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Unmute (M)' }));
    expect(video.muted).toBe(false);
  });

  it('leaves keys typed into other fields alone', async () => {
    const { media } = renderPlayer();
    const input = document.createElement('input');
    document.body.appendChild(input);

    await press('l', input);
    expect(media.time()).toBe(0);
    input.remove();
  });

  it('hands fullscreen to the surrounding view when it handles it', async () => {
    const onToggleFullscreen = vi.fn();
    renderPlayer({ onToggleFullscreen, isFullscreen: false });

    await press('f');
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(2);
  });

  it('reports where it was when it closes', async () => {
    const onLeave = vi.fn();
    const { unmount } = renderPlayer({ onLeave });

    await press('l');
    unmount();
    expect(onLeave).toHaveBeenCalledWith(10);
  });
});

describe('formatVideoTime', () => {
  it('formats like a video player', () => {
    expect(formatVideoTime(7.9)).toBe('0:07');
    expect(formatVideoTime(272)).toBe('4:32');
    expect(formatVideoTime(3729)).toBe('1:02:09');
    expect(formatVideoTime(Number.NaN)).toBe('0:00');
  });
});
