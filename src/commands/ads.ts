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
import { statusColor } from '../utils/output';

export function registerAdCommands(program: Command): void {
  const ads = program.command('ads').alias('ad').description('Manage ads');

  // LIST
  ads
    .command('list')
    .alias('ls')
    .description('List ads')
    .option('--account-id <id>', 'Ad account ID')
    .option('--campaign-id <id>', 'Filter by campaign')
    .option('--adset-id <id>', 'Filter by ad set')
    .option('--status <status>', 'Filter by effective_status')
    .option('--limit <n>', 'Max results', '25')
    .option('--fields <fields>', 'Comma-separated fields')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching ads...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'id',
          'name',
          'adset_id',
          'campaign_id',
          'status',
          'effective_status',
          'created_time',
          'updated_time',
        ]);

        const params: Record<string, any> = { fields, limit: opts.limit };
        if (opts.status) {
          params.filtering = [
            { field: 'effective_status', operator: 'IN', value: opts.status.split(',') },
          ];
        }

        let endpoint: string;
        if (opts.adsetId) {
          endpoint = `${opts.adsetId}/ads`;
        } else if (opts.campaignId) {
          endpoint = `${opts.campaignId}/ads`;
        } else {
          endpoint = `${opts.accountId || getAdAccountId()}/ads`;
        }

        const data = await apiGet(endpoint, params);
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const rows = (data.data || []).map((a: any) => [
            a.id,
            truncate(a.name, 25),
            a.adset_id || '-',
            a.campaign_id || '-',
            statusColor(a.effective_status || a.status),
            formatDate(a.created_time),
          ]);
          printTable(
            ['ID', 'Name', 'Ad Set', 'Campaign', 'Status', 'Created'],
            rows,
            'Ads'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // GET
  ads
    .command('get <adId>')
    .description('Get ad details')
    .option('--fields <fields>', 'Comma-separated fields')
    .option('--json', 'Output as JSON')
    .action(async (adId, opts) => {
      const spinner = createSpinner('Fetching ad...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'id',
          'name',
          'adset_id',
          'campaign_id',
          'status',
          'effective_status',
          'creative',
          'tracking_specs',
          'conversion_specs',
          'bid_type',
          'ad_review_feedback',
          'created_time',
          'updated_time',
        ]);
        const data = await apiGet(adId, { fields });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          printRecord(
            {
              id: data.id,
              name: data.name,
              adSetId: data.adset_id,
              campaignId: data.campaign_id,
              status: data.status,
              effectiveStatus: data.effective_status,
              creative: data.creative,
              bidType: data.bid_type || '-',
              reviewFeedback: data.ad_review_feedback,
              trackingSpecs: data.tracking_specs,
              conversionSpecs: data.conversion_specs,
              created: formatDate(data.created_time),
              updated: formatDate(data.updated_time),
            },
            'Ad Details'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // CREATE
  ads
    .command('create')
    .description('Create a new ad')
    .requiredOption('-n, --name <name>', 'Ad name')
    .requiredOption('--adset-id <id>', 'Ad set ID')
    .requiredOption('--creative <json>', 'Creative spec as JSON (or {"creative_id":"XXX"})')
    .option('--status <status>', 'ACTIVE or PAUSED', 'PAUSED')
    .option('--tracking-specs <json>', 'Tracking specs as JSON')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating ad...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const body: Record<string, any> = {
          name: opts.name,
          adset_id: opts.adsetId,
          creative: opts.creative,
          status: opts.status,
        };

        if (opts.trackingSpecs) body.tracking_specs = opts.trackingSpecs;

        const data = await apiPost(`${accountId}/ads`, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Ad created with ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // UPDATE
  ads
    .command('update <adId>')
    .description('Update an ad')
    .option('-n, --name <name>', 'Ad name')
    .option('--status <status>', 'ACTIVE, PAUSED, ARCHIVED, or DELETED')
    .option('--creative <json>', 'Creative spec as JSON')
    .option('--tracking-specs <json>', 'Tracking specs as JSON')
    .option('--json', 'Output as JSON')
    .action(async (adId, opts) => {
      const spinner = createSpinner('Updating ad...');
      spinner.start();
      try {
        const body: Record<string, any> = {};
        if (opts.name) body.name = opts.name;
        if (opts.status) body.status = opts.status;
        if (opts.creative) body.creative = opts.creative;
        if (opts.trackingSpecs) body.tracking_specs = opts.trackingSpecs;

        if (Object.keys(body).length === 0) {
          spinner.stop();
          error('No fields to update.');
          process.exit(1);
        }

        const data = await apiPost(adId, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Ad ${adId} updated.`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // PAUSE
  ads
    .command('pause <adId>')
    .description('Pause an ad')
    .action(async (adId) => {
      const spinner = createSpinner('Pausing ad...');
      spinner.start();
      try {
        await apiPost(adId, { status: 'PAUSED' });
        spinner.stop();
        success(`Ad ${adId} paused.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // RESUME
  ads
    .command('resume <adId>')
    .alias('activate')
    .description('Resume/activate an ad')
    .action(async (adId) => {
      const spinner = createSpinner('Resuming ad...');
      spinner.start();
      try {
        await apiPost(adId, { status: 'ACTIVE' });
        spinner.stop();
        success(`Ad ${adId} activated.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  ads
    .command('delete <adId>')
    .alias('rm')
    .description('Delete an ad')
    .action(async (adId) => {
      const spinner = createSpinner('Deleting ad...');
      spinner.start();
      try {
        await apiDelete(adId);
        spinner.stop();
        success(`Ad ${adId} deleted.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // PREVIEW
  ads
    .command('preview <adId>')
    .description('Get ad preview')
    .option('--format <format>', 'Ad format (DESKTOP_FEED_STANDARD, MOBILE_FEED_STANDARD, etc.)', 'DESKTOP_FEED_STANDARD')
    .option('--json', 'Output as JSON')
    .action(async (adId, opts) => {
      const spinner = createSpinner('Generating preview...');
      spinner.start();
      try {
        const data = await apiGet(`${adId}/previews`, {
          ad_format: opts.format,
        });
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const previews = data.data || [];
          for (const preview of previews) {
            console.log(preview.body);
          }
          if (previews.length === 0) {
            error('No preview available.');
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
