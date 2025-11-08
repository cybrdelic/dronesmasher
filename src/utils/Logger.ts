/**
 * Centralized logging system with error deduplication
 * Prevents console spam while maintaining visibility
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: number;
  count: number;
}

class LoggerImpl {
  public level: LogLevel = LogLevel.DEBUG; // Default to DEBUG for development
  private entries: LogEntry[] = [];
  private recentMessages = new Map<string, { timestamp: number; count: number }>();
  private readonly SPAM_THRESHOLD = 500; // ms
  private readonly MAX_ENTRIES = 1000;
  private listeners: ((entry: LogEntry) => void)[] = [];

  setLevel(level: LogLevel) {
    this.level = level;
  }

  subscribe(listener: (entry: LogEntry) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private shouldLog(level: LogLevel, message: string): boolean {
    if (level < this.level) return false;

    // Check for spam
    const key = `${level}:${message}`;
    const now = Date.now();
    const recent = this.recentMessages.get(key);

    if (recent && now - recent.timestamp < this.SPAM_THRESHOLD) {
      recent.count++;
      this.recentMessages.set(key, recent);
      return false;
    }

    this.recentMessages.set(key, { timestamp: now, count: 1 });

    // Cleanup old entries
    for (const [k, v] of this.recentMessages) {
      if (now - v.timestamp > this.SPAM_THRESHOLD * 2) {
        this.recentMessages.delete(k);
      }
    }

    return true;
  }

  private log(level: LogLevel, message: string, data?: unknown) {
    const key = `${level}:${message}`;
    const recent = this.recentMessages.get(key);
    const count = recent?.count ?? 1;

    const entry: LogEntry = {
      level,
      message: count > 1 ? `${message} (×${count})` : message,
      data,
      timestamp: Date.now(),
      count,
    };

    // Add to entries
    this.entries.push(entry);
    if (this.entries.length > this.MAX_ENTRIES) {
      this.entries.shift();
    }

    // Notify listeners
    this.listeners.forEach(listener => listener(entry));

    // Console output
    const levelName = LogLevel[level];
    const prefix = `[${levelName}]`;
    const fullMessage = `${prefix} ${entry.message}`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(fullMessage, data ?? '');
        break;
      case LogLevel.INFO:
        console.info(fullMessage, data ?? '');
        break;
      case LogLevel.WARN:
        console.warn(fullMessage, data ?? '');
        break;
      case LogLevel.ERROR:
        console.error(fullMessage, data ?? '');
        break;
    }
  }

  debug(message: string, data?: unknown) {
    if (this.shouldLog(LogLevel.DEBUG, message)) {
      this.log(LogLevel.DEBUG, message, data);
    }
  }

  info(message: string, data?: unknown) {
    if (this.shouldLog(LogLevel.INFO, message)) {
      this.log(LogLevel.INFO, message, data);
    }
  }

  warn(message: string, data?: unknown) {
    if (this.shouldLog(LogLevel.WARN, message)) {
      this.log(LogLevel.WARN, message, data);
    }
  }

  error(message: string, data?: unknown) {
    if (this.shouldLog(LogLevel.ERROR, message)) {
      this.log(LogLevel.ERROR, message, data);
    }
  }

  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  getRecentErrors(count: number = 10): LogEntry[] {
    return this.entries
      .filter(e => e.level >= LogLevel.WARN)
      .slice(-count);
  }

  clear() {
    this.entries = [];
    this.recentMessages.clear();
  }
}

export const Logger = new LoggerImpl();
