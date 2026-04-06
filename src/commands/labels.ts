import { Command } from 'commander';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { output, printTable, success, error } from '../utils/output';
import { createSpinner, formatDate } from '../utils/helpers';

export function registerLabelCommands(program: Command): void {
  const labels = program
    .command('labels')
    .alias('label')
    .description('Manage ad labels');

  // LIST
  labels
    .command('list')
    .alias('ls')
    .description('List ad labels in your ad account')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching labels...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const fields = 'id,name,created_time,updated_time';

        const data = await apiGet(`${accountId}/adlabels`, { fields });
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const rows = (data.data || []).map((l: any) => [
            l.id,
            l.name || '-',
            formatDate(l.created_time),
            formatDate(l.updated_time),
          ]);
          printTable(
            ['ID', 'Name', 'Created', 'Updated'],
            rows,
            'Ad Labels'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // CREATE
  labels
    .command('create')
    .description('Create a new ad label')
    .requiredOption('-n, --name <name>', 'Label name')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating label...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const body: Record<string, any> = {
          name: opts.name,
        };

        const data = await apiPost(`${accountId}/adlabels`, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Label created with ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  labels
    .command('delete <labelId>')
    .alias('rm')
    .description('Delete an ad label')
    .action(async (labelId) => {
      const spinner = createSpinner('Deleting label...');
      spinner.start();
      try {
        await apiDelete(labelId);
        spinner.stop();
        success(`Label ${labelId} deleted.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // ASSIGN
  labels
    .command('assign <labelId>')
    .description('Assign a label to a campaign, ad set, or ad')
    .requiredOption('--to <objectId>', 'Object ID to assign the label to')
    .requiredOption('--type <type>', 'Object type: campaign, adset, or ad')
    .action(async (labelId, opts) => {
      const spinner = createSpinner('Assigning label...');
      spinner.start();
      try {
        const validTypes = ['campaign', 'adset', 'ad'];
        if (!validTypes.includes(opts.type.toLowerCase())) {
          spinner.stop();
          error(`Invalid type "${opts.type}". Must be one of: ${validTypes.join(', ')}`);
          process.exit(1);
        }

        const body: Record<string, any> = {
          adlabels: [{ id: labelId }],
        };

        await apiPost(opts.to, body);
        spinner.stop();
        success(`Label ${labelId} assigned to ${opts.type} ${opts.to}.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // REMOVE
  labels
    .command('remove <labelId>')
    .description('Remove a label from a campaign, ad set, or ad')
    .requiredOption('--from <objectId>', 'Object ID to remove the label from')
    .action(async (labelId, opts) => {
      const spinner = createSpinner('Removing label...');
      spinner.start();
      try {
        await apiDelete(`${opts.from}/adlabels`, {
          adlabels: [{ id: labelId }],
        });
        spinner.stop();
        success(`Label ${labelId} removed from ${opts.from}.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
