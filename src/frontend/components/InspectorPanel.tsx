import { useEffect, useState } from 'react';
import type { ModelInspector, ViewMode, ShadingMode } from '@/frontend/inspector/ModelInspector';
import type { TextureChannel } from '@/frontend/inspector/modelStats';
import type { PostSettings, ToneMappingOption } from '@/frontend/inspector/PostProcessing';
import {
  CloseIcon,
  PlayIcon,
  PauseIcon,
  FullscreenIcon,
  ExitFullscreenIcon,
  OrbitIcon,
  ResetViewIcon,
  ChevronDownIcon,
} from '@/frontend/svg/Icons';
import '@/frontend/css/Inspector.css';

const SHADING_MODES: { mode: ShadingMode; label: string }[] = [
  { mode: 'lit', label: 'Lit' },
  { mode: 'wireframe', label: 'Wireframe' },
  { mode: 'matcap', label: 'Matcap' },
  { mode: 'uv-checker', label: 'UV checker' },
  { mode: 'normals', label: 'Normals' },
];

const CHANNELS: { channel: TextureChannel; label: string }[] = [
  { channel: 'albedo', label: 'Albedo' },
  { channel: 'normal', label: 'Normal' },
  { channel: 'roughness', label: 'Roughness' },
  { channel: 'metalness', label: 'Metalness' },
  { channel: 'ao', label: 'AO' },
  { channel: 'emissive', label: 'Emissive' },
];

const TONE_MAPPINGS: { value: ToneMappingOption; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'aces', label: 'ACES Filmic' },
  { value: 'agx', label: 'AgX' },
  { value: 'neutral', label: 'Neutral' },
];

const PLAYBACK_SPEEDS = [0.25, 0.5, 1, 1.5, 2];

function formatTime(seconds: number): string {
  return `${seconds.toFixed(2)}s`;
}

function formatDimension(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(2);
}

type InspectorPanelProps = {
  title: string;
  inspector: ModelInspector;
  postSettings: PostSettings;
  onPostSettingsChange: (settings: PostSettings) => void;
  autoRotate: boolean;
  onToggleAutoRotate: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onResetCamera: () => void;
  onExit: () => void;
};

