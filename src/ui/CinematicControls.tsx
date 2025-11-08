/**
 * Cinematic Controls Panel - UI for camera sequences and visual effects
 */

import React from 'react';

export interface CinematicControlsProps {
  onPlaySequence: (sequence: string) => void;
  onToggleAnimation: () => void;
  onToggleEffect: (effect: string, enabled: boolean) => void;
  isAnimating: boolean;
  currentSequence: string | null;
  effects: {
    bloom: boolean;
    filmGrain: boolean;
    vignette: boolean;
    chromaticAberration: boolean;
  };
}

export const CinematicControls: React.FC<CinematicControlsProps> = ({
  onPlaySequence,
  onToggleAnimation,
  onToggleEffect,
  isAnimating,
  currentSequence,
  effects,
}) => {
  const sequences = [
    { id: 'HERO_REVEAL', name: 'Hero Reveal', duration: '8s' },
    { id: 'DRAMATIC_ORBIT', name: 'Dramatic Orbit', duration: '12s' },
    { id: 'DOLLY_ZOOM', name: 'Dolly Zoom', duration: '4s' },
    { id: 'FLY_THROUGH', name: 'Fly-Through', duration: '6s' },
    { id: 'LOW_ANGLE_HERO', name: 'Low Angle Hero', duration: '5s' },
    { id: 'CRASH_ZOOM', name: 'Crash Zoom', duration: '1.5s' },
  ];

  return (
    <div className="cinematic-controls">
      <div className="control-section">
        <h3>Cube Controls</h3>
        <button
          className={`toggle-button ${isAnimating ? 'active' : ''}`}
          onClick={onToggleAnimation}
        >
          {isAnimating ? '⏸ Pause Rotation' : '▶ Start Rotation'}
        </button>
        <p className="hint">Press SPACE to toggle</p>
      </div>

      <div className="control-section">
        <h3>Cinematic Sequences</h3>
        <div className="sequence-grid">
          {sequences.map((seq) => (
            <button
              key={seq.id}
              className={`sequence-button ${
                currentSequence === seq.id ? 'playing' : ''
              }`}
              onClick={() => onPlaySequence(seq.id)}
              title={`Duration: ${seq.duration}`}
            >
              {seq.name}
            </button>
          ))}
        </div>
        <p className="hint">Press 5-0 for quick access</p>
      </div>

      <div className="control-section">
        <h3>Post-Processing Effects</h3>
        <div className="effects-list">
          <label className="effect-toggle">
            <input
              type="checkbox"
              checked={effects.bloom}
              onChange={(e) => onToggleEffect('bloom', e.target.checked)}
            />
            <span>Bloom (Glow)</span>
          </label>

          <label className="effect-toggle">
            <input
              type="checkbox"
              checked={effects.filmGrain}
              onChange={(e) => onToggleEffect('filmGrain', e.target.checked)}
            />
            <span>Film Grain</span>
          </label>

          <label className="effect-toggle">
            <input
              type="checkbox"
              checked={effects.vignette}
              onChange={(e) => onToggleEffect('vignette', e.target.checked)}
            />
            <span>Vignette</span>
          </label>

          <label className="effect-toggle">
            <input
              type="checkbox"
              checked={effects.chromaticAberration}
              onChange={(e) =>
                onToggleEffect('chromaticAberration', e.target.checked)
              }
            />
            <span>Chromatic Aberration</span>
          </label>
        </div>
      </div>

      <div className="control-section">
        <h3>Camera Modes</h3>
        <div className="mode-hint">
          <div>1 - Free Orbit</div>
          <div>2 - Locked Orbit</div>
          <div>3 - Drone FPV (WASD)</div>
          <div>4 - Auto Cinematic</div>
          <div>R - Reset Camera</div>
        </div>
      </div>

      <style jsx>{`
        .cinematic-controls {
          position: absolute;
          top: 1rem;
          right: 1rem;
          width: 280px;
          background: rgba(26, 26, 36, 0.95);
          border-radius: 8px;
          padding: 1rem;
          color: #e0e0e0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          pointer-events: auto;
        }

        .control-section {
          margin-bottom: 1.5rem;
        }

        .control-section:last-child {
          margin-bottom: 0;
        }

        .control-section h3 {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #888;
          margin-bottom: 0.75rem;
          font-weight: 600;
        }

        .toggle-button {
          width: 100%;
          padding: 0.75rem;
          background: linear-gradient(135deg, #2a2a3a 0%, #1a1a24 100%);
          border: 1px solid #3a3a4a;
          border-radius: 6px;
          color: #e0e0e0;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .toggle-button:hover {
          background: linear-gradient(135deg, #3a3a4a 0%, #2a2a3a 100%);
          border-color: #4a4a5a;
        }

        .toggle-button.active {
          background: linear-gradient(135deg, #4a9eff 0%, #6b5eff 100%);
          border-color: #4a9eff;
          color: #fff;
        }

        .sequence-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }

        .sequence-button {
          padding: 0.5rem;
          background: #2a2a3a;
          border: 1px solid #3a3a4a;
          border-radius: 4px;
          color: #e0e0e0;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .sequence-button:hover {
          background: #3a3a4a;
          border-color: #4a9eff;
        }

        .sequence-button.playing {
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          border-color: #f59e0b;
          color: #fff;
          font-weight: 600;
        }

        .effects-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .effect-toggle {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
          padding: 0.25rem 0;
        }

        .effect-toggle input[type='checkbox'] {
          width: 16px;
          height: 16px;
          cursor: pointer;
        }

        .effect-toggle span {
          user-select: none;
        }

        .hint {
          margin-top: 0.5rem;
          font-size: 0.75rem;
          color: #666;
          font-style: italic;
        }

        .mode-hint {
          font-size: 0.75rem;
          color: #888;
          line-height: 1.6;
        }

        .mode-hint div {
          padding: 0.25rem 0;
          border-bottom: 1px solid #2a2a3a;
        }

        .mode-hint div:last-child {
          border-bottom: none;
        }
      `}</style>
    </div>
  );
};
