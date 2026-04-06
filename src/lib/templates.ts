import * as fs from 'fs';
import * as path from 'path';

// ── Interfaces ──────────────────────────────────────────────────────────────

export interface TemplateVariable {
  type: 'string' | 'number';
  default?: string | number;
  description?: string;
}

export interface AdPilotTemplate {
  name: string;
  description?: string;
  variables?: Record<string, TemplateVariable>;
  campaign: {
    name: string;
    objective: string;
    special_ad_categories?: string[];
    status?: string;
    daily_budget?: number | string;
    lifetime_budget?: number | string;
    bid_strategy?: string;
  };
  adsets: Array<{
    name: string;
    billing_event: string;
    optimization_goal: string;
    daily_budget?: number | string;
    lifetime_budget?: number | string;
    bid_amount?: number | string;
    targeting: Record<string, any>;
    status?: string;
  }>;
  ads: Array<{
    name: string;
    adset_index: number;
    creative: {
      name: string;
      object_story_spec?: Record<string, any>;
      title?: string;
      body?: string;
      link_url?: string;
      image_hash?: string;
      image_url?: string;
      call_to_action_type?: string;
    };
    status?: string;
  }>;
}

// ── Load ────────────────────────────────────────────────────────────────────

export function loadTemplate(filePath: string): AdPilotTemplate {
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Template file not found: ${resolved}`);
  }

  const raw = fs.readFileSync(resolved, 'utf-8');

  try {
    return JSON.parse(raw) as AdPilotTemplate;
  } catch (err: any) {
    throw new Error(`Failed to parse template file (${path.basename(resolved)}): ${err.message}`);
  }
}

// ── Variable Resolution ─────────────────────────────────────────────────────

/**
 * Recursively walk any JSON-like value and replace `{{varName}}` tokens in
 * every string leaf with the corresponding value from `vars`.
 */
function replaceInValue(value: any, vars: Record<string, string>): any {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
      if (varName in vars) {
        return vars[varName];
      }
      // Leave unresolved placeholders intact so validation can catch them
      return `{{${varName}}}`;
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => replaceInValue(item, vars));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = replaceInValue(v, vars);
    }
    return result;
  }
  return value;
}

/**
 * Resolve `{{varName}}` placeholders throughout the entire template.
 *
 * Variables are sourced from `vars` (explicit overrides) and then from the
 * template's own `variables[name].default` as a fallback.
 */
export function resolveVariables(
  template: AdPilotTemplate,
  vars: Record<string, string>
): AdPilotTemplate {
  // Build the full variable map: defaults first, then explicit overrides
  const merged: Record<string, string> = {};

  if (template.variables) {
    for (const [name, def] of Object.entries(template.variables)) {
      if (def.default !== undefined) {
        merged[name] = String(def.default);
      }
    }
  }

  // Explicit vars always win
  for (const [k, v] of Object.entries(vars)) {
    merged[k] = v;
  }

  // Deep-clone + replace
  const raw = JSON.parse(JSON.stringify(template));
  const resolved: AdPilotTemplate = {
    ...raw,
    campaign: replaceInValue(raw.campaign, merged),
    adsets: replaceInValue(raw.adsets, merged),
    ads: replaceInValue(raw.ads, merged),
  };

  return resolved;
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Collect all unresolved `{{varName}}` placeholders found in any string leaf.
 */
function findUnresolved(value: any): string[] {
  const found: string[] = [];
  if (typeof value === 'string') {
    const matches = value.match(/\{\{(\w+)\}\}/g);
    if (matches) {
      found.push(...matches.map((m) => m.replace(/[{}]/g, '')));
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      found.push(...findUnresolved(item));
    }
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value)) {
      found.push(...findUnresolved(v));
    }
  }
  return found;
}

/**
 * Validate a *resolved* template and return an array of error messages.
 * An empty array means the template is valid.
 */
export function validateTemplate(template: AdPilotTemplate): string[] {
  const errors: string[] = [];

  // ── Top-level ─────────────────────────────────────────────────────────
  if (!template.name || typeof template.name !== 'string') {
    errors.push('Template must have a "name" string.');
  }

  // ── Campaign ──────────────────────────────────────────────────────────
  if (!template.campaign) {
    errors.push('Template must have a "campaign" object.');
  } else {
    if (!template.campaign.name) {
      errors.push('campaign.name is required.');
    }
    if (!template.campaign.objective) {
      errors.push('campaign.objective is required.');
    }
  }

  // ── Ad Sets ───────────────────────────────────────────────────────────
  if (!template.adsets || !Array.isArray(template.adsets) || template.adsets.length === 0) {
    errors.push('Template must have at least one ad set in "adsets".');
  } else {
    template.adsets.forEach((adset, i) => {
      if (!adset.name) {
        errors.push(`adsets[${i}].name is required.`);
      }
      if (!adset.billing_event) {
        errors.push(`adsets[${i}].billing_event is required.`);
      }
      if (!adset.optimization_goal) {
        errors.push(`adsets[${i}].optimization_goal is required.`);
      }
      if (!adset.targeting || typeof adset.targeting !== 'object') {
        errors.push(`adsets[${i}].targeting is required and must be an object.`);
      }
    });
  }

  // ── Ads ───────────────────────────────────────────────────────────────
  if (!template.ads || !Array.isArray(template.ads) || template.ads.length === 0) {
    errors.push('Template must have at least one ad in "ads".');
  } else {
    template.ads.forEach((ad, i) => {
      if (!ad.name) {
        errors.push(`ads[${i}].name is required.`);
      }
      if (ad.adset_index === undefined || ad.adset_index === null) {
        errors.push(`ads[${i}].adset_index is required.`);
      } else if (
        typeof ad.adset_index !== 'number' ||
        ad.adset_index < 0 ||
        (template.adsets && ad.adset_index >= template.adsets.length)
      ) {
        errors.push(
          `ads[${i}].adset_index (${ad.adset_index}) is out of range. Must be 0-${
            (template.adsets?.length ?? 1) - 1
          }.`
        );
      }
      if (!ad.creative) {
        errors.push(`ads[${i}].creative is required.`);
      } else if (!ad.creative.name) {
        errors.push(`ads[${i}].creative.name is required.`);
      }
    });
  }

  // ── Unresolved placeholders ───────────────────────────────────────────
  const unresolved = new Set<string>([
    ...findUnresolved(template.campaign),
    ...findUnresolved(template.adsets),
    ...findUnresolved(template.ads),
  ]);

  if (unresolved.size > 0) {
    errors.push(
      `Unresolved template variables: ${[...unresolved]
        .map((v) => `{{${v}}}`)
        .join(', ')}. Provide them with --var.`
    );
  }

  return errors;
}
