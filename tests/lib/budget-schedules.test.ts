/**
 * Tests for the budget-schedules module.
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
  listBudgetSchedules,
  getBudgetSchedule,
  saveBudgetSchedule,
  updateBudgetSchedule,
  deleteBudgetSchedule,
  BudgetSchedule,
} from '../../src/lib/budget-schedules';

beforeEach(() => {
  Object.keys(mockStore).forEach((k) => delete mockStore[k]);
  mockStore.schedules = [];
});

function makeSchedule(overrides: Partial<BudgetSchedule> = {}): BudgetSchedule {
  return {
    id: 'sched-001',
    campaignId: 'campaign_123',
    newBudget: 5000,
    originalBudget: 3000,
    startDate: '2024-07-01',
    endDate: '2024-07-31',
    status: 'pending',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('saveBudgetSchedule (createSchedule)', () => {
  it('creates a schedule with generated ID, pending status, and timestamps', () => {
    const schedule = makeSchedule();
    saveBudgetSchedule(schedule);

    expect(mockStore.schedules).toHaveLength(1);
    expect(mockStore.schedules[0].id).toBe('sched-001');
    expect(mockStore.schedules[0].status).toBe('pending');
    expect(mockStore.schedules[0].createdAt).toBeDefined();
  });

  it('stores all fields correctly', () => {
    const schedule = makeSchedule({
      id: 'sched-full',
      campaignId: 'campaign_456',
      newBudget: 10000,
      originalBudget: 7500,
      startDate: '2024-08-01',
      endDate: '2024-08-15',
    });
    saveBudgetSchedule(schedule);

    const stored = mockStore.schedules[0];
    expect(stored.campaignId).toBe('campaign_456');
    expect(stored.newBudget).toBe(10000);
    expect(stored.originalBudget).toBe(7500);
    expect(stored.startDate).toBe('2024-08-01');
    expect(stored.endDate).toBe('2024-08-15');
  });

  it('can create multiple schedules', () => {
    saveBudgetSchedule(makeSchedule({ id: 'sched-a' }));
    saveBudgetSchedule(makeSchedule({ id: 'sched-b' }));
    saveBudgetSchedule(makeSchedule({ id: 'sched-c' }));

    expect(mockStore.schedules).toHaveLength(3);
  });
});

describe('listBudgetSchedules', () => {
  it('returns all schedules', () => {
    saveBudgetSchedule(makeSchedule({ id: 'sched-1' }));
    saveBudgetSchedule(makeSchedule({ id: 'sched-2' }));

    const all = listBudgetSchedules();
    expect(all).toHaveLength(2);
    expect(all[0].id).toBe('sched-1');
    expect(all[1].id).toBe('sched-2');
  });

  it('returns empty array when no schedules exist', () => {
    expect(listBudgetSchedules()).toEqual([]);
  });
});

describe('getBudgetSchedule', () => {
  it('returns a schedule by ID', () => {
    saveBudgetSchedule(makeSchedule({ id: 'sched-find' }));
    saveBudgetSchedule(makeSchedule({ id: 'sched-other' }));

    const found = getBudgetSchedule('sched-find');
    expect(found).toBeDefined();
    expect(found!.id).toBe('sched-find');
  });

  it('returns undefined for a missing schedule', () => {
    expect(getBudgetSchedule('nonexistent')).toBeUndefined();
  });
});

describe('updateBudgetSchedule (updateScheduleStatus)', () => {
  it('updates the status field', () => {
    saveBudgetSchedule(makeSchedule({ id: 'sched-update', status: 'pending' }));
    const updated = updateBudgetSchedule('sched-update', { status: 'applied' });

    expect(updated).toBeDefined();
    expect(updated!.status).toBe('applied');
  });

  it('applies partial updates without overwriting other fields', () => {
    saveBudgetSchedule(makeSchedule({ id: 'sched-partial', newBudget: 5000, status: 'pending' }));
    const updated = updateBudgetSchedule('sched-partial', { status: 'reverted' });

    expect(updated!.newBudget).toBe(5000);
    expect(updated!.status).toBe('reverted');
  });

  it('returns undefined for a missing schedule', () => {
    const result = updateBudgetSchedule('nonexistent', { status: 'applied' });
    expect(result).toBeUndefined();
  });

  it('persists the update in the store', () => {
    saveBudgetSchedule(makeSchedule({ id: 'sched-persist' }));
    updateBudgetSchedule('sched-persist', { status: 'expired' });

    const stored = mockStore.schedules.find((s: BudgetSchedule) => s.id === 'sched-persist');
    expect(stored.status).toBe('expired');
  });
});

describe('deleteBudgetSchedule', () => {
  it('removes a schedule and returns true', () => {
    saveBudgetSchedule(makeSchedule({ id: 'sched-delete' }));
    const result = deleteBudgetSchedule('sched-delete');

    expect(result).toBe(true);
    expect(mockStore.schedules).toHaveLength(0);
  });

  it('returns false for a missing schedule', () => {
    const result = deleteBudgetSchedule('nonexistent');
    expect(result).toBe(false);
  });

  it('only removes the targeted schedule', () => {
    saveBudgetSchedule(makeSchedule({ id: 'keep-me' }));
    saveBudgetSchedule(makeSchedule({ id: 'delete-me' }));

    deleteBudgetSchedule('delete-me');
    expect(mockStore.schedules).toHaveLength(1);
    expect(mockStore.schedules[0].id).toBe('keep-me');
  });
});
