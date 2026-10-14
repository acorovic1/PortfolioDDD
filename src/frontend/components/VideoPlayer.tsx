import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/frontend/hooks/useI18n';
import {
  PlayIcon, PauseIcon, SkipBackIcon, SkipForwardIcon, FrameBackIcon, FrameForwardIcon,
  VolumeIcon, MuteIcon, LoopIcon, FullscreenIcon, ExitFullscreenIcon,
} from '@/frontend/svg/Icons';
import { formatVideoTime } from '@/frontend/utils/videoTime';
import '@/frontend/css/ImageViewer.css';
import '@/frontend/css/VideoPlayer.css';

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2] as const;
const SKIP_SECONDS = 10;
const ARROW_SECONDS = 5;
// Browsers don't tell a video's frame rate; one step is a frame at 30 fps.
const FRAME_SECONDS = 1 / 30;

// The volume a viewer picked, for the next video they open (this session).
let rememberedVolume = 1;
let rememberedMuted = false;

const SLIDER_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

// Keys meant for a form field aren't player shortcuts: anything typed into
// a text field or select, and the keys a focused slider (the scrubber or
// volume) moves itself with.
function isFieldKey(target: EventTarget | null, key: string): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  return (el as HTMLInputElement).type === 'range' ? SLIDER_KEYS.has(key) : true;
}

type VideoPlayerProps = {
  src: string;
  poster?: string | null;
  // Names the player for screen readers.
  label: string;
  // Where to start (e.g. where the carousel's copy had got to).
  startAt?: number;
  autoPlay?: boolean;
  // Fullscreen handled by the surrounding view; without it the player
  // takes itself fullscreen.
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  // Called with the current time when the player goes away.
  onLeave?: (time: number) => void;
};

