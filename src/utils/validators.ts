import { ValidationError } from './errors';
import {
  CAMPAIGN_OBJECTIVES,
  BILLING_EVENTS,
  OPTIMIZATION_GOALS,
} from './helpers';

const VALID_STATUSES = ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DELETED'] as const;

export function validateStatus(status: string): void {
  const upper = status.toUpperCase();
  if (!VALID_STATUSES.includes(upper as any)) {
    throw new ValidationError(
      `Invalid status "${status}". Must be one of: ${VALID_STATUSES.join(', ')}`
    );
  }
}

export function validateObjective(objective: string): void {
  const upper = objective.toUpperCase();
  if (!CAMPAIGN_OBJECTIVES.includes(upper as any)) {
    throw new ValidationError(
      `Invalid objective "${objective}". Must be one of: ${CAMPAIGN_OBJECTIVES.join(', ')}`
    );
  }
}

export function validateBillingEvent(event: string): void {
  const upper = event.toUpperCase();
  if (!BILLING_EVENTS.includes(upper as any)) {
    throw new ValidationError(
      `Invalid billing event "${event}". Must be one of: ${BILLING_EVENTS.join(', ')}`
    );
  }
}

export function validateOptimizationGoal(goal: string): void {
  const upper = goal.toUpperCase();
  if (!OPTIMIZATION_GOALS.includes(upper as any)) {
    throw new ValidationError(
      `Invalid optimization goal "${goal}". Must be one of: ${OPTIMIZATION_GOALS.join(', ')}`
    );
  }
}

export function validateBudget(amount: string | number): void {
  const num = typeof amount === 'string' ? parseInt(amount, 10) : amount;
  if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
    throw new ValidationError(
      `Invalid budget "${amount}". Must be a positive integer (in cents).`
    );
  }
}

export function validateDateRange(since: string, until: string): void {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(since)) {
    throw new ValidationError(
      `Invalid "since" date "${since}". Must be in YYYY-MM-DD format.`
    );
  }
  if (!dateRegex.test(until)) {
    throw new ValidationError(
      `Invalid "until" date "${until}". Must be in YYYY-MM-DD format.`
    );
  }
  const sinceDate = new Date(since);
  const untilDate = new Date(until);
  if (isNaN(sinceDate.getTime())) {
    throw new ValidationError(`Invalid "since" date "${since}". Not a valid date.`);
  }
  if (isNaN(untilDate.getTime())) {
    throw new ValidationError(`Invalid "until" date "${until}". Not a valid date.`);
  }
  if (sinceDate >= untilDate) {
    throw new ValidationError(
      `Invalid date range: "since" (${since}) must be before "until" (${until}).`
    );
  }
}

export function validateJson(str: string): void {
  try {
    JSON.parse(str);
  } catch {
    throw new ValidationError(
      `Invalid JSON string: ${str.length > 80 ? str.substring(0, 80) + '...' : str}`
    );
  }
}
