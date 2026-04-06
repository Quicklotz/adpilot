import { Command } from 'commander';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { output, printRecord, printTable, success, error } from '../utils/output';
import {
  createSpinner,
  formatDate,
  truncate,
  buildFieldsParam,
} from '../utils/helpers';

const AUDIENCE_SUBTYPES = [
  'CUSTOM',
  'WEBSITE',
  'APP_USERS',
  'OFFLINE_CONVERSION',
  'LOOKALIKE',
  'ENGAGEMENT',
] as const;

export function registerAudienceCommands(program: Command): void {
  const audiences = program
    .command('audiences')
    .alias('audience')
    .description('Manage custom audiences');

  // LIST
  audiences
    .command('list')
    .alias('ls')
    .description('List custom audiences in your ad account')
    .option('--account-id <id>', 'Ad account ID')
    .option('--limit <n>', 'Max results', '25')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching audiences...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const fields = 'id,name,description,subtype,approximate_count,delivery_status,operation_status,time_created,time_updated';

        const data = await apiGet(`${accountId}/customaudiences`, {
          fields,
          limit: opts.limit,
        });
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const rows = (data.data || []).map((a: any) => [
            a.id,
            truncate(a.name || '-', 30),
            a.subtype || '-',
            a.approximate_count != null ? Number(a.approximate_count).toLocaleString() : '-',
            a.operation_status?.status || a.delivery_status?.status || '-',
            formatDate(a.time_created),
          ]);
          printTable(
            ['ID', 'Name', 'Subtype', 'Approx Size', 'Status', 'Created'],
            rows,
            'Custom Audiences'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // GET
  audiences
    .command('get <audienceId>')
    .description('Get audience details')
    .option('--fields <fields>', 'Comma-separated fields')
    .option('--json', 'Output as JSON')
    .action(async (audienceId, opts) => {
      const spinner = createSpinner('Fetching audience...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'id',
          'name',
          'description',
          'subtype',
          'approximate_count',
          'delivery_status',
          'operation_status',
          'rule',
          'lookalike_spec',
          'data_source',
          'customer_file_source',
          'retention_days',
          'time_created',
          'time_updated',
        ]);
        const data = await apiGet(audienceId, { fields });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          printRecord(
            {
              id: data.id,
              name: data.name,
              description: data.description || '-',
              subtype: data.subtype || '-',
              approximateCount: data.approximate_count != null
                ? Number(data.approximate_count).toLocaleString()
                : '-',
              deliveryStatus: data.delivery_status,
              operationStatus: data.operation_status,
              rule: data.rule,
              lookalikeSpec: data.lookalike_spec,
              dataSource: data.data_source,
              customerFileSource: data.customer_file_source || '-',
              retentionDays: data.retention_days || '-',
              created: formatDate(data.time_created),
              updated: formatDate(data.time_updated),
            },
            'Audience Details'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // CREATE
  audiences
    .command('create')
    .description('Create a new custom audience')
    .requiredOption('-n, --name <name>', 'Audience name')
    .option('-d, --description <desc>', 'Audience description')
    .requiredOption(
      '--subtype <subtype>',
      `Audience subtype: ${AUDIENCE_SUBTYPES.join(', ')}`
    )
    .option('--customer-file-source <source>', 'Customer file source (e.g. USER_PROVIDED_ONLY, PARTNER_PROVIDED_ONLY, BOTH_USER_AND_PARTNER_PROVIDED)')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating audience...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const body: Record<string, any> = {
          name: opts.name,
          subtype: opts.subtype,
        };

        if (opts.description) body.description = opts.description;
        if (opts.customerFileSource) body.customer_file_source = opts.customerFileSource;

        const data = await apiPost(`${accountId}/customaudiences`, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Audience created with ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // CREATE-LOOKALIKE
  audiences
    .command('create-lookalike')
    .description('Create a lookalike audience from a source audience')
    .requiredOption('--source-audience <id>', 'Source audience ID')
    .requiredOption('--countries <codes>', 'Comma-separated country codes (e.g. US,GB)')
    .option('--ratio <ratio>', 'Lookalike ratio (0.01 to 0.20)', '0.01')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating lookalike audience...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const countries = opts.countries.split(',').map((c: string) => c.trim().toUpperCase());
        const ratio = parseFloat(opts.ratio);

        if (ratio < 0.01 || ratio > 0.20) {
          spinner.stop();
          error('Ratio must be between 0.01 and 0.20.');
          process.exit(1);
        }

        const body: Record<string, any> = {
          name: `Lookalike - ${opts.sourceAudience} - ${countries.join(',')}`,
          subtype: 'LOOKALIKE',
          origin_audience_id: opts.sourceAudience,
          lookalike_spec: {
            type: 'similarity',
            country: countries[0],
            ratio,
          },
        };

        const data = await apiPost(`${accountId}/customaudiences`, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Lookalike audience created with ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  audiences
    .command('delete <audienceId>')
    .alias('rm')
    .description('Delete a custom audience')
    .action(async (audienceId) => {
      const spinner = createSpinner('Deleting audience...');
      spinner.start();
      try {
        await apiDelete(audienceId);
        spinner.stop();
        success(`Audience ${audienceId} deleted.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
