/**
 * Cinematic Controls Panel - UI for camera sequences and visual effects
 */

import React from 'react';
import './CinematicControls.css';

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
    { id: 'HERO_REVEAL', name: 'Hero Reveal', duration: '10s' },
    { id: 'DRAMATIC_ORBIT', name: 'Dramatic Orbit', duration: '12s' },
    { id: 'DOLLY_ZOOM', name: 'Dolly Zoom', duration: '6s' },
    { id: 'FLY_THROUGH', name: 'Fly-Through', duration: '6s' },
    { id: 'LOW_ANGLE_HERO', name: 'Low Angle Hero', duration: '5s' },
    { id: 'CRASH_ZOOM', name: 'Crash Zoom', duration: '2s' },
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
    </div>
  );
};
