import { statusColor, writeCsv } from '../../src/utils/output';
import fs from 'fs';

// Mock fs.writeFileSync so we can inspect CSV output without touching disk
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
}));

// statusColor uses chalk, which in a test environment may or may not apply
// ANSI codes. We test that the function returns a string and handles each status.
describe('statusColor', () => {
  it('returns a string for ACTIVE status', () => {
    const result = statusColor('ACTIVE');
    expect(typeof result).toBe('string');
    expect(result).toContain('ACTIVE');
  });

  it('returns a string for PAUSED status', () => {
    const result = statusColor('PAUSED');
    expect(typeof result).toBe('string');
    expect(result).toContain('PAUSED');
  });

  it('returns a string for ARCHIVED status', () => {
    const result = statusColor('ARCHIVED');
    expect(typeof result).toBe('string');
    expect(result).toContain('ARCHIVED');
  });

  it('returns a string for DELETED status', () => {
    const result = statusColor('DELETED');
    expect(typeof result).toBe('string');
    expect(result).toContain('DELETED');
  });

  it('returns a string for WITH_ISSUES status', () => {
    const result = statusColor('WITH_ISSUES');
    expect(typeof result).toBe('string');
    expect(result).toContain('WITH_ISSUES');
  });

  it('returns a string for IN_PROCESS status', () => {
    const result = statusColor('IN_PROCESS');
    expect(typeof result).toBe('string');
    expect(result).toContain('IN_PROCESS');
  });

  it('returns a string for PENDING_REVIEW status', () => {
    const result = statusColor('PENDING_REVIEW');
    expect(typeof result).toBe('string');
    expect(result).toContain('PENDING_REVIEW');
  });

  it('returns "-" for undefined/null status', () => {
    expect(statusColor(undefined as any)).toBe('-');
    expect(statusColor(null as any)).toBe('-');
  });

  it('returns the raw string for unknown statuses', () => {
    expect(statusColor('CUSTOM_STATUS')).toBe('CUSTOM_STATUS');
  });
});

describe('writeCsv', () => {
  const mockWriteFileSync = fs.writeFileSync as jest.Mock;

  beforeEach(() => {
    mockWriteFileSync.mockClear();
  });

  it('creates proper CSV content with headers and rows', () => {
    writeCsv('/tmp/test.csv', ['id', 'name', 'status'], [
      ['1', 'Campaign A', 'ACTIVE'],
      ['2', 'Campaign B', 'PAUSED'],
    ]);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [filePath, content] = mockWriteFileSync.mock.calls[0];
    expect(filePath).toBe('/tmp/test.csv');

    const lines = content.split('\n');
    expect(lines[0]).toBe('id,name,status');
    expect(lines[1]).toBe('1,Campaign A,ACTIVE');
    expect(lines[2]).toBe('2,Campaign B,PAUSED');
  });

  it('escapes values containing commas', () => {
    writeCsv('/tmp/test.csv', ['name'], [['Hello, World']]);

    const content = mockWriteFileSync.mock.calls[0][1];
    expect(content).toContain('"Hello, World"');
  });

  it('escapes values containing double quotes', () => {
    writeCsv('/tmp/test.csv', ['name'], [['Say "hello"']]);

    const content = mockWriteFileSync.mock.calls[0][1];
    expect(content).toContain('"Say ""hello"""');
  });

  it('handles undefined/null cell values as empty strings', () => {
    writeCsv('/tmp/test.csv', ['id', 'name'], [
      ['1', undefined],
      ['2', null],
    ]);

    const content = mockWriteFileSync.mock.calls[0][1] as string;
    const lines = content.split('\n');
    expect(lines[1]).toBe('1,');
    expect(lines[2]).toBe('2,');
  });

  it('handles empty rows', () => {
    writeCsv('/tmp/test.csv', ['id'], []);

    const content = mockWriteFileSync.mock.calls[0][1] as string;
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id');
  });
});