// A video with the controls of a desktop video player: play/pause, a
// scrubber showing what's buffered, 10 s jumps, frame steps, speed, loop,
// volume and fullscreen, plus the usual keyboard shortcuts.
export default function VideoPlayer({
  src, poster, label, startAt = 0, autoPlay = true, isFullscreen, onToggleFullscreen, onLeave,
}: VideoPlayerProps) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(startAt);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [volume, setVolume] = useState(rememberedVolume);
  const [muted, setMuted] = useState(rememberedMuted);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [ownFullscreen, setOwnFullscreen] = useState(false);
  const fullscreen = onToggleFullscreen ? !!isFullscreen : ownFullscreen;

  const video = () => videoRef.current;

  // --- Commands ---

  const play = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.ended) el.currentTime = 0;
    el.play().catch((error: Error) => {
      // Sound needs a click first in some browsers: play muted instead.
      if (error.name === 'NotAllowedError' && !el.muted) {
        el.muted = true;
        setMuted(true);
        el.play().catch(() => {});
      }
    });
  }, []);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused || el.ended) play();
    else el.pause();
  }, [play]);

  const seekTo = useCallback((seconds: number) => {
    const el = videoRef.current;
    if (!el) return;
    const end = Number.isFinite(el.duration) ? el.duration : seconds;
    el.currentTime = Math.min(Math.max(0, seconds), end);
    setTime(el.currentTime);
  }, []);

  const seekBy = useCallback((seconds: number) => {
    const el = videoRef.current;
    if (el) seekTo(el.currentTime + seconds);
  }, [seekTo]);

  // Steps pause the video: a frame is only worth looking at standing still.
  const stepFrame = useCallback((direction: 1 | -1) => {
    const el = videoRef.current;
    if (!el) return;
    el.pause();
    seekTo(el.currentTime + direction * FRAME_SECONDS);
  }, [seekTo]);

  const changeVolume = useCallback((next: number) => {
    const el = videoRef.current;
    const clamped = Math.min(1, Math.max(0, next));
    setVolume(clamped);
    rememberedVolume = clamped;
    const silent = clamped === 0;
    setMuted(silent);
    rememberedMuted = silent;
    if (el) {
      el.volume = clamped;
      el.muted = silent;
    }
  }, []);

  const toggleMute = useCallback(() => {
    const el = videoRef.current;
    if (!el) return;
    const next = !el.muted;
    el.muted = next;
    // Unmuting at zero volume would still be silent.
    if (!next && el.volume === 0) {
      el.volume = 0.5;
      setVolume(0.5);
      rememberedVolume = 0.5;
    }
    setMuted(next);
    rememberedMuted = next;
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (onToggleFullscreen) {
      onToggleFullscreen();
      return;
    }
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else root.requestFullscreen?.().catch(() => {});
  }, [onToggleFullscreen]);

  // --- Wiring to the element ---

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.volume = rememberedVolume;
    el.muted = rememberedMuted;
    if (startAt > 0) el.currentTime = startAt;
    if (autoPlay) play();
    // Once, for the element this player was mounted with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hands the time back when the player closes (read from the element, so
  // it's exact even between time updates).
  const onLeaveRef = useRef(onLeave);
  useEffect(() => { onLeaveRef.current = onLeave; }, [onLeave]);
  useEffect(() => {
    const el = videoRef.current;
    return () => {
      if (el) onLeaveRef.current?.(el.currentTime);
    };
  }, []);

  // Smooth scrubber while playing (timeupdate only fires a few times a second).
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const el = videoRef.current;
      if (el) setTime(el.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    if (onToggleFullscreen) return;
    const onChange = () => setOwnFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [onToggleFullscreen]);

  const updateBuffered = () => {
    const el = video();
    if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
    const ranges = el.buffered;
    let end = 0;
    for (let i = 0; i < ranges.length; i++) {
      if (ranges.start(i) <= el.currentTime + 0.5) end = Math.max(end, ranges.end(i));
    }
    setBuffered(end / el.duration);
  };

  // --- Keyboard ---

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isFieldKey(event.target, event.key)) return;
      const el = videoRef.current;
      if (!el) return;

      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const actions: Record<string, () => void> = {
        ' ': togglePlay,
        k: togglePlay,
        j: () => seekBy(-SKIP_SECONDS),
        l: () => seekBy(SKIP_SECONDS),
        ArrowLeft: () => seekBy(-ARROW_SECONDS),
        ArrowRight: () => seekBy(ARROW_SECONDS),
        ',': () => stepFrame(-1),
        '.': () => stepFrame(1),
        Home: () => seekTo(0),
        End: () => seekTo(el.duration),
        ArrowUp: () => changeVolume(el.volume + 0.05),
        ArrowDown: () => changeVolume(el.volume - 0.05),
        m: toggleMute,
        f: toggleFullscreen,
      };
      // 0-9 jump to 0%-90%.
      if (/^[0-9]$/.test(key) && Number.isFinite(el.duration)) {
        actions[key] = () => seekTo((Number(key) / 10) * el.duration);
      }
      const action = actions[key];
      if (!action) return;
      // A focused button would also "click" on Space.
      event.preventDefault();
      action();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [togglePlay, seekBy, seekTo, stepFrame, changeVolume, toggleMute, toggleFullscreen]);

  const changeSpeed = (next: number) => {
    setSpeed(next);
    const el = video();
    if (el) el.playbackRate = next;
  };

  const toggleLoop = () => {
    const next = !loop;
    setLoop(next);
    const el = video();
    if (el) el.loop = next;
  };

  const played = duration > 0 ? (Math.min(time, duration) / duration) * 100 : 0;
  const loaded = Math.max(played, buffered * 100);
  const silent = muted || volume === 0;

  return (
    <div ref={rootRef} className={`video-player ${fullscreen ? 'fullscreen' : ''}`} role="group" aria-label={label}>
      <div className="video-player-stage">
        <video
          ref={videoRef}
          src={src}
          poster={poster ?? undefined}
          className="video-player-video"
          crossOrigin="anonymous"
          playsInline
          loop={loop}
          preload="auto"
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onTimeUpdate={(e) => { setTime(e.currentTarget.currentTime); updateBuffered(); }}
          onSeeked={(e) => setTime(e.currentTarget.currentTime)}
          onDurationChange={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
          onLoadedMetadata={(e) => setDuration(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0)}
          onProgress={updateBuffered}
          onWaiting={() => setWaiting(true)}
          onPlaying={() => setWaiting(false)}
          onCanPlay={() => setWaiting(false)}
          onError={() => setFailed(true)}
        />
        {failed ? (
          <p className="video-player-message" role="alert">{t('video.loadFailed')}</p>
        ) : waiting ? (
          <span className="video-player-spinner" aria-label={t('video.loading')} />
        ) : !playing && (
          <button type="button" className="video-player-big-play" onClick={play} aria-label={t('video.play')}>
            <PlayIcon width={34} height={34} />
          </button>
        )}
      </div>

      <div className="video-player-controls">
        <input
          type="range"
          className="video-player-scrubber"
          min={0}
          max={duration || 0}
          step="any"
          value={Math.min(time, duration || 0)}
          disabled={!duration}
          onChange={(e) => seekTo(Number(e.target.value))}
          aria-label={t('video.seek')}
          aria-valuetext={`${formatVideoTime(time)} / ${formatVideoTime(duration)}`}
          style={{
            background: `linear-gradient(to right, var(--color-accent) 0%, var(--color-accent) ${played}%, var(--video-buffered) ${played}%, var(--video-buffered) ${loaded}%, var(--video-track) ${loaded}%)`,
          }}
        />

        <div className="video-player-row">
          <div className="video-player-group">
            <button type="button" className="viewer-btn icon" onClick={() => seekBy(-SKIP_SECONDS)} title={t('video.back10')} aria-label={t('video.back10')}>
              <SkipBackIcon />
            </button>
            <button type="button" className="viewer-btn icon" onClick={() => stepFrame(-1)} title={t('video.frameBack')} aria-label={t('video.frameBack')}>
              <FrameBackIcon />
            </button>
            <button
              type="button"
              className="viewer-btn icon video-player-play"
              onClick={togglePlay}
              title={t(playing ? 'video.pause' : 'video.play')}
              aria-label={t(playing ? 'video.pause' : 'video.play')}
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button type="button" className="viewer-btn icon" onClick={() => stepFrame(1)} title={t('video.frameForward')} aria-label={t('video.frameForward')}>
              <FrameForwardIcon />
            </button>
            <button type="button" className="viewer-btn icon" onClick={() => seekBy(SKIP_SECONDS)} title={t('video.forward10')} aria-label={t('video.forward10')}>
              <SkipForwardIcon />
            </button>
            <span className="video-player-time">
              {formatVideoTime(time)} / {formatVideoTime(duration)}
            </span>
          </div>

          <div className="video-player-group">
            <select
              className="video-player-speed"
              value={speed}
              onChange={(e) => changeSpeed(Number(e.target.value))}
              aria-label={t('video.speed')}
              title={t('video.speed')}
            >
              {PLAYBACK_SPEEDS.map(value => <option key={value} value={value}>{value}×</option>)}
            </select>
            <button
              type="button"
              className={`viewer-btn icon ${loop ? 'active' : ''}`}
              onClick={toggleLoop}
              aria-pressed={loop}
              title={t('video.loop')}
              aria-label={t('video.loop')}
            >
              <LoopIcon />
            </button>
            <button
              type="button"
              className="viewer-btn icon"
              onClick={toggleMute}
              title={t(silent ? 'video.unmute' : 'video.mute')}
              aria-label={t(silent ? 'video.unmute' : 'video.mute')}
            >
              {silent ? <MuteIcon /> : <VolumeIcon />}
            </button>
            <input
              type="range"
              className="video-player-volume"
              min={0}
              max={1}
              step={0.05}
              value={silent ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label={t('video.volume')}
            />
            <button
              type="button"
              className="viewer-btn icon"
              onClick={toggleFullscreen}
              title={t(fullscreen ? 'imageViewer.exitFullscreen' : 'imageViewer.fullscreen')}
              aria-label={t(fullscreen ? 'imageViewer.exitFullscreen' : 'imageViewer.fullscreen')}
            >
              {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
            </button>
          </div>
        </div>
        <p className="video-player-hint">{t('video.shortcuts')}</p>
      </div>
    </div>
  );
}
