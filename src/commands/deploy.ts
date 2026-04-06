import { Command } from 'commander';
import chalk from 'chalk';
import { apiPost } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { loadTemplate, resolveVariables, validateTemplate, AdPilotTemplate } from '../lib/templates';
import { createSpinner, parseKeyValue, formatBudget } from '../utils/helpers';
import { success, error, warn, info, printJson, printTable, printRecord } from '../utils/output';

// ── Types ───────────────────────────────────────────────────────────────────

export interface DeployResult {
  campaign_id?: string;
  adset_ids: string[];
  creative_ids: string[];
  ad_ids: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseVarFlags(rawVars: string[]): Record<string, string> {
  if (!rawVars || rawVars.length === 0) return {};
  return parseKeyValue(rawVars);
}

export function printDryRun(template: AdPilotTemplate): void {
  console.log(chalk.bold.cyan('\n--- Dry Run: Deploy Plan ---\n'));

  // Campaign
  console.log(chalk.bold('Campaign:'));
  console.log(`  Name:       ${template.campaign.name}`);
  console.log(`  Objective:  ${template.campaign.objective}`);
  console.log(`  Status:     ${template.campaign.status || 'PAUSED'}`);
  if (template.campaign.daily_budget) {
    console.log(`  Daily $:    ${formatBudget(template.campaign.daily_budget)}`);
  }
  if (template.campaign.lifetime_budget) {
    console.log(`  Lifetime $: ${formatBudget(template.campaign.lifetime_budget)}`);
  }
  if (template.campaign.bid_strategy) {
    console.log(`  Bid Strat:  ${template.campaign.bid_strategy}`);
  }
  if (template.campaign.special_ad_categories?.length) {
    console.log(`  Special:    ${template.campaign.special_ad_categories.join(', ')}`);
  }
  console.log();

  // Ad Sets
  console.log(chalk.bold(`Ad Sets (${template.adsets.length}):`));
  template.adsets.forEach((adset, i) => {
    console.log(`  [${i}] ${adset.name}`);
    console.log(`      Billing:      ${adset.billing_event}`);
    console.log(`      Optimization: ${adset.optimization_goal}`);
    if (adset.daily_budget) {
      console.log(`      Daily $:      ${formatBudget(adset.daily_budget)}`);
    }
    if (adset.lifetime_budget) {
      console.log(`      Lifetime $:   ${formatBudget(adset.lifetime_budget)}`);
    }
    console.log(`      Status:       ${adset.status || 'PAUSED'}`);
    console.log(`      Targeting:    ${JSON.stringify(adset.targeting)}`);
  });
  console.log();

  // Ads + Creatives
  console.log(chalk.bold(`Ads (${template.ads.length}):`));
  template.ads.forEach((ad, i) => {
    console.log(`  [${i}] ${ad.name}  ->  adset[${ad.adset_index}]`);
    console.log(`      Creative:     ${ad.creative.name}`);
    if (ad.creative.title) {
      console.log(`      Title:        ${ad.creative.title}`);
    }
    if (ad.creative.body) {
      console.log(`      Body:         ${ad.creative.body}`);
    }
    if (ad.creative.link_url) {
      console.log(`      Link:         ${ad.creative.link_url}`);
    }
    if (ad.creative.call_to_action_type) {
      console.log(`      CTA:          ${ad.creative.call_to_action_type}`);
    }
    console.log(`      Status:       ${ad.status || 'PAUSED'}`);
  });

  console.log(chalk.bold.cyan('\n--- End Dry Run ---\n'));
}

export function printDeployResult(result: DeployResult, template: AdPilotTemplate, asJson: boolean): void {
  if (asJson) {
    printJson(result);
    return;
  }

  console.log(chalk.bold.green('\n--- Deploy Complete ---\n'));

  console.log(chalk.bold('Campaign:'));
  console.log(`  ${template.campaign.name}  ->  ${chalk.cyan(result.campaign_id || 'N/A')}`);
  console.log();

  console.log(chalk.bold('Ad Sets:'));
  template.adsets.forEach((adset, i) => {
    const id = result.adset_ids[i] || 'N/A';
    console.log(`  [${i}] ${adset.name}  ->  ${chalk.cyan(id)}`);
  });
  console.log();

  console.log(chalk.bold('Creatives:'));
  template.ads.forEach((ad, i) => {
    const id = result.creative_ids[i] || 'N/A';
    console.log(`  [${i}] ${ad.creative.name}  ->  ${chalk.cyan(id)}`);
  });
  console.log();

  console.log(chalk.bold('Ads:'));
  template.ads.forEach((ad, i) => {
    const id = result.ad_ids[i] || 'N/A';
    console.log(`  [${i}] ${ad.name}  ->  ${chalk.cyan(id)}`);
  });

  console.log(chalk.bold.green('\n--- Done ---\n'));
}

export function printPartialResult(result: DeployResult, template: AdPilotTemplate): void {
  console.log(chalk.bold.yellow('\n--- Partial Deploy (cleanup may be needed) ---\n'));

  if (result.campaign_id) {
    console.log(`  Campaign: ${result.campaign_id}`);
  }
  if (result.adset_ids.length > 0) {
    console.log(`  Ad Sets:  ${result.adset_ids.join(', ')}`);
  }
  if (result.creative_ids.length > 0) {
    console.log(`  Creatives: ${result.creative_ids.join(', ')}`);
  }
  if (result.ad_ids.length > 0) {
    console.log(`  Ads:       ${result.ad_ids.join(', ')}`);
  }

  console.log(chalk.yellow(
    '\nThese objects were created before the error. You may want to delete them manually.\n'
  ));
}

// ── Deploy Logic ────────────────────────────────────────────────────────────

export async function executeDeploy(
  template: AdPilotTemplate,
  accountId: string
): Promise<DeployResult> {
  const result: DeployResult = {
    adset_ids: [],
    creative_ids: [],
    ad_ids: [],
  };

  // 1. Create Campaign
  const campaignBody: Record<string, any> = {
    name: template.campaign.name,
    objective: template.campaign.objective,
    status: template.campaign.status || 'PAUSED',
  };
  if (template.campaign.special_ad_categories) {
    campaignBody.special_ad_categories = JSON.stringify(template.campaign.special_ad_categories);
  }
  if (template.campaign.daily_budget) {
    campaignBody.daily_budget = template.campaign.daily_budget;
  }
  if (template.campaign.lifetime_budget) {
    campaignBody.lifetime_budget = template.campaign.lifetime_budget;
  }
  if (template.campaign.bid_strategy) {
    campaignBody.bid_strategy = template.campaign.bid_strategy;
  }

  const campaignResp = await apiPost(`${accountId}/campaigns`, campaignBody);
  result.campaign_id = campaignResp.id;

  // 2. Create Ad Sets
  for (const adset of template.adsets) {
    const adsetBody: Record<string, any> = {
      name: adset.name,
      campaign_id: result.campaign_id,
      billing_event: adset.billing_event,
      optimization_goal: adset.optimization_goal,
      targeting: adset.targeting,
      status: adset.status || 'PAUSED',
    };
    if (adset.daily_budget) adsetBody.daily_budget = adset.daily_budget;
    if (adset.lifetime_budget) adsetBody.lifetime_budget = adset.lifetime_budget;
    if (adset.bid_amount) adsetBody.bid_amount = adset.bid_amount;

    const adsetResp = await apiPost(`${accountId}/adsets`, adsetBody);
    result.adset_ids.push(adsetResp.id!);
  }

  // 3. Create Creatives
  for (const ad of template.ads) {
    const creativeBody: Record<string, any> = {
      name: ad.creative.name,
    };
    if (ad.creative.object_story_spec) {
      creativeBody.object_story_spec = ad.creative.object_story_spec;
    }
    if (ad.creative.title) creativeBody.title = ad.creative.title;
    if (ad.creative.body) creativeBody.body = ad.creative.body;
    if (ad.creative.link_url) creativeBody.link_url = ad.creative.link_url;
    if (ad.creative.image_hash) creativeBody.image_hash = ad.creative.image_hash;
    if (ad.creative.image_url) creativeBody.image_url = ad.creative.image_url;
    if (ad.creative.call_to_action_type) {
      creativeBody.call_to_action_type = ad.creative.call_to_action_type;
    }

    const creativeResp = await apiPost(`${accountId}/adcreatives`, creativeBody);
    result.creative_ids.push(creativeResp.id!);
  }

  // 4. Create Ads (linking adset by index, creative by index)
  for (let i = 0; i < template.ads.length; i++) {
    const ad = template.ads[i];
    const adsetId = result.adset_ids[ad.adset_index];
    const creativeId = result.creative_ids[i];

    const adBody: Record<string, any> = {
      name: ad.name,
      adset_id: adsetId,
      creative: JSON.stringify({ creative_id: creativeId }),
      status: ad.status || 'PAUSED',
    };

    const adResp = await apiPost(`${accountId}/ads`, adBody);
    result.ad_ids.push(adResp.id!);
  }

  return result;
}

// ── Command Registration ────────────────────────────────────────────────────

export function registerDeployCommands(program: Command): void {
  const deploy = program
    .command('deploy')
    .description('Deploy campaigns from a template file');

  // ── deploy (main) ─────────────────────────────────────────────────────
  deploy
    .command('run', { isDefault: true })
    .description('Deploy a template to Meta Ads')
    .requiredOption('-t, --template <file>', 'Path to the template JSON file')
    .option('--var <key=value...>', 'Template variable overrides (repeatable)', collectVar, [])
    .option('--dry-run', 'Show what would be created without deploying')
    .option('--account-id <id>', 'Ad account ID override')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        // 1. Load
        const template = loadTemplate(opts.template);
        info(`Loaded template: ${template.name}`);

        // 2. Resolve variables
        const vars = parseVarFlags(opts.var);
        const resolved = resolveVariables(template, vars);

        // 3. Validate
        const validationErrors = validateTemplate(resolved);
        if (validationErrors.length > 0) {
          error('Template validation failed:');
          for (const msg of validationErrors) {
            console.error(chalk.red(`  - ${msg}`));
          }
          process.exit(1);
        }

        // 4. Dry run?
        if (opts.dryRun) {
          printDryRun(resolved);
          return;
        }

        // 5. Deploy
        const accountId = opts.accountId || getAdAccountId();
        const spinner = createSpinner('Deploying template...');
        spinner.start();

        const result: DeployResult = {
          adset_ids: [],
          creative_ids: [],
          ad_ids: [],
        };

        try {
          const deployed = await executeDeploy(resolved, accountId);
          spinner.stop();
          Object.assign(result, deployed);
          printDeployResult(result, resolved, opts.json);
        } catch (deployErr: any) {
          spinner.stop();
          error(`Deploy failed: ${deployErr.message}`);
          printPartialResult(result, resolved);
          process.exit(1);
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // ── deploy validate ───────────────────────────────────────────────────
  deploy
    .command('validate')
    .description('Validate a template without deploying')
    .requiredOption('-t, --template <file>', 'Path to the template JSON file')
    .option('--var <key=value...>', 'Template variable overrides (repeatable)', collectVar, [])
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        // Load
        const template = loadTemplate(opts.template);
        info(`Loaded template: ${template.name}`);

        // Resolve variables
        const vars = parseVarFlags(opts.var);
        const resolved = resolveVariables(template, vars);

        // Validate
        const validationErrors = validateTemplate(resolved);

        if (opts.json) {
          printJson({
            valid: validationErrors.length === 0,
            errors: validationErrors,
            template: {
              name: resolved.name,
              campaign: resolved.campaign.name,
              adsets: resolved.adsets.length,
              ads: resolved.ads.length,
            },
          });
          return;
        }

        if (validationErrors.length === 0) {
          success('Template is valid!');
          console.log(chalk.gray(`  Name:     ${resolved.name}`));
          console.log(chalk.gray(`  Campaign: ${resolved.campaign.name}`));
          console.log(chalk.gray(`  Ad Sets:  ${resolved.adsets.length}`));
          console.log(chalk.gray(`  Ads:      ${resolved.ads.length}`));
        } else {
          error('Template validation failed:');
          for (const msg of validationErrors) {
            console.error(chalk.red(`  - ${msg}`));
          }
          process.exit(1);
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });
}

// ── Util: Commander repeatable option collector ─────────────────────────────

function collectVar(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}
