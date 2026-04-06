import Conf from 'conf';
import path from 'path';
import os from 'os';

export interface BudgetSchedule {
  id: string;
  campaignId: string;
  newBudget: number;
  originalBudget?: number;
  startDate: string;
  endDate?: string;
  status: 'pending' | 'applied' | 'reverted' | 'expired';
  createdAt: string;
}

interface BudgetScheduleStore {
  schedules: BudgetSchedule[];
}

const configDir = path.join(os.homedir(), '.adpilot');

const store = new Conf<BudgetScheduleStore>({
  projectName: 'adpilot-budget-schedules',
  cwd: configDir,
  configName: 'budget-schedules',
  defaults: {
    schedules: [],
  },
});

/**
 * List all budget schedules.
 */
export function listBudgetSchedules(): BudgetSchedule[] {
  return store.get('schedules') || [];
}

/**
 * Get a budget schedule by ID.
 */
export function getBudgetSchedule(id: string): BudgetSchedule | undefined {
  return listBudgetSchedules().find((s) => s.id === id);
}

/**
 * Save a new budget schedule.
 */
export function saveBudgetSchedule(schedule: BudgetSchedule): void {
  const schedules = listBudgetSchedules();
  schedules.push(schedule);
  store.set('schedules', schedules);
}

/**
 * Update a budget schedule by ID.
 */
export function updateBudgetSchedule(id: string, updates: Partial<BudgetSchedule>): BudgetSchedule | undefined {
  const schedules = listBudgetSchedules();
  const idx = schedules.findIndex((s) => s.id === id);
  if (idx === -1) return undefined;

  schedules[idx] = { ...schedules[idx], ...updates };
  store.set('schedules', schedules);
  return schedules[idx];
}

/**
 * Delete a budget schedule by ID. Returns true if found and deleted.
 */
export function deleteBudgetSchedule(id: string): boolean {
  const schedules = listBudgetSchedules();
  const filtered = schedules.filter((s) => s.id !== id);
  if (filtered.length === schedules.length) return false;
  store.set('schedules', filtered);
  return true;
}
