import { Command } from 'commander';
import { apiGet } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { output, printTable, error, success, writeCsv } from '../utils/output';
import {
  createSpinner,
  formatBudget,
  truncate,
  buildFieldsParam,
  DATE_PRESETS,
} from '../utils/helpers';

const DEFAULT_METRICS = [
  'campaign_name',
  'adset_name',
  'ad_name',
  'impressions',
  'clicks',
  'spend',
  'cpc',
  'cpm',
  'ctr',
  'reach',
  'frequency',
  'actions',
  'cost_per_action_type',
];

const BREAKDOWN_OPTIONS = [
  'age',
  'gender',
  'country',
  'region',
  'dma',
  'impression_device',
  'platform_position',
  'publisher_platform',
  'device_platform',
  'product_id',
  'hourly_stats_aggregated_by_advertiser_time_zone',
];

export function registerInsightsCommands(program: Command): void {
  const insights = program
    .command('insights')
    .alias('report')
    .description('Fetch performance insights and reports');

  // ACCOUNT INSIGHTS
  insights
    .command('account')
    .description('Get account-level insights')
    .option('--account-id <id>', 'Ad account ID')
    .option('--fields <fields>', 'Comma-separated metrics')
    .option(
      '--date-preset <preset>',
      `Date preset: ${DATE_PRESETS.join(', ')}`,
      'last_7d'
    )
    .option('--since <date>', 'Start date (YYYY-MM-DD)')
    .option('--until <date>', 'End date (YYYY-MM-DD)')
    .option('--breakdowns <breakdowns>', 'Comma-separated breakdowns')
    .option('--level <level>', 'Aggregation: account, campaign, adset, ad', 'account')
    .option('--limit <n>', 'Max results', '50')
    .option('--json', 'Output as JSON')
    .option('--csv <filename>', 'Export results to CSV file')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching insights...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const fields = buildFieldsParam(opts.fields, [
          'impressions',
          'clicks',
          'spend',
          'cpc',
          'cpm',
          'ctr',
          'reach',
          'frequency',
          'actions',
        ]);

        const params: Record<string, any> = {
          fields,
          level: opts.level,
          limit: opts.limit,
        };

        if (opts.since && opts.until) {
          params.time_range = { since: opts.since, until: opts.until };
        } else {
          params.date_preset = opts.datePreset;
        }

        if (opts.breakdowns) params.breakdowns = opts.breakdowns;

        const data = await apiGet(`${accountId}/insights`, params);
        spinner.stop();

        if (opts.csv) {
          const { headers, rows } = buildInsightsCsvData(data.data || [], opts.level);
          writeCsv(opts.csv, headers, rows);
          success(`Wrote ${rows.length} row(s) to ${opts.csv}`);
        } else if (opts.json) {
          output(data.data, 'json');
        } else {
          formatInsightsTable(data.data || [], opts.level);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // CAMPAIGN INSIGHTS
  insights
    .command('campaign <campaignId>')
    .description('Get campaign-level insights')
    .option('--fields <fields>', 'Comma-separated metrics')
    .option('--date-preset <preset>', 'Date preset', 'last_7d')
    .option('--since <date>', 'Start date (YYYY-MM-DD)')
    .option('--until <date>', 'End date (YYYY-MM-DD)')
    .option('--breakdowns <breakdowns>', 'Comma-separated breakdowns')
    .option('--limit <n>', 'Max results', '50')
    .option('--json', 'Output as JSON')
    .option('--csv <filename>', 'Export results to CSV file')
    .action(async (campaignId, opts) => {
      const spinner = createSpinner('Fetching campaign insights...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'campaign_name',
          'impressions',
          'clicks',
          'spend',
          'cpc',
          'cpm',
          'ctr',
          'reach',
          'frequency',
          'actions',
        ]);

        const params: Record<string, any> = { fields, limit: opts.limit };
        if (opts.since && opts.until) {
          params.time_range = { since: opts.since, until: opts.until };
        } else {
          params.date_preset = opts.datePreset;
        }
        if (opts.breakdowns) params.breakdowns = opts.breakdowns;

        const data = await apiGet(`${campaignId}/insights`, params);
        spinner.stop();

        if (opts.csv) {
          const { headers, rows } = buildInsightsCsvData(data.data || [], 'campaign');
          writeCsv(opts.csv, headers, rows);
          success(`Wrote ${rows.length} row(s) to ${opts.csv}`);
        } else if (opts.json) {
          output(data.data, 'json');
        } else {
          formatInsightsTable(data.data || [], 'campaign');
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // ADSET INSIGHTS
  insights
    .command('adset <adSetId>')
    .description('Get ad set-level insights')
    .option('--fields <fields>', 'Comma-separated metrics')
    .option('--date-preset <preset>', 'Date preset', 'last_7d')
    .option('--since <date>', 'Start date (YYYY-MM-DD)')
    .option('--until <date>', 'End date (YYYY-MM-DD)')
    .option('--breakdowns <breakdowns>', 'Comma-separated breakdowns')
    .option('--limit <n>', 'Max results', '50')
    .option('--json', 'Output as JSON')
    .option('--csv <filename>', 'Export results to CSV file')
    .action(async (adSetId, opts) => {
      const spinner = createSpinner('Fetching ad set insights...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'adset_name',
          'impressions',
          'clicks',
          'spend',
          'cpc',
          'cpm',
          'ctr',
          'reach',
          'frequency',
          'actions',
        ]);

        const params: Record<string, any> = { fields, limit: opts.limit };
        if (opts.since && opts.until) {
          params.time_range = { since: opts.since, until: opts.until };
        } else {
          params.date_preset = opts.datePreset;
        }
        if (opts.breakdowns) params.breakdowns = opts.breakdowns;

        const data = await apiGet(`${adSetId}/insights`, params);
        spinner.stop();

        if (opts.csv) {
          const { headers, rows } = buildInsightsCsvData(data.data || [], 'adset');
          writeCsv(opts.csv, headers, rows);
          success(`Wrote ${rows.length} row(s) to ${opts.csv}`);
        } else if (opts.json) {
          output(data.data, 'json');
        } else {
          formatInsightsTable(data.data || [], 'adset');
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // AD INSIGHTS
  insights
    .command('ad <adId>')
    .description('Get ad-level insights')
    .option('--fields <fields>', 'Comma-separated metrics')
    .option('--date-preset <preset>', 'Date preset', 'last_7d')
    .option('--since <date>', 'Start date (YYYY-MM-DD)')
    .option('--until <date>', 'End date (YYYY-MM-DD)')
    .option('--breakdowns <breakdowns>', 'Comma-separated breakdowns')
    .option('--limit <n>', 'Max results', '50')
    .option('--json', 'Output as JSON')
    .option('--csv <filename>', 'Export results to CSV file')
    .action(async (adId, opts) => {
      const spinner = createSpinner('Fetching ad insights...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'ad_name',
          'impressions',
          'clicks',
          'spend',
          'cpc',
          'cpm',
          'ctr',
          'reach',
          'frequency',
          'actions',
        ]);

        const params: Record<string, any> = { fields, limit: opts.limit };
        if (opts.since && opts.until) {
          params.time_range = { since: opts.since, until: opts.until };
        } else {
          params.date_preset = opts.datePreset;
        }
        if (opts.breakdowns) params.breakdowns = opts.breakdowns;

        const data = await apiGet(`${adId}/insights`, params);
        spinner.stop();

        if (opts.csv) {
          const { headers, rows } = buildInsightsCsvData(data.data || [], 'ad');
          writeCsv(opts.csv, headers, rows);
          success(`Wrote ${rows.length} row(s) to ${opts.csv}`);
        } else if (opts.json) {
          output(data.data, 'json');
        } else {
          formatInsightsTable(data.data || [], 'ad');
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}

function formatInsightsTable(data: any[], level: string): void {
  if (data.length === 0) {
    console.log('No insights data available for the selected period.');
    return;
  }

  const nameField =
    level === 'campaign'
      ? 'campaign_name'
      : level === 'adset'
      ? 'adset_name'
      : level === 'ad'
      ? 'ad_name'
      : null;

  const headers = [
    ...(nameField ? ['Name'] : []),
    'Impressions',
    'Clicks',
    'Spend',
    'CPC',
    'CPM',
    'CTR',
    'Reach',
    'Frequency',
    'Date Range',
  ];

  const rows = data.map((row: any) => {
    const actions = row.actions
      ? row.actions
          .slice(0, 3)
          .map((a: any) => `${a.action_type}: ${a.value}`)
          .join(', ')
      : '-';

    return [
      ...(nameField ? [truncate(row[nameField] || '-', 25)] : []),
      row.impressions || '0',
      row.clicks || '0',
      row.spend ? `$${row.spend}` : '$0.00',
      row.cpc ? `$${row.cpc}` : '-',
      row.cpm ? `$${row.cpm}` : '-',
      row.ctr ? `${row.ctr}%` : '-',
      row.reach || '0',
      row.frequency || '-',
      row.date_start && row.date_stop
        ? `${row.date_start} - ${row.date_stop}`
        : '-',
    ];
  });

  printTable(headers, rows, `${level.charAt(0).toUpperCase() + level.slice(1)} Insights`);
}

function buildInsightsCsvData(
  data: any[],
  level: string
): { headers: string[]; rows: (string | number | undefined | null)[][] } {
  const nameField =
    level === 'campaign'
      ? 'campaign_name'
      : level === 'adset'
      ? 'adset_name'
      : level === 'ad'
      ? 'ad_name'
      : null;

  const headers = [
    ...(nameField ? ['Name'] : []),
    'Impressions',
    'Clicks',
    'Spend',
    'CPC',
    'CPM',
    'CTR',
    'Reach',
    'Frequency',
    'Actions',
    'Date Start',
    'Date Stop',
  ];

  const rows = data.map((row: any) => {
    const actions = row.actions
      ? row.actions
          .map((a: any) => `${a.action_type}: ${a.value}`)
          .join('; ')
      : '';

    return [
      ...(nameField ? [row[nameField] || ''] : []),
      row.impressions || '0',
      row.clicks || '0',
      row.spend || '0.00',
      row.cpc || '',
      row.cpm || '',
      row.ctr || '',
      row.reach || '0',
      row.frequency || '',
      actions,
      row.date_start || '',
      row.date_stop || '',
    ];
  });

  return { headers, rows };
}
