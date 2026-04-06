/**
 * Tests for the saved reports module.
 *
 * We mock the Conf store so no filesystem access occurs.
 */

const mockStore: Record<string, any> = {};
jest.mock('conf', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string, defaultValue?: any) => mockStore[key] ?? defaultValue),
    set: jest.fn((key: string, value: any) => { mockStore[key] = value; }),
    delete: jest.fn((key: string) => { delete mockStore[key]; }),
    store: mockStore,
  }));
});

import {
  saveReport,
  getSavedReport,
  listSavedReports,
  deleteReport,
  SavedReport,
} from '../../src/lib/reports';

beforeEach(() => {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  mockStore.reports = [];
});

function makeReport(overrides: Partial<SavedReport> = {}): SavedReport {
  return {
    name: 'Weekly Performance',
    description: 'Weekly campaign performance report',
    level: 'campaign',
    objectId: 'act_123',
    fields: 'impressions,clicks,spend',
    datePreset: 'last_7d',
    breakdowns: 'age,gender',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('saveReport', () => {
  it('stores a report by name', () => {
    const report = makeReport({ name: 'Daily Spend' });
    saveReport(report);

    expect(mockStore.reports).toHaveLength(1);
    expect(mockStore.reports[0].name).toBe('Daily Spend');
  });

  it('stores all fields correctly', () => {
    const report = makeReport({
      name: 'Full Report',
      description: 'All fields',
      level: 'adset',
      objectId: 'act_456',
      fields: 'impressions,reach,cpm',
      datePreset: 'last_30d',
      breakdowns: 'country',
    });
    saveReport(report);

    const stored = mockStore.reports[0];
    expect(stored.level).toBe('adset');
    expect(stored.objectId).toBe('act_456');
    expect(stored.fields).toBe('impressions,reach,cpm');
    expect(stored.datePreset).toBe('last_30d');
    expect(stored.breakdowns).toBe('country');
    expect(stored.description).toBe('All fields');
  });

  it('overwrites an existing report with the same name', () => {
    saveReport(makeReport({ name: 'Overwrite Me', fields: 'impressions' }));
    saveReport(makeReport({ name: 'Overwrite Me', fields: 'impressions,clicks,spend' }));

    expect(mockStore.reports).toHaveLength(1);
    expect(mockStore.reports[0].fields).toBe('impressions,clicks,spend');
  });

  it('can store multiple reports with different names', () => {
    saveReport(makeReport({ name: 'Report A' }));
    saveReport(makeReport({ name: 'Report B' }));
    saveReport(makeReport({ name: 'Report C' }));

    expect(mockStore.reports).toHaveLength(3);
  });
});

describe('getSavedReport', () => {
  it('retrieves a report by name', () => {
    saveReport(makeReport({ name: 'Findable Report' }));
    const found = getSavedReport('Findable Report');

    expect(found).toBeDefined();
    expect(found!.name).toBe('Findable Report');
  });

  it('returns undefined for a missing report', () => {
    expect(getSavedReport('Nonexistent')).toBeUndefined();
  });

  it('returns the correct report when multiple exist', () => {
    saveReport(makeReport({ name: 'Report One', level: 'campaign' }));
    saveReport(makeReport({ name: 'Report Two', level: 'ad' }));

    const found = getSavedReport('Report Two');
    expect(found).toBeDefined();
    expect(found!.level).toBe('ad');
  });
});

describe('listSavedReports', () => {
  it('returns all saved reports', () => {
    saveReport(makeReport({ name: 'Report X' }));
    saveReport(makeReport({ name: 'Report Y' }));

    const all = listSavedReports();
    expect(all).toHaveLength(2);
    const names = all.map((r) => r.name);
    expect(names).toContain('Report X');
    expect(names).toContain('Report Y');
  });

  it('returns empty array when no reports exist', () => {
    expect(listSavedReports()).toEqual([]);
  });
});

describe('deleteReport', () => {
  it('removes a report by name and returns true', () => {
    saveReport(makeReport({ name: 'Delete Me' }));
    const result = deleteReport('Delete Me');

    expect(result).toBe(true);
    expect(mockStore.reports).toHaveLength(0);
  });

  it('returns false for a missing report', () => {
    const result = deleteReport('Nonexistent');
    expect(result).toBe(false);
  });

  it('only removes the targeted report', () => {
    saveReport(makeReport({ name: 'Keep Me' }));
    saveReport(makeReport({ name: 'Remove Me' }));

    deleteReport('Remove Me');
    expect(mockStore.reports).toHaveLength(1);
    expect(mockStore.reports[0].name).toBe('Keep Me');
  });

  it('returns false on second delete of same report', () => {
    saveReport(makeReport({ name: 'Once Only' }));
    expect(deleteReport('Once Only')).toBe(true);
    expect(deleteReport('Once Only')).toBe(false);
  });
});
