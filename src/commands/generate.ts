import { Command } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import { getAdAccountId } from '../lib/config';
import {
  AdPilotTemplate,
  loadTemplate,
  resolveVariables,
  validateTemplate,
} from '../lib/templates';
import { createSpinner, formatBudget } from '../utils/helpers';
import { success, error, warn, info, printJson } from '../utils/output';
import {
  executeDeploy,
  printDryRun,
  printDeployResult,
  printPartialResult,
  DeployResult,
} from './deploy';

// ── Types ───────────────────────────────────────────────────────────────────

interface AgeRange {
  min: number;
  max: number;
}

interface VariantOptions {
  name: string;
  url: string;
  headlines: string;
  bodies: string;
  ctas: string;
  countries: string;
  ageGroups: string;
  dailyBudget: string;
  objective: string;
  output?: string;
  deploy?: boolean;
  dryRun?: boolean;
  accountId?: string;
  json?: boolean;
}

interface FromTemplateOptions {
  template: string;
  matrix: string;
  output?: string;
  deployAll?: boolean;
  dryRun?: boolean;
  accountId?: string;
  json?: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseAgeGroups(raw: string): AgeRange[] {
  return raw.split(',').map((range) => {
    const trimmed = range.trim();
    const parts = trimmed.split('-');
    if (parts.length !== 2) {
      throw new Error(`Invalid age range: "${trimmed}". Expected format: "18-30"`);
    }
    const min = parseInt(parts[0], 10);
    const max = parseInt(parts[1], 10);
    if (isNaN(min) || isNaN(max) || min < 13 || max > 65 || min > max) {
      throw new Error(
        `Invalid age range: "${trimmed}". Min must be >= 13, max <= 65, and min <= max.`
      );
    }
    return { min, max };
  });
}

function parseCommaSeparated(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parsePipeSeparated(raw: string): string[] {
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Build an AdPilotTemplate from variant inputs.
 *
 * Creates:
 * - 1 campaign
 * - 1 ad set per age group x country combination
 * - 1 ad per headline x body x CTA combination, distributed across ad sets
 */
function buildVariantTemplate(opts: VariantOptions): AdPilotTemplate {
  const headlines = parseCommaSeparated(opts.headlines);
  const bodies = parsePipeSeparated(opts.bodies);
  const ctas = parseCommaSeparated(opts.ctas);
  const countries = parseCommaSeparated(opts.countries);
  const ageGroups = parseAgeGroups(opts.ageGroups);
  const dailyBudget = parseInt(opts.dailyBudget, 10);
  const productName = opts.name;
  const url = opts.url;

  if (headlines.length === 0) {
    throw new Error('At least one headline is required.');
  }
  if (bodies.length === 0) {
    throw new Error('At least one body text is required.');
  }

  // ── Ad Sets: 1 per age group x country ─────────────────────────────────
  const adsets: AdPilotTemplate['adsets'] = [];

  for (const country of countries) {
    for (const age of ageGroups) {
      adsets.push({
        name: `${productName} - ${country} / Age ${age.min}-${age.max}`,
        billing_event: 'IMPRESSIONS',
        optimization_goal: 'LINK_CLICKS',
        daily_budget: dailyBudget,
        targeting: {
          geo_locations: {
            countries: [country],
          },
          age_min: age.min,
          age_max: age.max,
        },
        status: 'PAUSED',
      });
    }
  }

  // ── Ads: 1 per headline x body x CTA, distributed round-robin across ad sets
  const ads: AdPilotTemplate['ads'] = [];
  let adIndex = 0;

  for (let hi = 0; hi < headlines.length; hi++) {
    for (let bi = 0; bi < bodies.length; bi++) {
      for (let ci = 0; ci < ctas.length; ci++) {
        const adsetIndex = adIndex % adsets.length;
        const adset = adsets[adsetIndex];

        // Extract country and age range from the adset for naming
        const country = countries[Math.floor(adsetIndex / ageGroups.length)];
        const age = ageGroups[adsetIndex % ageGroups.length];

        const adName = `${productName} - HL${hi + 1} / Body${bi + 1} / ${ctas[ci]} / ${country} / Age ${age.min}-${age.max}`;
        const creativeName = `Creative - ${adName}`;

        ads.push({
          name: adName,
          adset_index: adsetIndex,
          creative: {
            name: creativeName,
            title: headlines[hi],
            body: bodies[bi],
            link_url: url,
            call_to_action_type: ctas[ci],
          },
          status: 'PAUSED',
        });

        adIndex++;
      }
    }
  }

  return {
    name: `${productName} - Auto Variants`,
    description: `Auto-generated variant template for ${productName} with ${headlines.length} headlines, ${bodies.length} bodies, ${ctas.length} CTAs across ${countries.length} countries and ${ageGroups.length} age groups.`,
    campaign: {
      name: `${productName} - Variant Campaign`,
      objective: opts.objective,
      status: 'PAUSED',
      special_ad_categories: [],
    },
    adsets,
    ads,
  };
}

/**
 * Generate a cartesian product of all values in a matrix object.
 * E.g., { a: [1, 2], b: ["x", "y"] } => [{a: 1, b: "x"}, {a: 1, b: "y"}, {a: 2, b: "x"}, {a: 2, b: "y"}]
 */
function cartesianProduct(
  matrix: Record<string, string[]>
): Record<string, string>[] {
  const keys = Object.keys(matrix);
  if (keys.length === 0) return [{}];

  const results: Record<string, string>[] = [];

  function recurse(index: number, current: Record<string, string>): void {
    if (index === keys.length) {
      results.push({ ...current });
      return;
    }
    const key = keys[index];
    const values = matrix[key];
    for (const value of values) {
      current[key] = value;
      recurse(index + 1, current);
    }
  }

  recurse(0, {});
  return results;
}

/**
 * Replace all occurrences of {{key}} in any string leaf of an object.
 */
function substituteVariables(
  obj: any,
  vars: Record<string, string>
): any {
  if (typeof obj === 'string') {
    let result = obj;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => substituteVariables(item, vars));
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = substituteVariables(v, vars);
    }
    return result;
  }
  return obj;
}

// ── Variant Summary ─────────────────────────────────────────────────────────

function printVariantSummary(template: AdPilotTemplate): void {
  console.log(chalk.bold.cyan('\n--- Variant Generation Summary ---\n'));
  console.log(`  Template:   ${template.name}`);
  if (template.description) {
    console.log(`  Desc:       ${template.description}`);
  }
  console.log(`  Campaign:   ${template.campaign.name}`);
  console.log(`  Objective:  ${template.campaign.objective}`);
  console.log(`  Ad Sets:    ${template.adsets.length}`);
  console.log(`  Ads:        ${template.ads.length}`);
  console.log(chalk.bold.cyan('\n--- End Summary ---\n'));
}

// ── Command Registration ────────────────────────────────────────────────────

export function registerGenerateCommands(program: Command): void {
  const generate = program
    .command('generate')
    .description('Generate ad variant templates from base configurations');

  // ── generate variants ─────────────────────────────────────────────────
  generate
    .command('variants')
    .description('Generate a campaign template with multiple ad variants from a base spec')
    .requiredOption('--name <name>', 'Product/IP name')
    .requiredOption('--url <url>', 'Landing page URL')
    .requiredOption('--headlines <headlines>', 'Comma-separated headline variants')
    .requiredOption('--bodies <bodies>', 'Pipe-separated body text variants (use | as delimiter)')
    .option('--ctas <ctas>', 'Comma-separated CTA types', 'LEARN_MORE')
    .option('--countries <countries>', 'Target countries', 'US')
    .option('--age-groups <ranges>', 'Age ranges, e.g. "18-30,31-45,46-65"', '18-65')
    .option('--daily-budget <cents>', 'Daily budget per ad set in cents', '1500')
    .option('--objective <obj>', 'Campaign objective', 'OUTCOME_TRAFFIC')
    .option('--output <file>', 'Output template file path (default: stdout as JSON)')
    .option('--deploy', 'Deploy immediately after generating')
    .option('--dry-run', 'Show what would be deployed without deploying')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts: VariantOptions) => {
      try {
        // 1. Build the variant template
        const template = buildVariantTemplate(opts);

        // 2. Validate
        const validationErrors = validateTemplate(template);
        if (validationErrors.length > 0) {
          error('Generated template has validation errors:');
          for (const msg of validationErrors) {
            console.error(chalk.red(`  - ${msg}`));
          }
          process.exit(1);
        }

        // 3. Summary
        if (!opts.json) {
          printVariantSummary(template);
        }

        // 4. Dry run?
        if (opts.dryRun) {
          printDryRun(template);
          return;
        }

        // 5. Write to file?
        if (opts.output) {
          const outputPath = path.resolve(opts.output);
          fs.writeFileSync(outputPath, JSON.stringify(template, null, 2) + '\n');
          success(`Template written to ${outputPath}`);
        }

        // 6. Deploy?
        if (opts.deploy) {
          const accountId = opts.accountId || getAdAccountId();
          const spinner = createSpinner('Deploying generated template...');
          spinner.start();

          try {
            const result = await executeDeploy(template, accountId);
            spinner.stop();
            printDeployResult(result, template, !!opts.json);
          } catch (deployErr: any) {
            spinner.stop();
            error(`Deploy failed: ${deployErr.message}`);
            printPartialResult(
              { adset_ids: [], creative_ids: [], ad_ids: [] },
              template
            );
            process.exit(1);
          }
          return;
        }

        // 7. Otherwise, output as JSON to stdout
        if (!opts.output) {
          printJson(template);
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // ── generate from-template ─────────────────────────────────────────────
  generate
    .command('from-template')
    .description('Generate variants by multiplying a base template across variable combinations')
    .requiredOption('--template <file>', 'Base template file')
    .requiredOption(
      '--matrix <json>',
      'JSON object mapping variable names to arrays of values'
    )
    .option('--output <dir>', 'Output directory for generated templates')
    .option('--deploy-all', 'Deploy all generated templates')
    .option('--dry-run', 'Show plan without deploying')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts: FromTemplateOptions) => {
      try {
        // 1. Load base template
        const baseTemplate = loadTemplate(opts.template);
        info(`Loaded base template: ${baseTemplate.name}`);

        // 2. Parse matrix
        let matrix: Record<string, string[]>;
        try {
          matrix = JSON.parse(opts.matrix);
        } catch (parseErr: any) {
          throw new Error(`Failed to parse --matrix JSON: ${parseErr.message}`);
        }

        // Validate matrix: each key must map to an array of strings
        for (const [key, values] of Object.entries(matrix)) {
          if (!Array.isArray(values)) {
            throw new Error(
              `Matrix key "${key}" must map to an array. Got: ${typeof values}`
            );
          }
        }

        // 3. Generate all combinations
        const combinations = cartesianProduct(matrix);

        if (combinations.length === 0) {
          throw new Error('Matrix produced no combinations.');
        }

        info(`Matrix produces ${combinations.length} template combination(s).`);

        // 4. Generate resolved templates
        const generatedTemplates: { name: string; template: AdPilotTemplate }[] = [];

        for (let i = 0; i < combinations.length; i++) {
          const combo = combinations[i];
          // Deep clone base template
          const clone: AdPilotTemplate = JSON.parse(JSON.stringify(baseTemplate));

          // Substitute variables in all string leaves
          const substituted: AdPilotTemplate = substituteVariables(clone, combo);

          // Build a descriptive suffix from the combination
          const suffix = Object.entries(combo)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          substituted.name = `${baseTemplate.name} [${suffix}]`;
          substituted.campaign.name = `${baseTemplate.campaign.name} [${suffix}]`;

          // Validate
          const validationErrors = validateTemplate(substituted);
          if (validationErrors.length > 0) {
            error(`Variant ${i + 1} (${suffix}) has validation errors:`);
            for (const msg of validationErrors) {
              console.error(chalk.red(`  - ${msg}`));
            }
            process.exit(1);
          }

          generatedTemplates.push({
            name: suffix,
            template: substituted,
          });
        }

        // 5. Output to directory?
        if (opts.output) {
          const outputDir = path.resolve(opts.output);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          for (let i = 0; i < generatedTemplates.length; i++) {
            const { template } = generatedTemplates[i];
            const filename = `variant-${i + 1}.json`;
            const filePath = path.join(outputDir, filename);
            fs.writeFileSync(filePath, JSON.stringify(template, null, 2) + '\n');
            if (!opts.json) {
              success(`Written: ${filePath}`);
            }
          }

          if (!opts.json) {
            success(`${generatedTemplates.length} template(s) written to ${outputDir}`);
          }
        }

        // 6. Dry run?
        if (opts.dryRun) {
          for (let i = 0; i < generatedTemplates.length; i++) {
            const { name, template } = generatedTemplates[i];
            console.log(
              chalk.bold.cyan(`\n=== Variant ${i + 1}/${generatedTemplates.length}: ${name} ===`)
            );
            printDryRun(template);
          }
          return;
        }

        // 7. Deploy all?
        if (opts.deployAll) {
          const accountId = opts.accountId || getAdAccountId();

          for (let i = 0; i < generatedTemplates.length; i++) {
            const { name, template } = generatedTemplates[i];
            console.log(
              chalk.bold.cyan(
                `\nDeploying variant ${i + 1}/${generatedTemplates.length}: ${name}`
              )
            );

            const spinner = createSpinner(
              `Deploying variant ${i + 1}/${generatedTemplates.length}...`
            );
            spinner.start();

            try {
              const result = await executeDeploy(template, accountId);
              spinner.stop();
              printDeployResult(result, template, !!opts.json);
            } catch (deployErr: any) {
              spinner.stop();
              error(`Deploy failed for variant ${i + 1} (${name}): ${deployErr.message}`);
              printPartialResult(
                { adset_ids: [], creative_ids: [], ad_ids: [] },
                template
              );
              // Continue with remaining variants
              warn('Continuing with remaining variants...');
            }
          }

          success(`Deployment complete. ${generatedTemplates.length} variant(s) processed.`);
          return;
        }

        // 8. Otherwise, output all as JSON to stdout
        if (!opts.output) {
          if (opts.json) {
            printJson(generatedTemplates.map((g) => g.template));
          } else {
            for (let i = 0; i < generatedTemplates.length; i++) {
              const { name, template } = generatedTemplates[i];
              console.log(
                chalk.bold.cyan(
                  `\n=== Variant ${i + 1}/${generatedTemplates.length}: ${name} ===`
                )
              );
              printVariantSummary(template);
            }
            console.log();
            info(
              `Use --output <dir> to save, --dry-run to preview, or --deploy-all to deploy.`
            );
          }
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}
