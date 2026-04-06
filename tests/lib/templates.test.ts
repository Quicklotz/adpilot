import * as path from 'path';
import { loadTemplate, resolveVariables, validateTemplate, AdPilotTemplate } from '../../src/lib/templates';

const FIXTURE_PATH = path.join(__dirname, '..', 'fixtures', 'test-template.json');

describe('loadTemplate', () => {
  it('loads a valid template from disk', () => {
    const tpl = loadTemplate(FIXTURE_PATH);
    expect(tpl.name).toBe('Test Template');
    expect(tpl.campaign.objective).toBe('OUTCOME_TRAFFIC');
    expect(tpl.adsets).toHaveLength(1);
    expect(tpl.ads).toHaveLength(1);
  });

  it('throws for non-existent file', () => {
    expect(() => loadTemplate('/tmp/does-not-exist.json')).toThrow('not found');
  });
});

describe('resolveVariables', () => {
  let template: AdPilotTemplate;

  beforeEach(() => {
    template = loadTemplate(FIXTURE_PATH);
  });

  it('replaces {{var}} placeholders with provided values', () => {
    const resolved = resolveVariables(template, { product: 'Widget', budget: '2000' });
    expect(resolved.campaign.name).toBe('Widget Campaign');
    expect(resolved.adsets[0].name).toBe('Widget Ad Set');
    expect(resolved.adsets[0].daily_budget).toBe('2000');
    expect(resolved.ads[0].name).toBe('Widget Ad');
    expect(resolved.ads[0].creative.title).toBe('Buy Widget');
  });

  it('uses defaults from template variables when not provided', () => {
    const resolved = resolveVariables(template, {});
    expect(resolved.campaign.name).toBe('TestProduct Campaign');
    expect(resolved.adsets[0].daily_budget).toBe('1000');
  });

  it('overrides defaults with explicit vars', () => {
    const resolved = resolveVariables(template, { product: 'Custom' });
    expect(resolved.campaign.name).toBe('Custom Campaign');
    // budget should still use default
    expect(resolved.adsets[0].daily_budget).toBe('1000');
  });

  it('handles nested objects (targeting)', () => {
    const resolved = resolveVariables(template, {});
    expect(resolved.adsets[0].targeting).toEqual({
      geo_locations: { countries: ['US'] },
    });
  });

  it('leaves unresolved placeholders intact', () => {
    // Create a template with an unknown variable
    const tpl: AdPilotTemplate = {
      ...template,
      campaign: { ...template.campaign, name: '{{unknown}} Campaign' },
    };
    const resolved = resolveVariables(tpl, {});
    expect(resolved.campaign.name).toBe('{{unknown}} Campaign');
  });
});

describe('validateTemplate', () => {
  let template: AdPilotTemplate;

  beforeEach(() => {
    template = loadTemplate(FIXTURE_PATH);
    // Resolve with defaults so there are no unresolved placeholders
    template = resolveVariables(template, {});
  });

  it('returns no errors for a valid resolved template', () => {
    const errors = validateTemplate(template);
    expect(errors).toEqual([]);
  });

  it('catches missing campaign name', () => {
    template.campaign.name = '';
    const errors = validateTemplate(template);
    expect(errors).toContain('campaign.name is required.');
  });

  it('catches missing objective', () => {
    template.campaign.objective = '';
    const errors = validateTemplate(template);
    expect(errors).toContain('campaign.objective is required.');
  });

  it('catches invalid adset_index (out of range)', () => {
    template.ads[0].adset_index = 5;
    const errors = validateTemplate(template);
    expect(errors.some((e) => e.includes('adset_index'))).toBe(true);
  });

  it('catches unresolved placeholders', () => {
    template.campaign.name = '{{unresolved}} Campaign';
    const errors = validateTemplate(template);
    expect(errors.some((e) => e.includes('Unresolved template variables'))).toBe(true);
    expect(errors.some((e) => e.includes('{{unresolved}}'))).toBe(true);
  });

  it('catches missing template name', () => {
    (template as any).name = '';
    const errors = validateTemplate(template);
    expect(errors).toContain('Template must have a "name" string.');
  });

  it('catches missing adsets', () => {
    (template as any).adsets = [];
    const errors = validateTemplate(template);
    expect(errors).toContain('Template must have at least one ad set in "adsets".');
  });

  it('catches missing ads', () => {
    (template as any).ads = [];
    const errors = validateTemplate(template);
    expect(errors).toContain('Template must have at least one ad in "ads".');
  });
});