// Focus-mode UI: shading/texture-channel modes, post-processing, animation
// playback and model statistics for the one focused model, plus the camera
// toolbar that replaces the carousel controls while focused. Remounted (via
// `key`) for every newly focused model, so its state always starts fresh.
export default function InspectorPanel({
  title,
  inspector,
  postSettings,
  onPostSettingsChange,
  autoRotate,
  onToggleAutoRotate,
  isFullscreen,
  onToggleFullscreen,
  onResetCamera,
  onExit,
}: InspectorPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('lit');
  const [wireOverlay, setWireOverlay] = useState(false);
  const [activeClip, setActiveClip] = useState(-1);
  const [paused, setPaused] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [time, setTime] = useState(0);

  const stats = inspector.stats;
  const clip = activeClip >= 0 ? inspector.clips[activeClip] : null;

  // Follow the playhead while an animation runs.
  useEffect(() => {
    if (activeClip < 0 || paused) return;
    let frameId = 0;
    const tick = () => {
      setTime(inspector.currentTime);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [inspector, activeClip, paused]);

  const selectViewMode = (mode: ViewMode) => {
    setViewMode(mode);
    inspector.setViewMode(mode);
  };

  const toggleWireOverlay = () => {
    const next = !wireOverlay;
    setWireOverlay(next);
    inspector.setWireframeOverlay(next);
  };

  const selectClip = (index: number) => {
    setActiveClip(index);
    if (index < 0) {
      inspector.stopAnimation();
      setPaused(true);
      setTime(0);
      return;
    }
    inspector.playClip(index);
    inspector.setSpeed(speed);
    setPaused(false);
    setTime(0);
  };

  const togglePlayback = () => {
    if (activeClip < 0) {
      selectClip(0);
      return;
    }
    const next = !paused;
    inspector.setPaused(next);
    setPaused(next);
  };

  const changeSpeed = (value: number) => {
    setSpeed(value);
    inspector.setSpeed(value);
  };

  const scrub = (value: number) => {
    if (!paused) {
      inspector.setPaused(true);
      setPaused(true);
    }
    inspector.seek(value);
    setTime(value);
  };

  const updatePost = <K extends keyof PostSettings>(key: K, value: PostSettings[K]) => {
    onPostSettingsChange({ ...postSettings, [key]: value });
  };

  return (
    <>
      <div className="inspector-toolbar">
        <button className="inspector-tool-btn exit" onClick={onExit} title="Exit inspector (Esc)">
          <CloseIcon />
          <span>Exit</span>
        </button>
        <button className="inspector-tool-btn" onClick={onResetCamera} title="Reset camera">
          <ResetViewIcon />
        </button>
        <button
          className={`inspector-tool-btn ${autoRotate ? 'active' : ''}`}
          onClick={onToggleAutoRotate}
          title="Auto-rotate"
          aria-pressed={autoRotate}
        >
          <OrbitIcon />
        </button>
        <button
          className="inspector-tool-btn"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
        </button>
      </div>

      <aside className={`inspector-panel ${collapsed ? 'collapsed' : ''}`} aria-label="Model inspector">
        <header className="inspector-header">
          <div>
            <span className="inspector-eyebrow">Inspector</span>
            <h4 className="inspector-title">{title || 'Untitled'}</h4>
          </div>
          <button
            className="inspector-collapse"
            onClick={() => setCollapsed(prev => !prev)}
            title={collapsed ? 'Expand panel' : 'Collapse panel'}
            aria-expanded={!collapsed}
          >
            <ChevronDownIcon />
          </button>
        </header>

        {!collapsed && (
          <div className="inspector-body">
            <section className="inspector-section">
              <h5>Shading</h5>
              <div className="inspector-chip-grid">
                {SHADING_MODES.map(({ mode, label }) => (
                  <button
                    key={mode}
                    className={`inspector-chip ${viewMode === mode ? 'active' : ''}`}
                    onClick={() => selectViewMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="inspector-toggle">
                <input type="checkbox" checked={wireOverlay} onChange={toggleWireOverlay} />
                <span>Wireframe overlay</span>
              </label>
            </section>

            <section className="inspector-section">
              <h5>Texture channels</h5>
              <div className="inspector-chip-grid">
                {CHANNELS.map(({ channel, label }) => {
                  const mode: ViewMode = `channel:${channel}`;
                  const available = stats.channels[channel];
                  return (
                    <button
                      key={channel}
                      className={`inspector-chip ${viewMode === mode ? 'active' : ''} ${available ? '' : 'missing'}`}
                      onClick={() => selectViewMode(mode)}
                      title={available ? `Show the ${label.toLowerCase()} map` : `No ${label.toLowerCase()} map - showing the material's base value`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="inspector-section">
              <h5>Lighting &amp; post-processing</h5>
              <label className="inspector-toggle">
                <input
                  type="checkbox"
                  checked={postSettings.environment}
                  onChange={(e) => updatePost('environment', e.target.checked)}
                />
                <span>Studio environment</span>
              </label>
              <label className="inspector-field">
                <span>Tone mapping</span>
                <select
                  value={postSettings.toneMapping}
                  onChange={(e) => updatePost('toneMapping', e.target.value as ToneMappingOption)}
                >
                  {TONE_MAPPINGS.map(({ value, label }) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="inspector-field">
                <span>Exposure <em>{postSettings.exposure.toFixed(2)}</em></span>
                <input
                  type="range"
                  min={0.1}
                  max={3}
                  step={0.05}
                  value={postSettings.exposure}
                  onChange={(e) => updatePost('exposure', Number(e.target.value))}
                />
              </label>
              <label className="inspector-toggle">
                <input
                  type="checkbox"
                  checked={postSettings.ambientOcclusion}
                  onChange={(e) => updatePost('ambientOcclusion', e.target.checked)}
                />
                <span>Ambient occlusion (GTAO)</span>
              </label>
              <label className="inspector-toggle">
                <input
                  type="checkbox"
                  checked={postSettings.bloom}
                  onChange={(e) => updatePost('bloom', e.target.checked)}
                />
                <span>Bloom</span>
              </label>
              {postSettings.bloom && (
                <label className="inspector-field">
                  <span>Bloom strength <em>{postSettings.bloomStrength.toFixed(2)}</em></span>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={0.05}
                    value={postSettings.bloomStrength}
                    onChange={(e) => updatePost('bloomStrength', Number(e.target.value))}
                  />
                </label>
              )}
              <label className="inspector-toggle">
                <input
                  type="checkbox"
                  checked={postSettings.vignette}
                  onChange={(e) => updatePost('vignette', e.target.checked)}
                />
                <span>Vignette</span>
              </label>
            </section>

            {inspector.clips.length > 0 && (
              <section className="inspector-section">
                <h5>Animation</h5>
                <label className="inspector-field">
                  <span>Clip</span>
                  <select value={activeClip} onChange={(e) => selectClip(Number(e.target.value))}>
                    <option value={-1}>— Rest pose —</option>
                    {inspector.clips.map((c, i) => (
                      <option key={i} value={i}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <div className="inspector-playback">
                  <button
                    className="inspector-play-btn"
                    onClick={togglePlayback}
                    title={paused ? 'Play' : 'Pause'}
                  >
                    {paused ? <PlayIcon /> : <PauseIcon />}
                  </button>
                  <input
                    type="range"
                    className="inspector-scrubber"
                    min={0}
                    max={clip?.duration ?? 0}
                    step={0.01}
                    value={Math.min(time, clip?.duration ?? 0)}
                    disabled={!clip}
                    onChange={(e) => scrub(Number(e.target.value))}
                    aria-label="Animation time"
                  />
                  <span className="inspector-time">
                    {formatTime(Math.min(time, clip?.duration ?? 0))} / {formatTime(clip?.duration ?? 0)}
                  </span>
                </div>
                <div className="inspector-chip-grid speeds">
                  {PLAYBACK_SPEEDS.map(value => (
                    <button
                      key={value}
                      className={`inspector-chip ${speed === value ? 'active' : ''}`}
                      onClick={() => changeSpeed(value)}
                    >
                      {value}×
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="inspector-section">
              <h5>Model stats</h5>
              <dl className="inspector-stats">
                <div><dt>Triangles</dt><dd>{stats.triangles.toLocaleString()}</dd></div>
                <div><dt>Vertices</dt><dd>{stats.vertices.toLocaleString()}</dd></div>
                <div><dt>Meshes</dt><dd>{stats.meshes}</dd></div>
                <div><dt>Materials</dt><dd>{stats.materials}</dd></div>
                <div><dt>Textures</dt><dd>{stats.textures}</dd></div>
                <div>
                  <dt>Max texture</dt>
                  <dd>{stats.maxTextureSize > 0 ? `${stats.maxTextureSize}px` : '—'}</dd>
                </div>
                <div><dt>Animations</dt><dd>{stats.animations}</dd></div>
                <div><dt>Bones</dt><dd>{stats.bones}</dd></div>
                <div><dt>Morph targets</dt><dd>{stats.morphTargets}</dd></div>
                <div>
                  <dt>Dimensions</dt>
                  <dd>
                    {formatDimension(stats.dimensions.x)} × {formatDimension(stats.dimensions.y)} × {formatDimension(stats.dimensions.z)}
                  </dd>
                </div>
              </dl>
            </section>
          </div>
        )}
      </aside>
    </>
  );
}
