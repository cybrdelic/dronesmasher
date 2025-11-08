import React from 'react';
import { Viewport3D } from './Viewport3D';
import { ErrorPanel } from './ErrorPanel';
import { DebugPanel } from './DebugPanel';
import './App.css';

export const App: React.FC = () => {
  return (
    <div className="app">
      <header className="app-header">
        <h1>DroneSmasher</h1>
        <p>Physics-based Drone Frame Optimization</p>
      </header>

      <main className="app-main">
        <div className="viewport-container">
          <Viewport3D />
        </div>

        <aside className="control-panel">
          <section className="panel-section">
            <h2>Material</h2>
            <select>
              <option value="PLA">PLA</option>
              <option value="PETG">PETG</option>
              <option value="TPU">TPU</option>
              <option value="CARBON_FIBER_PLA">Carbon Fiber PLA</option>
              <option value="NYLON">Nylon</option>
            </select>
          </section>

          <section className="panel-section">
            <h2>Optimization</h2>
            <div className="control-group">
              <label>Volume Fraction: 30%</label>
              <input type="range" min="10" max="60" defaultValue="30" />
            </div>
            <div className="control-group">
              <label>Filter Radius: 1.5</label>
              <input type="range" min="0.5" max="3" step="0.1" defaultValue="1.5" />
            </div>
            <button className="primary-button">Start Optimization</button>
          </section>

          <section className="panel-section">
            <h2>Scenarios</h2>
            <div className="scenario-list">
              <label>
                <input type="checkbox" defaultChecked />
                Hover (Weight: 1.0)
              </label>
              <label>
                <input type="checkbox" defaultChecked />
                Forward Flight (Weight: 0.8)
              </label>
              <label>
                <input type="checkbox" defaultChecked />
                Hard Maneuver (Weight: 0.6)
              </label>
              <label>
                <input type="checkbox" defaultChecked />
                Vertical Crash (Weight: 1.0)
              </label>
              <label>
                <input type="checkbox" />
                Side Crash (Weight: 0.7)
              </label>
            </div>
          </section>

          <section className="panel-section">
            <h2>Status</h2>
            <div className="status-info">
              <div>WebGPU: <span className="status-ready">Ready</span></div>
              <div>Iteration: 0 / 200</div>
              <div>Compliance: -</div>
              <div>Volume: 0%</div>
            </div>
          </section>
        </aside>
      </main>

      <DebugPanel />
      <ErrorPanel />
    </div>
  );
};
