/**
 * Debug panel for WebGPU state visibility
 * Shows device lifecycle, context state, and live errors
 */

import React, { useEffect, useState } from 'react';
import { Logger, LogLevel } from '../utils/Logger';
import type { ErrorInfo } from '../utils/ErrorManager';
import { ErrorManager } from '../utils/ErrorManager';
import './DebugPanel.css';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: number;
  count: number;
}

export const DebugPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [filter, setFilter] = useState<'all' | 'errors' | 'webgpu'>('all');

  useEffect(() => {
    // Subscribe to logger
    const unsubscribeLogger = Logger.subscribe((entry) => {
      setLogs(prev => [...prev.slice(-99), entry]); // Keep last 100
    });

    // Subscribe to error manager
    const unsubscribeErrors = ErrorManager.subscribe((newErrors) => {
      setErrors(newErrors);
    });

    return () => {
      unsubscribeLogger();
      unsubscribeErrors();
    };
  }, []);

  const filteredLogs = logs.filter(log => {
    if (filter === 'errors') return log.level >= LogLevel.ERROR;
    if (filter === 'webgpu') return log.message.toLowerCase().includes('webgpu') ||
                                     log.message.toLowerCase().includes('device') ||
                                     log.message.toLowerCase().includes('canvas');
    return true;
  });

  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case LogLevel.DEBUG: return '#888';
      case LogLevel.INFO: return '#4a9eff';
      case LogLevel.WARN: return '#fbbf24';
      case LogLevel.ERROR: return '#ef4444';
    }
  };

  const getLevelName = (level: LogLevel) => {
    return LogLevel[level];
  };

  return (
    <div className={`debug-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="debug-panel-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span className="debug-panel-title">
          🔍 Debug Console ({logs.length} logs, {errors.length} errors)
        </span>
        <div className="debug-panel-actions" onClick={e => e.stopPropagation()}>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="debug-filter"
          >
            <option value="all">All</option>
            <option value="errors">Errors Only</option>
            <option value="webgpu">WebGPU Only</option>
          </select>
          <button onClick={() => setLogs([])} className="debug-button">
            Clear Logs
          </button>
          <button onClick={() => Logger.setLevel(
            Logger['level'] === LogLevel.DEBUG ? LogLevel.INFO : LogLevel.DEBUG
          )} className="debug-button">
            {Logger['level'] === LogLevel.DEBUG ? 'Hide Debug' : 'Show Debug'}
          </button>
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="debug-button">
            {isCollapsed ? '▲' : '▼'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="debug-panel-content">
          {filteredLogs.length === 0 && (
            <div className="debug-empty">No logs to display</div>
          )}
          {filteredLogs.map((log, i) => (
            <div
              key={`${log.timestamp}-${i}`}
              className="debug-log-entry"
              style={{ borderLeftColor: getLevelColor(log.level) }}
            >
              <span className="debug-log-level" style={{ color: getLevelColor(log.level) }}>
                [{getLevelName(log.level)}]
              </span>
              <span className="debug-log-time">
                {new Date(log.timestamp).toLocaleTimeString()}.{String(log.timestamp % 1000).padStart(3, '0')}
              </span>
              <span className="debug-log-message">
                {log.message}
                {log.count > 1 && <span className="debug-log-count"> ×{log.count}</span>}
              </span>
              {log.data && (
                <pre className="debug-log-data">
                  {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
