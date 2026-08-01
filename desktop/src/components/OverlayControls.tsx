import { invoke } from '@tauri-apps/api/core';

interface Props {
  clickThrough: boolean;
  protectedFromCapture: boolean;
  playing: boolean;
  speed: number;
  fontSize: number;
  opacity: number;
  timerSec: number;
  scriptTitle: string;
  roomId: string;
  onSpeed: (v: number) => void;
  onFontSize: (v: number) => void;
  onOpacity: (v: number) => void;
  onTogglePlay: () => void;
  onResetTimer: () => void;
  onLeave: () => void;
  onProtectedChanged: (v: boolean) => void;
}

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
};

export default function OverlayControls(p: Props) {
  const toggleClickThrough = () => invoke('toggle_click_through');
  const toggleProtection = async () => {
    const next = await invoke<boolean>('toggle_content_protected');
    p.onProtectedChanged(next);
  };

  return (
    <div className="controls">
      <div className="left">
        <button onClick={p.onLeave} title="Change script">↩</button>
        <span className="title" title={p.roomId}>
          {p.scriptTitle} <span className="mono muted">· {p.roomId}</span>
        </span>
      </div>

      <div className="center">
        <button onClick={p.onTogglePlay} className="primary">
          {p.playing ? '⏸ Pause' : '▶ Play'}
        </button>
        <label>
          Speed
          <input type="range" min={20} max={300} step={5}
                 value={p.speed} onChange={(e) => p.onSpeed(Number(e.target.value))} />
          <span className="mono">{p.speed}px/s</span>
        </label>
        <label>
          Size
          <input type="range" min={18} max={72} step={2}
                 value={p.fontSize} onChange={(e) => p.onFontSize(Number(e.target.value))} />
          <span className="mono">{p.fontSize}px</span>
        </label>
        <label>
          Bg
          <input type="range" min={0} max={1} step={0.05}
                 value={p.opacity} onChange={(e) => p.onOpacity(Number(e.target.value))} />
        </label>
        <button onClick={p.onResetTimer} title="Reset timer" className="mono">
          {formatTime(p.timerSec)}
        </button>
      </div>

      <div className="right">
        <span className={`dot ${p.protectedFromCapture ? 'on' : 'off'}`}
              title={p.protectedFromCapture ? 'Hidden from screen share' : 'Visible to screen share'} />
        <button onClick={toggleProtection} title="Toggle screen-share visibility">
          {p.protectedFromCapture ? 'Hidden' : 'Visible'}
        </button>
        <span className={`dot ${p.clickThrough ? 'on' : 'off'}`}
              title={p.clickThrough ? 'Click-through ON' : 'Click-through OFF'} />
        <button onClick={toggleClickThrough} title="⌘/Ctrl+Shift+P">
          {p.clickThrough ? 'Click-thru' : 'Interactive'}
        </button>
      </div>
    </div>
  );
}
