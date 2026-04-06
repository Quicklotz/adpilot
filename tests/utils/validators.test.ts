import {
  validateStatus,
  validateObjective,
  validateBillingEvent,
  validateOptimizationGoal,
  validateBudget,
  validateDateRange,
  validateJson,
} from '../../src/utils/validators';
import { ValidationError } from '../../src/utils/errors';

describe('validateStatus', () => {
  it('accepts valid statuses', () => {
    expect(() => validateStatus('ACTIVE')).not.toThrow();
    expect(() => validateStatus('PAUSED')).not.toThrow();
    expect(() => validateStatus('ARCHIVED')).not.toThrow();
    expect(() => validateStatus('DELETED')).not.toThrow();
  });

  it('accepts lowercase statuses', () => {
    expect(() => validateStatus('active')).not.toThrow();
    expect(() => validateStatus('paused')).not.toThrow();
  });

  it('throws ValidationError for invalid statuses', () => {
    expect(() => validateStatus('RUNNING')).toThrow(ValidationError);
    expect(() => validateStatus('STOPPED')).toThrow(ValidationError);
    expect(() => validateStatus('')).toThrow(ValidationError);
  });
});

describe('validateObjective', () => {
  it('accepts valid objectives', () => {
    expect(() => validateObjective('OUTCOME_AWARENESS')).not.toThrow();
    expect(() => validateObjective('OUTCOME_TRAFFIC')).not.toThrow();
    expect(() => validateObjective('OUTCOME_LEADS')).not.toThrow();
    expect(() => validateObjective('OUTCOME_SALES')).not.toThrow();
    expect(() => validateObjective('OUTCOME_ENGAGEMENT')).not.toThrow();
    expect(() => validateObjective('OUTCOME_APP_PROMOTION')).not.toThrow();
  });

  it('accepts lowercase objectives', () => {
    expect(() => validateObjective('outcome_traffic')).not.toThrow();
  });

  it('throws ValidationError for invalid objectives', () => {
    expect(() => validateObjective('CONVERSIONS')).toThrow(ValidationError);
    expect(() => validateObjective('INVALID')).toThrow(ValidationError);
  });
});

describe('validateBillingEvent', () => {
  it('accepts valid billing events', () => {
    expect(() => validateBillingEvent('IMPRESSIONS')).not.toThrow();
    expect(() => validateBillingEvent('LINK_CLICKS')).not.toThrow();
    expect(() => validateBillingEvent('APP_INSTALLS')).not.toThrow();
    expect(() => validateBillingEvent('THRUPLAY')).not.toThrow();
  });

  it('accepts lowercase billing events', () => {
    expect(() => validateBillingEvent('impressions')).not.toThrow();
  });

  it('throws ValidationError for invalid billing events', () => {
    expect(() => validateBillingEvent('CLICKS')).toThrow(ValidationError);
    expect(() => validateBillingEvent('VIEWS')).toThrow(ValidationError);
  });
});

describe('validateOptimizationGoal', () => {
  it('accepts valid optimization goals', () => {
    expect(() => validateOptimizationGoal('REACH')).not.toThrow();
    expect(() => validateOptimizationGoal('LINK_CLICKS')).not.toThrow();
    expect(() => validateOptimizationGoal('LANDING_PAGE_VIEWS')).not.toThrow();
    expect(() => validateOptimizationGoal('OFFSITE_CONVERSIONS')).not.toThrow();
    expect(() => validateOptimizationGoal('NONE')).not.toThrow();
  });

  it('accepts lowercase optimization goals', () => {
    expect(() => validateOptimizationGoal('reach')).not.toThrow();
  });

  it('throws ValidationError for invalid optimization goals', () => {
    expect(() => validateOptimizationGoal('CLICKS')).toThrow(ValidationError);
    expect(() => validateOptimizationGoal('INVALID_GOAL')).toThrow(ValidationError);
  });
});

describe('validateBudget', () => {
  it('accepts positive integers', () => {
    expect(() => validateBudget(100)).not.toThrow();
    expect(() => validateBudget(1)).not.toThrow();
    expect(() => validateBudget(999999)).not.toThrow();
  });

  it('accepts string positive integers', () => {
    expect(() => validateBudget('500')).not.toThrow();
    expect(() => validateBudget('1')).not.toThrow();
  });

  it('throws ValidationError for zero', () => {
    expect(() => validateBudget(0)).toThrow(ValidationError);
  });

  it('throws ValidationError for negative values', () => {
    expect(() => validateBudget(-100)).toThrow(ValidationError);
    expect(() => validateBudget('-50')).toThrow(ValidationError);
  });

  it('throws ValidationError for non-integer values', () => {
    expect(() => validateBudget(10.5)).toThrow(ValidationError);
    expect(() => validateBudget('abc')).toThrow(ValidationError);
  });
});

describe('validateDateRange', () => {
  it('accepts valid date ranges', () => {
    expect(() => validateDateRange('2024-01-01', '2024-01-31')).not.toThrow();
    expect(() => validateDateRange('2024-06-01', '2024-12-31')).not.toThrow();
  });

  it('throws ValidationError for invalid since format', () => {
    expect(() => validateDateRange('01-01-2024', '2024-01-31')).toThrow(ValidationError);
    expect(() => validateDateRange('2024/01/01', '2024-01-31')).toThrow(ValidationError);
  });

  it('throws ValidationError for invalid until format', () => {
    expect(() => validateDateRange('2024-01-01', '01-31-2024')).toThrow(ValidationError);
  });

  it('throws ValidationError when since >= until', () => {
    expect(() => validateDateRange('2024-01-31', '2024-01-01')).toThrow(ValidationError);
    expect(() => validateDateRange('2024-01-15', '2024-01-15')).toThrow(ValidationError);
  });
});

describe('validateJson', () => {
  it('accepts valid JSON strings', () => {
    expect(() => validateJson('{"key": "value"}')).not.toThrow();
    expect(() => validateJson('[1, 2, 3]')).not.toThrow();
    expect(() => validateJson('"hello"')).not.toThrow();
    expect(() => validateJson('null')).not.toThrow();
    expect(() => validateJson('42')).not.toThrow();
  });

  it('throws ValidationError for invalid JSON', () => {
    expect(() => validateJson('{')).toThrow(ValidationError);
    expect(() => validateJson('not json')).toThrow(ValidationError);
    expect(() => validateJson('{key: value}')).toThrow(ValidationError);
    expect(() => validateJson("{'single': 'quotes'}")).toThrow(ValidationError);
  });
});
