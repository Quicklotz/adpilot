/**
 * Tests for the API logger module.
 *
 * We mock the fs module for file operations and process.env for logging checks.
 */

jest.mock('fs');
// Mock ./config to avoid real filesystem reads from Conf
jest.mock('../../src/lib/config', () => ({
  config: { get: jest.fn(() => false) },
}));

import fs from 'fs';
import {
  isLoggingEnabled,
  sanitizeParams,
  logApiCall,
  getLogFiles,
  clearLogs,
  initLogger,
  LogEntry,
} from '../../src/lib/logger';

const mockFs = fs as jest.Mocked<typeof fs>;

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.ADPILOT_LOG;
});

function makeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: '2024-07-01T12:00:00.000Z',
    method: 'GET',
    endpoint: 'act_123/campaigns',
    params: { fields: 'id,name' },
    status: 'success',
    durationMs: 150,
    ...overrides,
  };
}

describe('isLoggingEnabled', () => {
  it('returns true when ADPILOT_LOG=true', () => {
    process.env.ADPILOT_LOG = 'true';
    expect(isLoggingEnabled()).toBe(true);
  });

  it('returns false when ADPILOT_LOG is not set', () => {
    delete process.env.ADPILOT_LOG;
    expect(isLoggingEnabled()).toBe(false);
  });

  it('returns false when ADPILOT_LOG is "false"', () => {
    process.env.ADPILOT_LOG = 'false';
    expect(isLoggingEnabled()).toBe(false);
  });

  it('returns false when ADPILOT_LOG is empty', () => {
    process.env.ADPILOT_LOG = '';
    expect(isLoggingEnabled()).toBe(false);
  });
});

describe('sanitizeParams', () => {
  it('removes access_token from params', () => {
    const params = { access_token: 'secret', fields: 'id,name', limit: '10' };
    const sanitized = sanitizeParams(params);
    expect(sanitized).not.toHaveProperty('access_token');
    expect(sanitized.fields).toBe('id,name');
    expect(sanitized.limit).toBe('10');
  });

  it('returns same object shape if no access_token present', () => {
    const params = { fields: 'id', limit: '5' };
    const sanitized = sanitizeParams(params);
    expect(sanitized).toEqual({ fields: 'id', limit: '5' });
  });

  it('does not mutate the original object', () => {
    const params = { access_token: 'secret', fields: 'id' };
    sanitizeParams(params);
    expect(params.access_token).toBe('secret');
  });

  it('handles empty params', () => {
    expect(sanitizeParams({})).toEqual({});
  });
});

describe('logApiCall', () => {
  it('appends a JSONL line to the log file', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.appendFileSync.mockImplementation(() => {});

    const entry = makeLogEntry();
    logApiCall(entry);

    expect(mockFs.appendFileSync).toHaveBeenCalledTimes(1);
    const [, content] = (mockFs.appendFileSync as jest.Mock).mock.calls[0];
    expect(content).toContain('"method":"GET"');
    expect(content).toContain('"endpoint":"act_123/campaigns"');
    expect(content.endsWith('\n')).toBe(true);
    // Validate it's valid JSON (minus the newline)
    expect(() => JSON.parse(content.trim())).not.toThrow();
  });

  it('ensures the log directory exists', () => {
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined as any);
    mockFs.appendFileSync.mockImplementation(() => {});

    logApiCall(makeLogEntry());

    expect(mockFs.mkdirSync).toHaveBeenCalled();
  });

  it('does not throw even if fs operations fail', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.appendFileSync.mockImplementation(() => {
      throw new Error('disk full');
    });

    // Should not throw — logging failures are swallowed
    expect(() => logApiCall(makeLogEntry())).not.toThrow();
  });
});

describe('getLogFiles', () => {
  it('lists .jsonl log files sorted newest first', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([
      '2024-06-15.jsonl',
      '2024-07-01.jsonl',
      '2024-06-20.jsonl',
    ] as any);

    const files = getLogFiles();
    expect(files).toEqual([
      '2024-07-01.jsonl',
      '2024-06-20.jsonl',
      '2024-06-15.jsonl',
    ]);
  });

  it('filters out non-jsonl files', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([
      '2024-07-01.jsonl',
      '.DS_Store',
      'readme.txt',
    ] as any);

    const files = getLogFiles();
    expect(files).toEqual(['2024-07-01.jsonl']);
  });

  it('returns empty array when log dir does not exist', () => {
    // First call: initLogger check (false -> mkdir), second call: getLogFiles check (false)
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined as any);

    const files = getLogFiles();
    expect(files).toEqual([]);
  });
});

describe('clearLogs', () => {
  beforeEach(() => {
    // Setup: getLogFiles mock returns some files
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([
      '2024-06-15.jsonl',
      '2024-06-20.jsonl',
      '2024-07-01.jsonl',
    ] as any);
    mockFs.unlinkSync.mockImplementation(() => {});
  });

  it('deletes all files when all option is true', () => {
    const deleted = clearLogs({ all: true });
    expect(deleted).toBe(3);
    expect(mockFs.unlinkSync).toHaveBeenCalledTimes(3);
  });

  it('deletes files before a specific date', () => {
    const deleted = clearLogs({ before: '2024-06-25' });
    // Files before 2024-06-25: 2024-06-15 and 2024-06-20
    expect(deleted).toBe(2);
    expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2);
  });

  it('deletes no files if none match criteria', () => {
    const deleted = clearLogs({ before: '2024-01-01' });
    expect(deleted).toBe(0);
    expect(mockFs.unlinkSync).not.toHaveBeenCalled();
  });

  it('returns 0 when no options match', () => {
    const deleted = clearLogs({});
    expect(deleted).toBe(0);
  });
});

describe('initLogger', () => {
  it('creates log directory if it does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    mockFs.mkdirSync.mockImplementation(() => undefined as any);

    initLogger();

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('logs'),
      { recursive: true }
    );
  });

  it('does not create directory if it already exists', () => {
    mockFs.existsSync.mockReturnValue(true);

    initLogger();

    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });
});
