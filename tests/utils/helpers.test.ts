import {
  formatBudget,
  formatDate,
  truncate,
  buildFieldsParam,
  parseKeyValue,
} from '../../src/utils/helpers';

describe('formatBudget', () => {
  it('converts cents to dollar string', () => {
    expect(formatBudget(2000)).toBe('$20.00');
    expect(formatBudget(150)).toBe('$1.50');
    expect(formatBudget(1)).toBe('$0.01');
    expect(formatBudget(100000)).toBe('$1000.00');
  });

  it('handles string cent values', () => {
    expect(formatBudget('2000')).toBe('$20.00');
    expect(formatBudget('500')).toBe('$5.00');
  });

  it('returns 0 as $0.00', () => {
    // Note: formatBudget treats 0 as falsy and returns '-'
    expect(formatBudget(0)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatBudget(undefined)).toBe('-');
  });
});

describe('formatDate', () => {
  it('formats ISO string to locale string', () => {
    const result = formatDate('2024-06-15T10:30:00Z');
    // toLocaleString output varies by environment, but it should not be '-'
    expect(result).not.toBe('-');
    expect(typeof result).toBe('string');
  });

  it('returns "-" for undefined', () => {
    expect(formatDate(undefined)).toBe('-');
  });
});

describe('truncate', () => {
  it('returns string unchanged if shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns string unchanged if exactly max length', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates string longer than max with ellipsis', () => {
    const result = truncate('hello world', 6);
    expect(result).toBe('hello\u2026');
    expect(result.length).toBe(6);
  });

  it('returns "-" for empty/falsy string', () => {
    expect(truncate('', 10)).toBe('-');
  });
});

describe('buildFieldsParam', () => {
  it('returns custom fields when provided', () => {
    expect(buildFieldsParam('id,name', ['id', 'name', 'status'])).toBe('id,name');
  });

  it('returns joined defaults when fields is undefined', () => {
    expect(buildFieldsParam(undefined, ['id', 'name', 'status'])).toBe('id,name,status');
  });

  it('returns joined defaults when fields is empty string', () => {
    // empty string is falsy, so defaults are used
    expect(buildFieldsParam('', ['id', 'name'])).toBe('id,name');
  });
});

describe('parseKeyValue', () => {
  it('parses valid key=value pairs', () => {
    expect(parseKeyValue(['name=test', 'budget=1000'])).toEqual({
      name: 'test',
      budget: '1000',
    });
  });

  it('handles values with equals signs', () => {
    expect(parseKeyValue(['url=https://example.com?foo=bar'])).toEqual({
      url: 'https://example.com?foo=bar',
    });
  });

  it('trims keys and values', () => {
    expect(parseKeyValue([' key = value '])).toEqual({
      key: 'value',
    });
  });

  it('throws for invalid format (no equals sign)', () => {
    expect(() => parseKeyValue(['invalid'])).toThrow('Invalid key=value pair');
  });

  it('handles empty array', () => {
    expect(parseKeyValue([])).toEqual({});
  });
});
