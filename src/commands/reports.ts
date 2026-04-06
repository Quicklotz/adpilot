import { Command } from 'commander';
import chalk from 'chalk';
import { apiGet, apiPost, fetchAllPages } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import {
  listSavedReports,
  getSavedReport,
  saveReport,
  deleteReport,
  SavedReport,
} from '../lib/reports';
import { output, printTable, printRecord, success, error, info, warn, writeCsv } from '../utils/output';
import { createSpinner, buildFieldsParam } from '../utils/helpers';

// --- Metric direction for comparative reporting ---
const HIGHER_IS_BETTER = new Set([
  'impressions',
  'clicks',
  'ctr',
  'reach',
  'actions',
  'conversions',
]);
const LOWER_IS_BETTER = new Set([
  'cpc',
  'cpm',
  'cost_per_action_type',
  'frequency',
]);
const NEUTRAL = new Set(['spend']);

const DEFAULT_COMPARE_FIELDS = 'impressions,clicks,spend,ctr,cpc,cpm,reach';

interface ComparisonEntry {
  metric: string;
  period1: number;
  period2: number;
  absoluteChange: number;
  pctChange: number;
}

export function registerReportsCommands(program: Command): void {
  const reports = program
    .command('reports')
    .description('Saved report templates and comparative reporting');

  // reports save
  reports
    .command('save')
    .description('Save an insight query as a named template')
    .requiredOption('--name <name>', 'Template name')
    .option('--description <desc>', 'Template description')
    .requiredOption('--level <level>', 'Insight level: account, campaign, adset, ad')
    .option('--object-id <id>', 'Specific campaign/adset/ad ID')
    .requiredOption('--fields <fields>', 'Comma-separated metrics')
    .option('--date-preset <preset>', 'Date preset')
    .option('--breakdowns <breakdowns>', 'Comma-separated breakdowns')
    .action(async (opts) => {
      try {
        const validLevels = ['account', 'campaign', 'adset', 'ad'];
        if (!validLevels.includes(opts.level)) {
          error(`Invalid level "${opts.level}". Must be one of: ${validLevels.join(', ')}`);
          process.exit(1);
        }

        const report: SavedReport = {
          name: opts.name,
          description: opts.description,
          level: opts.level,
          objectId: opts.objectId,
          fields: opts.fields,
          datePreset: opts.datePreset,
          breakdowns: opts.breakdowns,
          createdAt: new Date().toISOString(),
        };

        saveReport(report);
        success(`Report template "${opts.name}" saved.`);
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // reports list
  reports
    .command('list')
    .description('List all saved report templates')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const saved = listSavedReports();
        if (saved.length === 0) {
          info('No saved report templates. Use `adpilot reports save` to create one.');
          return;
        }

        if (opts.json) {
          output(saved, 'json');
          return;
        }

        const headers = ['Name', 'Level', 'Fields', 'Date Preset', 'Description', 'Created'];
        const rows = saved.map((r) => [
          r.name,
          r.level,
          truncateStr(r.fields, 30),
          r.datePreset || '-',
          truncateStr(r.description || '-', 25),
          r.createdAt.slice(0, 10),
        ]);

        printTable(headers, rows, 'Saved Report Templates');
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // reports run <name>
  reports
    .command('run <name>')
    .description('Execute a saved report template')
    .option('--date-preset <preset>', 'Override the date preset')
    .option('--account-id <id>', 'Ad account ID')
    .option('--csv <file>', 'Export to CSV')
    .option('--json', 'Output as JSON')
    .action(async (name, opts) => {
      const spinner = createSpinner('Running saved report...');
      spinner.start();
      try {
        const report = getSavedReport(name);
        if (!report) {
          spinner.stop();
          error(`Report template "${name}" not found. Use \`adpilot reports list\` to see available templates.`);
          process.exit(1);
        }

        const accountId = opts.accountId || getAdAccountId();
        const datePreset = opts.datePreset || report.datePreset || 'last_7d';

        let endpoint: string;
        if (report.level === 'account' || !report.objectId) {
          endpoint = `${accountId}/insights`;
        } else {
          endpoint = `${report.objectId}/insights`;
        }

        const params: Record<string, any> = {
          fields: report.fields,
          date_preset: datePreset,
          limit: '50',
        };
        if (report.level !== 'account' && !report.objectId) {
          params.level = report.level;
        }
        if (report.breakdowns) {
          params.breakdowns = report.breakdowns;
        }

        const data = await apiGet(endpoint, params);
        spinner.stop();

        const rows = data.data || [];

        if (opts.csv) {
          const fieldList = report.fields.split(',');
          const csvHeaders = fieldList;
          const csvRows = rows.map((row: any) =>
            fieldList.map((f) => {
              const val = row[f.trim()];
              if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
              }
              return val ?? '';
            })
          );
          writeCsv(opts.csv, csvHeaders, csvRows);
          success(`Wrote ${csvRows.length} row(s) to ${opts.csv}`);
        } else if (opts.json) {
          output(rows, 'json');
        } else {
          if (rows.length === 0) {
            info('No data returned for this report.');
            return;
          }
          const fieldList = report.fields.split(',').map((f) => f.trim());
          const headers = fieldList;
          const tableRows = rows.map((row: any) =>
            fieldList.map((f) => {
              const val = row[f];
              if (typeof val === 'object' && val !== null) {
                if (Array.isArray(val)) {
                  return val
                    .slice(0, 3)
                    .map((a: any) => `${a.action_type}: ${a.value}`)
                    .join(', ');
                }
                return JSON.stringify(val);
              }
              return val ?? '-';
            })
          );
          printTable(headers, tableRows, `Report: ${report.name}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // reports delete <name>
  reports
    .command('delete <name>')
    .description('Delete a saved report template')
    .action(async (name) => {
      try {
        const deleted = deleteReport(name);
        if (deleted) {
          success(`Report template "${name}" deleted.`);
        } else {
          error(`Report template "${name}" not found.`);
          process.exit(1);
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // reports compare
  reports
    .command('compare')
    .description('Compare metrics across two time periods')
    .requiredOption('--level <level>', 'Insight level: account, campaign, adset, ad')
    .option('--object-id <id>', 'Object ID (required for campaign/adset/ad levels)')
    .requiredOption('--period1 <since,until>', 'First period: YYYY-MM-DD,YYYY-MM-DD')
    .requiredOption('--period2 <since,until>', 'Second period: YYYY-MM-DD,YYYY-MM-DD')
    .option('--fields <fields>', 'Metrics to compare', DEFAULT_COMPARE_FIELDS)
    .option('--account-id <id>', 'Ad account ID')
    .option('--csv <file>', 'Export to CSV')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching comparative data...');
      spinner.start();
      try {
        const validLevels = ['account', 'campaign', 'adset', 'ad'];
        if (!validLevels.includes(opts.level)) {
          spinner.stop();
          error(`Invalid level "${opts.level}". Must be one of: ${validLevels.join(', ')}`);
          process.exit(1);
        }

        // Parse periods
        const [since1, until1] = parsePeriod(opts.period1);
        const [since2, until2] = parsePeriod(opts.period2);

        const accountId = opts.accountId || getAdAccountId();
        let endpoint: string;
        if (opts.level === 'account' || !opts.objectId) {
          endpoint = `${accountId}/insights`;
        } else {
          endpoint = `${opts.objectId}/insights`;
        }

        const fields = opts.fields;
        const baseParams: Record<string, any> = { fields, limit: '1' };
        if (opts.level !== 'account' && !opts.objectId) {
          baseParams.level = opts.level;
        }

        // Fetch both periods
        const [data1, data2] = await Promise.all([
          apiGet(endpoint, {
            ...baseParams,
            time_range: { since: since1, until: until1 },
          }),
          apiGet(endpoint, {
            ...baseParams,
            time_range: { since: since2, until: until2 },
          }),
        ]);

        spinner.stop();

        const row1 = data1.data?.[0] || {};
        const row2 = data2.data?.[0] || {};
        const fieldList = fields.split(',').map((f: string) => f.trim());

        // Build comparison data
        const comparison: ComparisonEntry[] = fieldList.map((metric: string) => {
          const val1 = parseMetricValue(row1[metric]);
          const val2 = parseMetricValue(row2[metric]);
          const absoluteChange = val2 - val1;
          const pctChange = val1 !== 0 ? ((val2 - val1) / val1) * 100 : val2 !== 0 ? 100 : 0;

          return {
            metric,
            period1: val1,
            period2: val2,
            absoluteChange,
            pctChange,
          };
        });

        if (opts.json) {
          output(
            comparison.map((c) => ({
              metric: c.metric,
              period1: c.period1,
              period2: c.period2,
              change: c.absoluteChange,
              change_pct: Math.round(c.pctChange * 100) / 100,
            })),
            'json'
          );
          return;
        }

        if (opts.csv) {
          const csvHeaders = ['Metric', 'Period 1', 'Period 2', 'Change', 'Change %'];
          const csvRows = comparison.map((c) => [
            c.metric,
            c.period1.toString(),
            c.period2.toString(),
            c.absoluteChange.toFixed(2),
            `${c.pctChange.toFixed(2)}%`,
          ]);
          writeCsv(opts.csv, csvHeaders, csvRows);
          success(`Wrote ${csvRows.length} row(s) to ${opts.csv}`);
          return;
        }

        // Display table with color coding
        const headers = ['Metric', `Period 1`, `Period 2`, 'Change', 'Change %'];
        const rows = comparison.map((c) => {
          const changeStr = formatChange(c.absoluteChange);
          const pctStr = `${c.pctChange >= 0 ? '+' : ''}${c.pctChange.toFixed(2)}%`;
          const coloredChange = colorizeChange(c.metric, c.absoluteChange, changeStr);
          const coloredPct = colorizeChange(c.metric, c.absoluteChange, pctStr);

          return [
            c.metric,
            formatMetricDisplay(c.period1),
            formatMetricDisplay(c.period2),
            coloredChange,
            coloredPct,
          ];
        });

        const title = `Comparison: ${since1} to ${until1}  vs  ${since2} to ${until2}`;
        printTable(headers, rows, title);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // ── reports async ──────────────────────────────────────────────────────
  reports
    .command('async')
    .description('Request a large async insights report')
    .requiredOption('--level <level>', 'Aggregation level: account, campaign, adset, ad')
    .requiredOption('--fields <fields>', 'Comma-separated metrics')
    .option('--date-preset <preset>', 'Date preset')
    .option('--since <date>', 'Start date (YYYY-MM-DD)')
    .option('--until <date>', 'End date (YYYY-MM-DD)')
    .option('--breakdowns <breakdowns>', 'Comma-separated breakdowns')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Requesting async report...');
      spinner.start();
      try {
        const validLevels = ['account', 'campaign', 'adset', 'ad'];
        if (!validLevels.includes(opts.level)) {
          spinner.stop();
          error(`Invalid level "${opts.level}". Must be one of: ${validLevels.join(', ')}`);
          process.exit(1);
          return;
        }

        const accountId = opts.accountId || getAdAccountId();

        const body: Record<string, any> = {
          fields: opts.fields,
          level: opts.level,
          is_async: true,
        };

        if (opts.since && opts.until) {
          body.time_range = JSON.stringify({ since: opts.since, until: opts.until });
        } else if (opts.datePreset) {
          body.date_preset = opts.datePreset;
        }

        if (opts.breakdowns) {
          body.breakdowns = opts.breakdowns;
        }

        const data = await apiPost(`${accountId}/insights`, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          const reportRunId = data.report_run_id || data.id;
          if (reportRunId) {
            success(`Async report requested. Report Run ID: ${reportRunId}`);
            info(`Check status: adpilot reports async-status ${reportRunId}`);
            info(`Wait & download: adpilot reports async-wait ${reportRunId}`);
          } else {
            warn('Report request submitted but no report_run_id was returned.');
            output(data, 'json');
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // ── reports async-status ───────────────────────────────────────────────
  reports
    .command('async-status <reportRunId>')
    .description('Check the status of an async report')
    .option('--json', 'Output as JSON')
    .action(async (reportRunId, opts) => {
      const spinner = createSpinner('Checking report status...');
      spinner.start();
      try {
        const data = await apiGet(reportRunId, {
          fields: 'id,async_status,async_percent_completion,date_start,date_stop',
        });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          const statusStr = data.async_status || 'Unknown';
          const pct = data.async_percent_completion ?? '-';

          let coloredStatus: string;
          switch (statusStr) {
            case 'Job Completed':
              coloredStatus = chalk.green(statusStr);
              break;
            case 'Job Failed':
            case 'Job Skipped':
              coloredStatus = chalk.red(statusStr);
              break;
            case 'Job Running':
            case 'Job Started':
              coloredStatus = chalk.yellow(statusStr);
              break;
            default:
              coloredStatus = chalk.gray(statusStr);
          }

          printRecord(
            {
              'Report Run ID': data.id || reportRunId,
              'Status': coloredStatus,
              'Completion': `${pct}%`,
              'Date Start': data.date_start || '-',
              'Date Stop': data.date_stop || '-',
            },
            'Async Report Status'
          );

          if (statusStr === 'Job Completed') {
            info(`Download: adpilot reports async-download ${reportRunId}`);
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // ── reports async-download ─────────────────────────────────────────────
  reports
    .command('async-download <reportRunId>')
    .description('Download the results of a completed async report')
    .option('--csv <file>', 'Export to CSV file')
    .option('--json', 'Output as JSON')
    .action(async (reportRunId, opts) => {
      const spinner = createSpinner('Downloading async report...');
      spinner.start();
      try {
        const allResults = await fetchAllPages(
          `${reportRunId}/insights`,
          { limit: 500 },
          50
        );
        spinner.stop();

        if (allResults.length === 0) {
          warn('Report returned no data.');
          return;
        }

        if (opts.csv) {
          const fieldKeys = Object.keys(allResults[0]);
          const csvHeaders = fieldKeys;
          const csvRows = allResults.map((row: any) =>
            fieldKeys.map((f) => {
              const val = row[f];
              if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
              }
              return val ?? '';
            })
          );
          writeCsv(opts.csv, csvHeaders, csvRows);
          success(`Wrote ${csvRows.length} row(s) to ${opts.csv}`);
        } else if (opts.json) {
          output(allResults, 'json');
        } else {
          const fieldKeys = Object.keys(allResults[0]);
          const tableRows = allResults.map((row: any) =>
            fieldKeys.map((f) => {
              const val = row[f];
              if (typeof val === 'object' && val !== null) {
                if (Array.isArray(val)) {
                  return val
                    .slice(0, 3)
                    .map((a: any) => `${a.action_type}: ${a.value}`)
                    .join(', ');
                }
                return JSON.stringify(val);
              }
              return val ?? '-';
            })
          );
          printTable(fieldKeys, tableRows, `Async Report Results (${allResults.length} rows)`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // ── reports async-wait ─────────────────────────────────────────────────
  reports
    .command('async-wait <reportRunId>')
    .description('Poll for async report completion and then download results')
    .option('--timeout <seconds>', 'Max wait time in seconds', '300')
    .option('--csv <file>', 'Export to CSV file')
    .option('--json', 'Output as JSON')
    .action(async (reportRunId, opts) => {
      const timeout = parseInt(opts.timeout, 10) * 1000;
      const pollInterval = 5000; // 5 seconds
      const startTime = Date.now();

      const spinner = createSpinner('Waiting for async report to complete...');
      spinner.start();

      try {
        let completed = false;
        let lastStatus = '';

        while (Date.now() - startTime < timeout) {
          const data = await apiGet(reportRunId, {
            fields: 'id,async_status,async_percent_completion',
          });

          const status = data.async_status || 'Unknown';
          const pct = data.async_percent_completion ?? 0;

          if (status !== lastStatus) {
            spinner.text = `Report status: ${status} (${pct}%)`;
            lastStatus = status;
          }

          if (status === 'Job Completed') {
            completed = true;
            break;
          }

          if (status === 'Job Failed' || status === 'Job Skipped') {
            spinner.stop();
            error(`Report ${status.toLowerCase()}. Report Run ID: ${reportRunId}`);
            process.exit(1);
            return;
          }

          // Wait before next poll
          await new Promise((resolve) => setTimeout(resolve, pollInterval));
        }

        if (!completed) {
          spinner.stop();
          error(`Timed out after ${opts.timeout}s. Report may still be processing.`);
          info(`Check status: adpilot reports async-status ${reportRunId}`);
          process.exit(1);
          return;
        }

        spinner.text = 'Downloading report results...';

        const allResults = await fetchAllPages(
          `${reportRunId}/insights`,
          { limit: 500 },
          50
        );
        spinner.stop();

        if (allResults.length === 0) {
          warn('Report completed but returned no data.');
          return;
        }

        success(`Report completed. ${allResults.length} row(s) returned.`);

        if (opts.csv) {
          const fieldKeys = Object.keys(allResults[0]);
          const csvHeaders = fieldKeys;
          const csvRows = allResults.map((row: any) =>
            fieldKeys.map((f) => {
              const val = row[f];
              if (typeof val === 'object' && val !== null) {
                return JSON.stringify(val);
              }
              return val ?? '';
            })
          );
          writeCsv(opts.csv, csvHeaders, csvRows);
          success(`Wrote ${csvRows.length} row(s) to ${opts.csv}`);
        } else if (opts.json) {
          output(allResults, 'json');
        } else {
          const fieldKeys = Object.keys(allResults[0]);
          const tableRows = allResults.map((row: any) =>
            fieldKeys.map((f) => {
              const val = row[f];
              if (typeof val === 'object' && val !== null) {
                if (Array.isArray(val)) {
                  return val
                    .slice(0, 3)
                    .map((a: any) => `${a.action_type}: ${a.value}`)
                    .join(', ');
                }
                return JSON.stringify(val);
              }
              return val ?? '-';
            })
          );
          printTable(fieldKeys, tableRows, `Async Report Results (${allResults.length} rows)`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}

function parsePeriod(period: string): [string, string] {
  const parts = period.split(',');
  if (parts.length !== 2) {
    throw new Error(
      `Invalid period format "${period}". Expected YYYY-MM-DD,YYYY-MM-DD`
    );
  }
  const [since, until] = parts.map((p) => p.trim());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
    throw new Error(
      `Invalid date format in period "${period}". Expected YYYY-MM-DD,YYYY-MM-DD`
    );
  }
  return [since, until];
}

function parseMetricValue(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? 0 : parsed;
  }
  // For complex objects like actions, return 0
  return 0;
}

function formatChange(val: number): string {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(2)}`;
}

function formatMetricDisplay(val: number): string {
  if (Number.isInteger(val)) return val.toLocaleString();
  return val.toFixed(2);
}

function colorizeChange(metric: string, change: number, display: string): string {
  if (change === 0) return chalk.gray(display);

  if (HIGHER_IS_BETTER.has(metric)) {
    return change > 0 ? chalk.green(display) : chalk.red(display);
  }
  if (LOWER_IS_BETTER.has(metric)) {
    return change < 0 ? chalk.green(display) : chalk.red(display);
  }
  // Neutral
  return chalk.yellow(display);
}

function truncateStr(str: string, max: number): string {
  if (!str) return '-';
  return str.length > max ? str.substring(0, max - 1) + '...' : str;
}
