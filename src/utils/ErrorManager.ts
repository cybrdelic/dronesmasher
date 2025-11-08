/**
 * Global error manager for WebGPU and application errors
 * Provides centralized error tracking and user-visible error display
 */

import { Logger } from './Logger';

export interface ErrorInfo {
  id: string;
  type: 'webgpu' | 'validation' | 'device-lost' | 'shader' | 'runtime' | 'unknown';
  message: string;
  details?: string;
  timestamp: number;
  count: number;
}

class ErrorManagerImpl {
  private errors: ErrorInfo[] = [];
  private errorMap = new Map<string, ErrorInfo>();
  private listeners: ((errors: ErrorInfo[]) => void)[] = [];
  private readonly MAX_ERRORS = 50;

  subscribe(listener: (errors: ErrorInfo[]) => void): () => void {
    this.listeners.push(listener);
    listener([...this.errors]); // Send current errors immediately
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener([...this.errors]));
  }

  addError(type: ErrorInfo['type'], message: string, details?: string) {
    const id = `${type}:${message}`;
    const existing = this.errorMap.get(id);

    if (existing) {
      // Update existing error count
      existing.count++;
      existing.timestamp = Date.now();
      this.notifyListeners();
    } else {
      // Create new error
      const error: ErrorInfo = {
        id,
        type,
        message,
        details,
        timestamp: Date.now(),
        count: 1,
      };

      this.errors.push(error);
      this.errorMap.set(id, error);

      // Limit stored errors
      if (this.errors.length > this.MAX_ERRORS) {
        const removed = this.errors.shift();
        if (removed) {
          this.errorMap.delete(removed.id);
        }
      }

      this.notifyListeners();
    }

    // Also log to logger
    Logger.error(`[${type}] ${message}`, details);
  }

  handleWebGPUError(error: GPUError) {
    let type: ErrorInfo['type'] = 'webgpu';
    let message = 'Unknown WebGPU error';
    let details: string | undefined;

    if (error instanceof GPUValidationError) {
      type = 'validation';
      message = 'WebGPU Validation Error';
      details = error.message;
    } else if (error instanceof GPUOutOfMemoryError) {
      type = 'webgpu';
      message = 'WebGPU Out of Memory';
      details = 'GPU ran out of memory. Try reducing grid resolution or particle count.';
    } else if (error instanceof GPUInternalError) {
      type = 'webgpu';
      message = 'WebGPU Internal Error';
      details = error.message;
    }

    this.addError(type, message, details);
  }

  handleDeviceLost(info: GPUDeviceLostInfo) {
    this.addError(
      'device-lost',
      'WebGPU Device Lost',
      `Reason: ${info.reason}\n${info.message}`
    );
  }

  handleShaderError(label: string, messages: readonly GPUCompilationMessage[]) {
    const errors = messages.filter(m => m.type === 'error');
    if (errors.length === 0) return;

    const message = `Shader compilation failed: ${label}`;
    const details = errors
      .map(e => `Line ${e.lineNum}: ${e.message}`)
      .join('\n');

    this.addError('shader', message, details);
  }

  clearError(id: string) {
    const index = this.errors.findIndex(e => e.id === id);
    if (index > -1) {
      const removed = this.errors.splice(index, 1)[0];
      if (removed) {
        this.errorMap.delete(removed.id);
      }
      this.notifyListeners();
    }
  }

  clearAll() {
    this.errors = [];
    this.errorMap.clear();
    this.notifyListeners();
  }

  getErrors(): ErrorInfo[] {
    return [...this.errors];
  }

  hasErrors(): boolean {
    return this.errors.length > 0;
  }
}

export const ErrorManager = new ErrorManagerImpl();
