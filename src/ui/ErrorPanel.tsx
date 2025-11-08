import React, { useEffect, useState } from 'react';
import { ErrorManager, type ErrorInfo } from '../utils/ErrorManager';
import './ErrorPanel.css';

export const ErrorPanel: React.FC = () => {
  const [errors, setErrors] = useState<ErrorInfo[]>([]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const unsubscribe = ErrorManager.subscribe((newErrors) => {
      setErrors(newErrors);
      // Auto-expand when new errors arrive
      if (newErrors.length > 0) {
        setIsCollapsed(false);
      }
    });

    return unsubscribe;
  }, []);

  if (errors.length === 0) {
    return null;
  }

  const handleClear = () => {
    ErrorManager.clearAll();
  };

  const handleClearOne = (id: string) => {
    ErrorManager.clearError(id);
  };

  const getErrorIcon = (type: ErrorInfo['type']) => {
    switch (type) {
      case 'validation':
        return '⚠️';
      case 'device-lost':
        return '🔌';
      case 'shader':
        return '📝';
      case 'webgpu':
        return '🎮';
      default:
        return '❌';
    }
  };

  const getErrorColor = (type: ErrorInfo['type']) => {
    switch (type) {
      case 'validation':
        return '#fbbf24';
      case 'device-lost':
        return '#ef4444';
      case 'shader':
        return '#f97316';
      default:
        return '#dc2626';
    }
  };

  return (
    <div className={`error-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="error-panel-header" onClick={() => setIsCollapsed(!isCollapsed)}>
        <span className="error-panel-title">
          {getErrorIcon(errors[0]?.type ?? 'unknown')} Errors ({errors.length})
        </span>
        <div className="error-panel-actions">
          <button
            className="error-panel-button"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
            title="Clear all errors"
          >
            Clear All
          </button>
          <button
            className="error-panel-button"
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(!isCollapsed);
            }}
          >
            {isCollapsed ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="error-panel-content">
          {errors.map((error) => (
            <div
              key={error.id}
              className="error-item"
              style={{ borderLeftColor: getErrorColor(error.type) }}
            >
              <div className="error-item-header">
                <span className="error-item-icon">{getErrorIcon(error.type)}</span>
                <span className="error-item-type">{error.type}</span>
                {error.count > 1 && (
                  <span className="error-item-count">×{error.count}</span>
                )}
                <button
                  className="error-item-close"
                  onClick={() => handleClearOne(error.id)}
                  title="Dismiss this error"
                >
                  ×
                </button>
              </div>
              <div className="error-item-message">{error.message}</div>
              {error.details && (
                <pre className="error-item-details">{error.details}</pre>
              )}
              <div className="error-item-time">
                {new Date(error.timestamp).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
