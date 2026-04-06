import { Command } from 'commander';
import chalk from 'chalk';
import { apiGet, apiPost, fetchAllPages } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { getProject, listProjects } from '../lib/registry';
import { output, printTable, printRecord, printJson, success, error, warn, info } from '../utils/output';
import { createSpinner, DATE_PRESETS } from '../utils/helpers';

interface CampaignInsight {
  campaignId: string;
  campaignName: string;
  status: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  cpa: number;
  reach: number;
  actions: number;
  flags: string[];
}

const DEFAULT_MIN_CTR = 0.5;
const DEFAULT_MAX_CPA = 50;
const DEFAULT_MAX_CPC = 5;
const DEFAULT_MIN_IMPRESSIONS = 100;

export function registerMonitorCommands(program: Command): void {
  const monitor = program
    .command('monitor')
    .alias('mon')
    .description('Performance monitoring and auto-kill for underperforming campaigns');

  // RUN
  monitor
    .command('run')
    .description('Evaluate active campaigns against performance thresholds and pause underperformers')
    .option('--account-id <id>', 'Ad account ID')
    .option('--project <id>', 'Only evaluate campaigns linked to this project')
    .option('--min-ctr <pct>', 'Minimum CTR % threshold', String(DEFAULT_MIN_CTR))
    .option('--max-cpa <dollars>', 'Maximum CPA in dollars', String(DEFAULT_MAX_CPA))
    .option('--max-cpc <dollars>', 'Maximum CPC in dollars', String(DEFAULT_MAX_CPC))
    .option('--min-impressions <n>', 'Minimum impressions before evaluating', String(DEFAULT_MIN_IMPRESSIONS))
    .option(
      '--date-preset <preset>',
      `Date preset: ${DATE_PRESETS.join(', ')}`,
      'last_7d'
    )
    .option('--since <date>', 'Start date (YYYY-MM-DD)')
    .option('--until <date>', 'End date (YYYY-MM-DD)')
    .option('--dry-run', 'Print what would be paused without actually pausing')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Evaluating campaign performance...');
      spinner.start();
      try {
        const minCtr = parseFloat(opts.minCtr);
        const maxCpa = parseFloat(opts.maxCpa);
        const maxCpc = parseFloat(opts.maxCpc);
        const minImpressions = parseInt(opts.minImpressions, 10);

        // Determine which campaigns to evaluate
        let campaignIds: string[] | undefined;

        if (opts.project) {
          const project = getProject(opts.project);
          if (!project) {
            spinner.stop();
            error(`Project "${opts.project}" not found.`);
            process.exit(1);
            return;
          }
          if (project.campaignIds.length === 0) {
            spinner.stop();
            warn(`Project "${opts.project}" has no linked campaigns.`);
            return;
          }
          campaignIds = project.campaignIds;
        }

        // Fetch active campaigns
        let campaigns: any[];
        if (campaignIds) {
          // Fetch each linked campaign
          campaigns = [];
          for (const cid of campaignIds) {
            try {
              const data = await apiGet(cid, {
                fields: 'id,name,status,effective_status',
              });
              campaigns.push(data);
            } catch {
              // Skip campaigns that can't be fetched
            }
          }
        } else {
          const accountId = opts.accountId || getAdAccountId();
          campaigns = await fetchAllPages(`${accountId}/campaigns`, {
            fields: 'id,name,status,effective_status',
            filtering: [
              { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
            ],
          });
        }

        // Build insights params
        const insightsParams: Record<string, any> = {
          fields: 'campaign_name,impressions,clicks,spend,cpc,ctr,reach,actions',
        };
        if (opts.since && opts.until) {
          insightsParams.time_range = { since: opts.since, until: opts.until };
        } else {
          insightsParams.date_preset = opts.datePreset;
        }

        // Evaluate each campaign
        const evaluated: CampaignInsight[] = [];
        const flagged: CampaignInsight[] = [];
        const skipped: { campaignId: string; campaignName: string; reason: string }[] = [];

        for (const camp of campaigns) {
          try {
            const insightsRes = await apiGet(`${camp.id}/insights`, insightsParams);
            const rows = insightsRes.data || [];

            if (rows.length === 0) {
              skipped.push({
                campaignId: camp.id,
                campaignName: camp.name || camp.id,
                reason: 'No insights data',
              });
              continue;
            }

            const row = rows[0];
            const impressions = parseInt(row.impressions || '0', 10);
            const clicks = parseInt(row.clicks || '0', 10);
            const spend = parseFloat(row.spend || '0');
            const ctr = row.ctr ? parseFloat(row.ctr) : 0;
            const cpc = row.cpc ? parseFloat(row.cpc) : 0;
            const reach = parseInt(row.reach || '0', 10);

            // Count total conversions from actions
            let totalActions = 0;
            if (row.actions && Array.isArray(row.actions)) {
              for (const action of row.actions) {
                totalActions += parseInt(action.value || '0', 10);
              }
            }
            const cpa = totalActions > 0 ? spend / totalActions : 0;

            const flags: string[] = [];

            if (impressions >= minImpressions) {
              if (ctr < minCtr) {
                flags.push(`CTR ${ctr.toFixed(2)}% < ${minCtr}%`);
              }
              if (cpc > maxCpc && cpc > 0) {
                flags.push(`CPC $${cpc.toFixed(2)} > $${maxCpc.toFixed(2)}`);
              }
              if (cpa > maxCpa && cpa > 0) {
                flags.push(`CPA $${cpa.toFixed(2)} > $${maxCpa.toFixed(2)}`);
              }
            } else {
              skipped.push({
                campaignId: camp.id,
                campaignName: camp.name || camp.id,
                reason: `Only ${impressions} impressions (min: ${minImpressions})`,
              });
              continue;
            }

            const insight: CampaignInsight = {
              campaignId: camp.id,
              campaignName: row.campaign_name || camp.name || camp.id,
              status: camp.effective_status || camp.status || 'UNKNOWN',
              impressions,
              clicks,
              spend,
              ctr,
              cpc,
              cpa,
              reach,
              actions: totalActions,
              flags,
            };

            evaluated.push(insight);
            if (flags.length > 0) {
              flagged.push(insight);
            }
          } catch (err: any) {
            skipped.push({
              campaignId: camp.id,
              campaignName: camp.name || camp.id,
              reason: `API error: ${err.message}`,
            });
          }
        }

        // Pause flagged campaigns (unless dry-run)
        const paused: string[] = [];
        const pauseErrors: { campaignId: string; error: string }[] = [];

        if (!opts.dryRun && flagged.length > 0) {
          for (const item of flagged) {
            // Only pause campaigns that are currently ACTIVE
            if (item.status === 'ACTIVE') {
              try {
                await apiPost(item.campaignId, { status: 'PAUSED' });
                paused.push(item.campaignId);
              } catch (err: any) {
                pauseErrors.push({ campaignId: item.campaignId, error: err.message });
              }
            }
          }
        }

        spinner.stop();

        // Output results
        if (opts.json) {
          printJson({
            thresholds: { minCtr, maxCpa, maxCpc, minImpressions },
            dryRun: !!opts.dryRun,
            evaluated: evaluated.length,
            flagged: flagged.map((f) => ({
              ...f,
              paused: paused.includes(f.campaignId),
            })),
            skipped,
            paused,
            pauseErrors,
          });
          return;
        }

        // Print thresholds
        console.log(chalk.bold.cyan('\nPerformance Monitor'));
        console.log(chalk.gray(`  Min CTR: ${minCtr}%  |  Max CPA: $${maxCpa}  |  Max CPC: $${maxCpc}  |  Min Impressions: ${minImpressions}`));
        if (opts.dryRun) {
          console.log(chalk.yellow('  MODE: DRY RUN (no changes will be made)\n'));
        } else {
          console.log();
        }

        // Evaluated campaigns summary
        info(`${evaluated.length} campaign(s) evaluated, ${flagged.length} flagged, ${skipped.length} skipped`);

        // Flagged campaigns table
        if (flagged.length > 0) {
          const rows = flagged.map((f) => [
            f.campaignId,
            f.campaignName,
            `$${f.spend.toFixed(2)}`,
            String(f.impressions),
            `${f.ctr.toFixed(2)}%`,
            `$${f.cpc.toFixed(2)}`,
            f.cpa > 0 ? `$${f.cpa.toFixed(2)}` : '-',
            f.flags.join('; '),
            opts.dryRun
              ? chalk.yellow('WOULD PAUSE')
              : paused.includes(f.campaignId)
              ? chalk.red('PAUSED')
              : chalk.gray('NOT ACTIVE'),
          ]);

          printTable(
            ['ID', 'Name', 'Spend', 'Impr.', 'CTR', 'CPC', 'CPA', 'Violations', 'Action'],
            rows,
            'Flagged Campaigns'
          );
        }

        // Passing campaigns
        const passing = evaluated.filter((e) => e.flags.length === 0);
        if (passing.length > 0) {
          const rows = passing.map((p) => [
            p.campaignId,
            p.campaignName,
            `$${p.spend.toFixed(2)}`,
            String(p.impressions),
            `${p.ctr.toFixed(2)}%`,
            `$${p.cpc.toFixed(2)}`,
            p.cpa > 0 ? `$${p.cpa.toFixed(2)}` : '-',
            chalk.green('PASS'),
          ]);

          printTable(
            ['ID', 'Name', 'Spend', 'Impr.', 'CTR', 'CPC', 'CPA', 'Status'],
            rows,
            'Passing Campaigns'
          );
        }

        // Skipped
        if (skipped.length > 0) {
          const rows = skipped.map((s) => [s.campaignId, s.campaignName, s.reason]);
          printTable(['ID', 'Name', 'Reason'], rows, 'Skipped');
        }

        // Pause errors
        if (pauseErrors.length > 0) {
          for (const pe of pauseErrors) {
            error(`Failed to pause ${pe.campaignId}: ${pe.error}`);
          }
        }

        // Summary line
        if (!opts.dryRun && paused.length > 0) {
          success(`${paused.length} campaign(s) paused.`);
        } else if (opts.dryRun && flagged.length > 0) {
          warn(`${flagged.length} campaign(s) would be paused. Remove --dry-run to apply.`);
        } else if (flagged.length === 0) {
          success('All campaigns are within performance thresholds.');
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // STATUS
  monitor
    .command('status')
    .description('Quick overview of active campaigns with current performance metrics')
    .option('--account-id <id>', 'Ad account ID')
    .option('--project <id>', 'Only show campaigns linked to this project')
    .option('--min-ctr <pct>', 'Minimum CTR % threshold for flagging', String(DEFAULT_MIN_CTR))
    .option('--max-cpa <dollars>', 'Maximum CPA in dollars for flagging', String(DEFAULT_MAX_CPA))
    .option('--max-cpc <dollars>', 'Maximum CPC in dollars for flagging', String(DEFAULT_MAX_CPC))
    .option('--min-impressions <n>', 'Minimum impressions before evaluating', String(DEFAULT_MIN_IMPRESSIONS))
    .option(
      '--date-preset <preset>',
      `Date preset: ${DATE_PRESETS.join(', ')}`,
      'last_7d'
    )
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching campaign status...');
      spinner.start();
      try {
        const minCtr = parseFloat(opts.minCtr);
        const maxCpa = parseFloat(opts.maxCpa);
        const maxCpc = parseFloat(opts.maxCpc);
        const minImpressions = parseInt(opts.minImpressions, 10);

        // Determine which campaigns
        let campaignIds: string[] | undefined;

        if (opts.project) {
          const project = getProject(opts.project);
          if (!project) {
            spinner.stop();
            error(`Project "${opts.project}" not found.`);
            process.exit(1);
            return;
          }
          campaignIds = project.campaignIds;
        }

        let campaigns: any[];
        if (campaignIds) {
          campaigns = [];
          for (const cid of campaignIds) {
            try {
              const data = await apiGet(cid, {
                fields: 'id,name,status,effective_status',
              });
              campaigns.push(data);
            } catch {
              // Skip
            }
          }
        } else {
          const accountId = opts.accountId || getAdAccountId();
          campaigns = await fetchAllPages(`${accountId}/campaigns`, {
            fields: 'id,name,status,effective_status',
            filtering: [
              { field: 'effective_status', operator: 'IN', value: ['ACTIVE'] },
            ],
          });
        }

        const insightsParams: Record<string, any> = {
          fields: 'campaign_name,impressions,clicks,spend,cpc,ctr,reach,actions',
          date_preset: opts.datePreset,
        };

        const results: any[] = [];

        for (const camp of campaigns) {
          try {
            const insightsRes = await apiGet(`${camp.id}/insights`, insightsParams);
            const rows = insightsRes.data || [];

            if (rows.length === 0) {
              results.push({
                campaignId: camp.id,
                campaignName: camp.name || camp.id,
                status: camp.effective_status || camp.status,
                impressions: 0,
                clicks: 0,
                spend: 0,
                ctr: 0,
                cpc: 0,
                cpa: 0,
                reach: 0,
                health: 'NO DATA',
              });
              continue;
            }

            const row = rows[0];
            const impressions = parseInt(row.impressions || '0', 10);
            const clicks = parseInt(row.clicks || '0', 10);
            const spend = parseFloat(row.spend || '0');
            const ctr = row.ctr ? parseFloat(row.ctr) : 0;
            const cpc = row.cpc ? parseFloat(row.cpc) : 0;
            const reach = parseInt(row.reach || '0', 10);

            let totalActions = 0;
            if (row.actions && Array.isArray(row.actions)) {
              for (const action of row.actions) {
                totalActions += parseInt(action.value || '0', 10);
              }
            }
            const cpa = totalActions > 0 ? spend / totalActions : 0;

            let health = 'OK';
            if (impressions < minImpressions) {
              health = 'TOO EARLY';
            } else {
              const issues: string[] = [];
              if (ctr < minCtr) issues.push('LOW CTR');
              if (cpc > maxCpc && cpc > 0) issues.push('HIGH CPC');
              if (cpa > maxCpa && cpa > 0) issues.push('HIGH CPA');
              if (issues.length > 0) health = issues.join(', ');
            }

            results.push({
              campaignId: camp.id,
              campaignName: row.campaign_name || camp.name || camp.id,
              status: camp.effective_status || camp.status,
              impressions,
              clicks,
              spend,
              ctr,
              cpc,
              cpa,
              reach,
              health,
            });
          } catch {
            results.push({
              campaignId: camp.id,
              campaignName: camp.name || camp.id,
              status: camp.effective_status || camp.status,
              health: 'ERROR',
            });
          }
        }

        spinner.stop();

        if (opts.json) {
          printJson(results);
          return;
        }

        if (results.length === 0) {
          console.log(chalk.yellow('No active campaigns found.'));
          return;
        }

        const rows = results.map((r) => [
          r.campaignId,
          r.campaignName,
          r.status || '-',
          r.spend != null ? `$${r.spend.toFixed(2)}` : '-',
          r.impressions != null ? String(r.impressions) : '-',
          r.ctr != null ? `${r.ctr.toFixed(2)}%` : '-',
          r.cpc != null ? `$${r.cpc.toFixed(2)}` : '-',
          r.cpa != null && r.cpa > 0 ? `$${r.cpa.toFixed(2)}` : '-',
          healthColor(r.health),
        ]);

        printTable(
          ['ID', 'Name', 'Status', 'Spend', 'Impr.', 'CTR', 'CPC', 'CPA', 'Health'],
          rows,
          'Campaign Health Status'
        );
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}

function healthColor(health: string): string {
  if (health === 'OK') return chalk.green(health);
  if (health === 'NO DATA' || health === 'TOO EARLY') return chalk.gray(health);
  if (health === 'ERROR') return chalk.red(health);
  // Any flag combination (LOW CTR, HIGH CPC, etc.)
  return chalk.red(health);
}
