import { Command } from 'commander';
import chalk from 'chalk';
import { apiGet, apiPost, fetchAllPages } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { getProject, listProjects } from '../lib/registry';
import { output, printTable, printRecord, printJson, success, error, warn, info } from '../utils/output';
import { createSpinner, DATE_PRESETS, formatBudget } from '../utils/helpers';

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

interface AdInsight {
  adId: string;
  adName: string;
  adSetId: string;
  adSetName: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  spend: number;
  ctr: number;
  cpc: number;
  reach: number;
  actions: number;
  compositeScore: number;
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

  // WINNERS
  monitor
    .command('winners')
    .description('Detect top-performing ads by composite score and optionally scale their budgets')
    .option('--account-id <id>', 'Ad account ID')
    .option('--project <id>', 'Only evaluate campaigns linked to this project')
    .option(
      '--date-preset <preset>',
      `Date preset: ${DATE_PRESETS.join(', ')}`,
      'last_7d'
    )
    .option('--top <n>', 'Number of top ads to show', '5')
    .option('--scale-budget <multiplier>', 'Scale winning ad set budgets by this multiplier (e.g. 1.5 = 50% increase)')
    .option('--dry-run', 'Show what would change without applying')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Detecting winning ads...');
      spinner.start();
      try {
        const topN = parseInt(opts.top, 10);
        const scaleBudget = opts.scaleBudget ? parseFloat(opts.scaleBudget) : undefined;

        // Fetch ad-level insights
        const adInsights = await fetchAdInsights(opts);

        spinner.stop();

        if (adInsights.length === 0) {
          warn('No ad-level insights data found.');
          return;
        }

        // Compute composite scores and rank
        const scored = computeCompositeScores(adInsights);
        // Sort best to worst
        scored.sort((a, b) => b.compositeScore - a.compositeScore);
        const winners = scored.slice(0, topN);

        // Handle budget scaling
        const budgetChanges: { adSetId: string; adSetName: string; oldBudget: string; newBudget: string; applied: boolean; error?: string }[] = [];

        if (scaleBudget && scaleBudget > 0) {
          for (const winner of winners) {
            try {
              // Fetch current ad set budget
              const adSetData = await apiGet(winner.adSetId, {
                fields: 'id,name,daily_budget,lifetime_budget',
              });
              const dailyBudget = adSetData.daily_budget ? parseInt(adSetData.daily_budget, 10) : 0;
              const lifetimeBudget = adSetData.lifetime_budget ? parseInt(adSetData.lifetime_budget, 10) : 0;

              if (dailyBudget > 0) {
                const newBudget = Math.round(dailyBudget * scaleBudget);
                const change = {
                  adSetId: winner.adSetId,
                  adSetName: winner.adSetName,
                  oldBudget: formatBudget(dailyBudget),
                  newBudget: formatBudget(newBudget),
                  applied: false,
                };

                if (!opts.dryRun) {
                  try {
                    await apiPost(winner.adSetId, { daily_budget: String(newBudget) });
                    change.applied = true;
                  } catch (err: any) {
                    (change as any).error = err.message;
                  }
                }
                budgetChanges.push(change);
              } else if (lifetimeBudget > 0) {
                const newBudget = Math.round(lifetimeBudget * scaleBudget);
                const change = {
                  adSetId: winner.adSetId,
                  adSetName: winner.adSetName,
                  oldBudget: formatBudget(lifetimeBudget) + ' (lifetime)',
                  newBudget: formatBudget(newBudget) + ' (lifetime)',
                  applied: false,
                };

                if (!opts.dryRun) {
                  try {
                    await apiPost(winner.adSetId, { lifetime_budget: String(newBudget) });
                    change.applied = true;
                  } catch (err: any) {
                    (change as any).error = err.message;
                  }
                }
                budgetChanges.push(change);
              }
            } catch {
              // Could not fetch ad set data, skip
            }
          }
        }

        // Output
        if (opts.json) {
          printJson({
            topN,
            scaleBudget: scaleBudget || null,
            dryRun: !!opts.dryRun,
            winners,
            budgetChanges,
          });
          return;
        }

        console.log(chalk.bold.cyan('\nWinner Detection'));
        if (opts.dryRun) {
          console.log(chalk.yellow('  MODE: DRY RUN (no changes will be made)\n'));
        } else {
          console.log();
        }

        const tableRows = winners.map((w, i) => [
          String(i + 1),
          w.adId,
          w.adName,
          w.campaignName,
          `$${w.spend.toFixed(2)}`,
          String(w.impressions),
          `${w.ctr.toFixed(2)}%`,
          w.cpc > 0 ? `$${w.cpc.toFixed(2)}` : '-',
          String(w.reach),
          chalk.green(w.compositeScore.toFixed(3)),
        ]);

        printTable(
          ['#', 'Ad ID', 'Ad Name', 'Campaign', 'Spend', 'Impr.', 'CTR', 'CPC', 'Reach', 'Score'],
          tableRows,
          `Top ${topN} Winning Ads`
        );

        if (budgetChanges.length > 0) {
          const budgetRows = budgetChanges.map((bc) => [
            bc.adSetId,
            bc.adSetName,
            bc.oldBudget,
            bc.newBudget,
            opts.dryRun
              ? chalk.yellow('WOULD SCALE')
              : bc.applied
              ? chalk.green('SCALED')
              : chalk.red(bc.error || 'FAILED'),
          ]);

          printTable(
            ['Ad Set ID', 'Ad Set', 'Old Budget', 'New Budget', 'Status'],
            budgetRows,
            'Budget Scaling'
          );

          if (opts.dryRun) {
            warn(`${budgetChanges.length} ad set budget(s) would be scaled. Remove --dry-run to apply.`);
          } else {
            const applied = budgetChanges.filter((bc) => bc.applied).length;
            if (applied > 0) {
              success(`${applied} ad set budget(s) scaled by ${scaleBudget}x.`);
            }
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // LOSERS
  monitor
    .command('losers')
    .description('Detect worst-performing ads by composite score and optionally pause them')
    .option('--account-id <id>', 'Ad account ID')
    .option('--project <id>', 'Only evaluate campaigns linked to this project')
    .option(
      '--date-preset <preset>',
      `Date preset: ${DATE_PRESETS.join(', ')}`,
      'last_7d'
    )
    .option('--bottom <n>', 'Number of bottom ads to show', '5')
    .option('--pause', 'Pause the losing ads')
    .option('--dry-run', 'Show what would change without applying')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Detecting losing ads...');
      spinner.start();
      try {
        const bottomN = parseInt(opts.bottom, 10);

        // Fetch ad-level insights
        const adInsights = await fetchAdInsights(opts);

        spinner.stop();

        if (adInsights.length === 0) {
          warn('No ad-level insights data found.');
          return;
        }

        // Compute composite scores and rank
        const scored = computeCompositeScores(adInsights);
        // Sort worst to best
        scored.sort((a, b) => a.compositeScore - b.compositeScore);
        const losers = scored.slice(0, bottomN);

        // Handle pausing
        const pauseResults: { adId: string; adName: string; paused: boolean; error?: string }[] = [];

        if (opts.pause) {
          for (const loser of losers) {
            if (opts.dryRun) {
              pauseResults.push({ adId: loser.adId, adName: loser.adName, paused: false });
            } else {
              try {
                await apiPost(loser.adId, { status: 'PAUSED' });
                pauseResults.push({ adId: loser.adId, adName: loser.adName, paused: true });
              } catch (err: any) {
                pauseResults.push({ adId: loser.adId, adName: loser.adName, paused: false, error: err.message });
              }
            }
          }
        }

        // Output
        if (opts.json) {
          printJson({
            bottomN,
            pauseRequested: !!opts.pause,
            dryRun: !!opts.dryRun,
            losers,
            pauseResults,
          });
          return;
        }

        console.log(chalk.bold.cyan('\nLoser Detection'));
        if (opts.dryRun) {
          console.log(chalk.yellow('  MODE: DRY RUN (no changes will be made)\n'));
        } else {
          console.log();
        }

        const tableRows = losers.map((l, i) => {
          const pauseInfo = pauseResults.find((pr) => pr.adId === l.adId);
          let action = '-';
          if (opts.pause) {
            if (opts.dryRun) {
              action = chalk.yellow('WOULD PAUSE');
            } else if (pauseInfo?.paused) {
              action = chalk.red('PAUSED');
            } else if (pauseInfo?.error) {
              action = chalk.red('FAILED');
            }
          }

          return [
            String(i + 1),
            l.adId,
            l.adName,
            l.campaignName,
            `$${l.spend.toFixed(2)}`,
            String(l.impressions),
            `${l.ctr.toFixed(2)}%`,
            l.cpc > 0 ? `$${l.cpc.toFixed(2)}` : '-',
            String(l.reach),
            chalk.red(l.compositeScore.toFixed(3)),
            action,
          ];
        });

        printTable(
          ['#', 'Ad ID', 'Ad Name', 'Campaign', 'Spend', 'Impr.', 'CTR', 'CPC', 'Reach', 'Score', 'Action'],
          tableRows,
          `Bottom ${bottomN} Losing Ads`
        );

        if (opts.pause) {
          if (opts.dryRun) {
            warn(`${losers.length} ad(s) would be paused. Remove --dry-run to apply.`);
          } else {
            const pausedCount = pauseResults.filter((pr) => pr.paused).length;
            if (pausedCount > 0) {
              success(`${pausedCount} ad(s) paused.`);
            }
            const failedCount = pauseResults.filter((pr) => pr.error).length;
            if (failedCount > 0) {
              error(`${failedCount} ad(s) failed to pause.`);
            }
          }
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

/**
 * Fetch ad-level insights for all active campaigns (or project-filtered ones).
 */
async function fetchAdInsights(opts: any): Promise<AdInsight[]> {
  // Determine which campaigns to evaluate
  let campaignIds: string[] | undefined;

  if (opts.project) {
    const project = getProject(opts.project);
    if (!project) {
      throw new Error(`Project "${opts.project}" not found.`);
    }
    if (project.campaignIds.length === 0) {
      return [];
    }
    campaignIds = project.campaignIds;
  }

  // Fetch active campaigns
  let campaigns: any[];
  if (campaignIds) {
    campaigns = [];
    for (const cid of campaignIds) {
      try {
        const data = await apiGet(cid, {
          fields: 'id,name,status,effective_status',
        });
        if (data.effective_status === 'ACTIVE' || data.status === 'ACTIVE') {
          campaigns.push(data);
        }
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

  // Build insights params at ad level
  const insightsParams: Record<string, any> = {
    fields: 'ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,impressions,clicks,spend,cpc,ctr,reach,actions',
    level: 'ad',
    date_preset: opts.datePreset || 'last_7d',
  };

  const allAdInsights: AdInsight[] = [];

  for (const camp of campaigns) {
    try {
      const insightsRes = await apiGet(`${camp.id}/insights`, insightsParams);
      const rows = insightsRes.data || [];

      for (const row of rows) {
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

        allAdInsights.push({
          adId: row.ad_id || '',
          adName: row.ad_name || row.ad_id || '',
          adSetId: row.adset_id || '',
          adSetName: row.adset_name || row.adset_id || '',
          campaignId: row.campaign_id || camp.id,
          campaignName: row.campaign_name || camp.name || camp.id,
          impressions,
          clicks,
          spend,
          ctr,
          cpc,
          reach,
          actions: totalActions,
          compositeScore: 0, // Will be computed later
        });
      }
    } catch {
      // Skip campaigns with API errors
    }
  }

  return allAdInsights;
}

/**
 * Compute composite scores for ad insights.
 * Score = (CTR_norm * 0.4) + (invCPC_norm * 0.3) + (reach_norm * 0.3)
 * Each component normalized 0-1 within the dataset.
 */
function computeCompositeScores(ads: AdInsight[]): AdInsight[] {
  if (ads.length === 0) return ads;

  // Extract raw values
  const ctrs = ads.map((a) => a.ctr);
  const invCpcs = ads.map((a) => (a.cpc > 0 ? 1 / a.cpc : 0));
  const reaches = ads.map((a) => a.reach / 1000);

  // Normalize helper: map values to 0-1 range
  const normalize = (values: number[]): number[] => {
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    if (range === 0) return values.map(() => 0.5); // All equal
    return values.map((v) => (v - min) / range);
  };

  const normCtrs = normalize(ctrs);
  const normInvCpcs = normalize(invCpcs);
  const normReaches = normalize(reaches);

  for (let i = 0; i < ads.length; i++) {
    ads[i].compositeScore =
      normCtrs[i] * 0.4 + normInvCpcs[i] * 0.3 + normReaches[i] * 0.3;
  }

  return ads;
}
