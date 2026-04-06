import { Command } from 'commander';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { printTable, printRecord, printJson, success, error } from '../utils/output';
import { createSpinner, formatDate, truncate } from '../utils/helpers';

export function registerSplitsCommands(program: Command): void {
  const splits = program
    .command('splits')
    .alias('split')
    .description('A/B split testing (ad studies)');

  // CREATE
  splits
    .command('create')
    .description('Create an A/B split test (ad study)')
    .requiredOption('--name <name>', 'Test name')
    .option('--description <desc>', 'Test description')
    .option('--type <type>', 'SPLIT_TEST or CAMPAIGN_BUDGET_OPTIMIZATION', 'SPLIT_TEST')
    .option('--campaign-id <id>', 'Campaign to test (required for split test)')
    .requiredOption('--cells <json>', 'JSON array of test cells')
    .option('--confidence <pct>', 'Confidence level: 80, 90, 95', '95')
    .option('--start-time <datetime>', 'Start time (ISO 8601)')
    .option('--end-time <datetime>', 'End time (ISO 8601)')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating split test...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();

        let cells: any[];
        try {
          cells = JSON.parse(opts.cells);
        } catch {
          spinner.stop();
          error('Invalid JSON for --cells. Provide a valid JSON array.');
          process.exit(1);
          return;
        }

        if (!Array.isArray(cells)) {
          spinner.stop();
          error('--cells must be a JSON array.');
          process.exit(1);
          return;
        }

        const body: Record<string, any> = {
          name: opts.name,
          type: opts.type,
          confidence_level: parseInt(opts.confidence, 10),
          cells,
        };

        if (opts.description) body.description = opts.description;
        if (opts.campaignId) body.campaign_id = opts.campaignId;
        if (opts.startTime) body.start_time = opts.startTime;
        if (opts.endTime) body.end_time = opts.endTime;

        const data = await apiPost(`${accountId}/ad_studies`, body);
        spinner.stop();

        if (opts.json) {
          printJson(data);
        } else {
          success(`Split test created with ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // LIST
  splits
    .command('list')
    .alias('ls')
    .description('List A/B split tests (ad studies)')
    .option('--account-id <id>', 'Ad account ID')
    .option('--limit <n>', 'Max results', '25')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching split tests...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const fields = 'id,name,description,type,start_time,end_time,confidence_level,cells';

        const data = await apiGet(`${accountId}/ad_studies`, {
          fields,
          limit: opts.limit,
        });
        spinner.stop();

        if (opts.json) {
          printJson(data.data);
        } else {
          const rows = (data.data || []).map((s: any) => [
            s.id,
            truncate(s.name || '-', 30),
            s.type || '-',
            s.confidence_level != null ? `${s.confidence_level}%` : '-',
            formatDate(s.start_time),
            formatDate(s.end_time),
          ]);
          printTable(
            ['ID', 'Name', 'Type', 'Confidence', 'Start', 'End'],
            rows,
            'A/B Split Tests'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // GET
  splits
    .command('get <studyId>')
    .description('Get split test details')
    .option('--json', 'Output as JSON')
    .action(async (studyId, opts) => {
      const spinner = createSpinner('Fetching split test...');
      spinner.start();
      try {
        const fields = 'id,name,description,type,start_time,end_time,confidence_level,cells,results,winner_cell';
        const data = await apiGet(studyId, { fields });
        spinner.stop();

        if (opts.json) {
          printJson(data);
        } else {
          const cellSummary = (data.cells?.data || data.cells || []).map((c: any) =>
            `${c.name || c.id}: ${c.treatment_percentage ?? '-'}% traffic`
          );

          printRecord(
            {
              ID: data.id,
              Name: data.name || '-',
              Description: data.description || '-',
              Type: data.type || '-',
              'Confidence Level': data.confidence_level != null ? `${data.confidence_level}%` : '-',
              'Start Time': formatDate(data.start_time),
              'End Time': formatDate(data.end_time),
              Cells: cellSummary.length > 0 ? cellSummary.join('\n') : '-',
              'Winner Cell': data.winner_cell ? JSON.stringify(data.winner_cell) : 'Not determined yet',
            },
            'Split Test Details'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // RESULTS
  splits
    .command('results <studyId>')
    .description('Get split test results and winner')
    .option('--json', 'Output as JSON')
    .action(async (studyId, opts) => {
      const spinner = createSpinner('Fetching split test results...');
      spinner.start();
      try {
        const fields = 'id,name,type,confidence_level,cells,results,winner_cell';
        const data = await apiGet(studyId, { fields });
        spinner.stop();

        if (opts.json) {
          printJson(data);
        } else {
          // Header info
          printRecord(
            {
              ID: data.id,
              Name: data.name || '-',
              Type: data.type || '-',
              'Confidence Level': data.confidence_level != null ? `${data.confidence_level}%` : '-',
              Winner: data.winner_cell
                ? (data.winner_cell.name || data.winner_cell.id || JSON.stringify(data.winner_cell))
                : 'Not determined yet',
            },
            'Split Test Results'
          );

          // Cell performance table
          const cells = data.cells?.data || data.cells || [];
          if (cells.length > 0) {
            const rows = cells.map((c: any) => {
              const metrics = c.insights?.data?.[0] || c.results || {};
              const impressions = metrics.impressions ?? '-';
              const clicks = metrics.clicks ?? '-';
              const conversions = metrics.conversions ?? metrics.actions?.length ?? '-';
              const spend = metrics.spend ?? '-';
              const ctr = metrics.ctr ?? (
                impressions !== '-' && clicks !== '-' && Number(impressions) > 0
                  ? `${((Number(clicks) / Number(impressions)) * 100).toFixed(2)}%`
                  : '-'
              );
              const cpc = metrics.cpc ?? (
                clicks !== '-' && spend !== '-' && Number(clicks) > 0
                  ? `$${(Number(spend) / Number(clicks)).toFixed(2)}`
                  : '-'
              );
              return [
                c.name || c.id || '-',
                `${c.treatment_percentage ?? '-'}%`,
                String(impressions),
                String(clicks),
                String(conversions),
                typeof spend === 'number' || typeof spend === 'string' && spend !== '-'
                  ? `$${spend}` : '-',
                String(ctr),
                String(cpc),
              ];
            });
            printTable(
              ['Cell', 'Traffic', 'Impressions', 'Clicks', 'Conversions', 'Spend', 'CTR', 'CPC'],
              rows,
              'Per-Cell Metrics'
            );
          }

          // Statistical significance
          if (data.results) {
            printRecord(
              {
                'Statistical Significance': data.results.significance ?? '-',
                'Winning Direction': data.results.winner_direction ?? '-',
                Details: JSON.stringify(data.results, null, 2),
              },
              'Statistical Significance'
            );
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  splits
    .command('delete <studyId>')
    .alias('rm')
    .description('Delete a split test (ad study)')
    .action(async (studyId) => {
      const spinner = createSpinner('Deleting split test...');
      spinner.start();
      try {
        await apiDelete(studyId);
        spinner.stop();
        success(`Split test ${studyId} deleted.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // QUICK-AB
  splits
    .command('quick-ab')
    .description('Quick A/B test setup from two ad sets')
    .requiredOption('--name <name>', 'Test name')
    .requiredOption('--adset-a <id>', 'First ad set ID')
    .requiredOption('--adset-b <id>', 'Second ad set ID')
    .option('--split <a_pct,b_pct>', 'Traffic split (default: 50,50)', '50,50')
    .option('--duration <days>', 'Test duration in days', '7')
    .option('--confidence <pct>', 'Confidence level: 80, 90, 95', '95')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating quick A/B test...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();

        // Parse split percentages
        const splitParts = opts.split.split(',').map((s: string) => parseInt(s.trim(), 10));
        if (splitParts.length !== 2 || splitParts.some((p: number) => isNaN(p)) || splitParts[0] + splitParts[1] !== 100) {
          spinner.stop();
          error('--split must be two comma-separated percentages that sum to 100 (e.g. 50,50 or 70,30).');
          process.exit(1);
          return;
        }

        const durationDays = parseInt(opts.duration, 10);
        if (isNaN(durationDays) || durationDays < 1) {
          spinner.stop();
          error('--duration must be a positive number of days.');
          process.exit(1);
          return;
        }

        const startTime = new Date().toISOString();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + durationDays);
        const endTime = endDate.toISOString();

        const cells = [
          {
            name: 'Cell A',
            treatment_percentage: splitParts[0],
            adsets: [{ id: opts.adsetA }],
          },
          {
            name: 'Cell B',
            treatment_percentage: splitParts[1],
            adsets: [{ id: opts.adsetB }],
          },
        ];

        const body: Record<string, any> = {
          name: opts.name,
          type: 'SPLIT_TEST',
          confidence_level: parseInt(opts.confidence, 10),
          start_time: startTime,
          end_time: endTime,
          cells,
        };

        const data = await apiPost(`${accountId}/ad_studies`, body);
        spinner.stop();

        if (opts.json) {
          printJson(data);
        } else {
          success(`Quick A/B test created with ID: ${data.id}`);
          printRecord(
            {
              ID: data.id,
              Name: opts.name,
              'Ad Set A': `${opts.adsetA} (${splitParts[0]}%)`,
              'Ad Set B': `${opts.adsetB} (${splitParts[1]}%)`,
              Duration: `${durationDays} days`,
              Confidence: `${opts.confidence}%`,
              Start: formatDate(startTime),
              End: formatDate(endTime),
            },
            'A/B Test Configuration'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
