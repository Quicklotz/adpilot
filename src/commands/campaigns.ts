import { Command } from 'commander';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { getAdAccountId, getConfig } from '../lib/config';
import { output, printRecord, printTable, success, error } from '../utils/output';
import {
  createSpinner,
  formatBudget,
  formatDate,
  truncate,
  buildFieldsParam,
  CAMPAIGN_OBJECTIVES,
  SPECIAL_AD_CATEGORIES,
  BID_STRATEGIES,
} from '../utils/helpers';
import { statusColor } from '../utils/output';

export function registerCampaignCommands(program: Command): void {
  const campaigns = program
    .command('campaigns')
    .alias('campaign')
    .alias('camp')
    .description('Manage ad campaigns');

  // LIST
  campaigns
    .command('list')
    .alias('ls')
    .description('List campaigns in your ad account')
    .option('--account-id <id>', 'Ad account ID')
    .option('--status <status>', 'Filter by effective_status (ACTIVE,PAUSED,...)')
    .option('--limit <n>', 'Max results', '25')
    .option('--fields <fields>', 'Comma-separated fields to return')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching campaigns...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const fields = buildFieldsParam(opts.fields, [
          'id',
          'name',
          'objective',
          'status',
          'effective_status',
          'daily_budget',
          'lifetime_budget',
          'budget_remaining',
          'created_time',
        ]);

        const params: Record<string, any> = { fields, limit: opts.limit };
        if (opts.status) {
          params.filtering = [
            { field: 'effective_status', operator: 'IN', value: opts.status.split(',') },
          ];
        }

        const data = await apiGet(`${accountId}/campaigns`, params);
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const rows = (data.data || []).map((c: any) => [
            c.id,
            truncate(c.name, 30),
            c.objective || '-',
            statusColor(c.effective_status || c.status),
            formatBudget(c.daily_budget),
            formatBudget(c.lifetime_budget),
            formatBudget(c.budget_remaining),
          ]);
          printTable(
            ['ID', 'Name', 'Objective', 'Status', 'Daily $', 'Lifetime $', 'Remaining $'],
            rows,
            'Campaigns'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // GET
  campaigns
    .command('get <campaignId>')
    .description('Get campaign details')
    .option('--fields <fields>', 'Comma-separated fields')
    .option('--json', 'Output as JSON')
    .action(async (campaignId, opts) => {
      const spinner = createSpinner('Fetching campaign...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'id',
          'name',
          'objective',
          'status',
          'effective_status',
          'daily_budget',
          'lifetime_budget',
          'budget_remaining',
          'spend_cap',
          'bid_strategy',
          'buying_type',
          'special_ad_categories',
          'start_time',
          'stop_time',
          'created_time',
          'updated_time',
        ]);
        const data = await apiGet(campaignId, { fields });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          printRecord(
            {
              id: data.id,
              name: data.name,
              objective: data.objective,
              status: data.status,
              effectiveStatus: data.effective_status,
              dailyBudget: formatBudget(data.daily_budget),
              lifetimeBudget: formatBudget(data.lifetime_budget),
              budgetRemaining: formatBudget(data.budget_remaining),
              spendCap: formatBudget(data.spend_cap),
              bidStrategy: data.bid_strategy || '-',
              buyingType: data.buying_type || '-',
              specialAdCategories: data.special_ad_categories?.join(', ') || '-',
              startTime: formatDate(data.start_time),
              stopTime: formatDate(data.stop_time),
              created: formatDate(data.created_time),
              updated: formatDate(data.updated_time),
            },
            'Campaign Details'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // CREATE
  campaigns
    .command('create')
    .description('Create a new campaign')
    .requiredOption('-n, --name <name>', 'Campaign name')
    .requiredOption(
      '-o, --objective <objective>',
      `Objective: ${CAMPAIGN_OBJECTIVES.join(', ')}`
    )
    .option(
      '--special-ad-categories <categories>',
      'Comma-separated special ad categories',
      'NONE'
    )
    .option('--status <status>', 'ACTIVE or PAUSED', 'PAUSED')
    .option('--daily-budget <amount>', 'Daily budget in cents')
    .option('--lifetime-budget <amount>', 'Lifetime budget in cents')
    .option('--spend-cap <amount>', 'Spend cap in cents')
    .option('--bid-strategy <strategy>', `Bid strategy: ${BID_STRATEGIES.join(', ')}`)
    .option('--buying-type <type>', 'AUCTION or RESERVED', 'AUCTION')
    .option('--start-time <datetime>', 'Start time (ISO 8601)')
    .option('--stop-time <datetime>', 'Stop time (ISO 8601)')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating campaign...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const body: Record<string, any> = {
          name: opts.name,
          objective: opts.objective,
          special_ad_categories: JSON.stringify(
            opts.specialAdCategories.split(',')
          ),
          status: opts.status,
          buying_type: opts.buyingType,
        };

        if (opts.dailyBudget) body.daily_budget = opts.dailyBudget;
        if (opts.lifetimeBudget) body.lifetime_budget = opts.lifetimeBudget;
        if (opts.spendCap) body.spend_cap = opts.spendCap;
        if (opts.bidStrategy) body.bid_strategy = opts.bidStrategy;
        if (opts.startTime) body.start_time = opts.startTime;
        if (opts.stopTime) body.stop_time = opts.stopTime;

        const data = await apiPost(`${accountId}/campaigns`, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Campaign created with ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // UPDATE
  campaigns
    .command('update <campaignId>')
    .description('Update a campaign')
    .option('-n, --name <name>', 'Campaign name')
    .option('--status <status>', 'ACTIVE, PAUSED, ARCHIVED, or DELETED')
    .option('--daily-budget <amount>', 'Daily budget in cents')
    .option('--lifetime-budget <amount>', 'Lifetime budget in cents')
    .option('--spend-cap <amount>', 'Spend cap in cents')
    .option('--bid-strategy <strategy>', 'Bid strategy')
    .option('--json', 'Output as JSON')
    .action(async (campaignId, opts) => {
      const spinner = createSpinner('Updating campaign...');
      spinner.start();
      try {
        const body: Record<string, any> = {};
        if (opts.name) body.name = opts.name;
        if (opts.status) body.status = opts.status;
        if (opts.dailyBudget) body.daily_budget = opts.dailyBudget;
        if (opts.lifetimeBudget) body.lifetime_budget = opts.lifetimeBudget;
        if (opts.spendCap) body.spend_cap = opts.spendCap;
        if (opts.bidStrategy) body.bid_strategy = opts.bidStrategy;

        if (Object.keys(body).length === 0) {
          spinner.stop();
          error('No fields to update. Provide at least one option.');
          process.exit(1);
        }

        const data = await apiPost(campaignId, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Campaign ${campaignId} updated.`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // PAUSE
  campaigns
    .command('pause <campaignId>')
    .description('Pause a campaign')
    .action(async (campaignId) => {
      const spinner = createSpinner('Pausing campaign...');
      spinner.start();
      try {
        await apiPost(campaignId, { status: 'PAUSED' });
        spinner.stop();
        success(`Campaign ${campaignId} paused.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // RESUME
  campaigns
    .command('resume <campaignId>')
    .alias('activate')
    .description('Resume/activate a campaign')
    .action(async (campaignId) => {
      const spinner = createSpinner('Resuming campaign...');
      spinner.start();
      try {
        await apiPost(campaignId, { status: 'ACTIVE' });
        spinner.stop();
        success(`Campaign ${campaignId} activated.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // ARCHIVE
  campaigns
    .command('archive <campaignId>')
    .description('Archive a campaign')
    .action(async (campaignId) => {
      const spinner = createSpinner('Archiving campaign...');
      spinner.start();
      try {
        await apiPost(campaignId, { status: 'ARCHIVED' });
        spinner.stop();
        success(`Campaign ${campaignId} archived.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  campaigns
    .command('delete <campaignId>')
    .alias('rm')
    .description('Delete a campaign')
    .action(async (campaignId) => {
      const spinner = createSpinner('Deleting campaign...');
      spinner.start();
      try {
        await apiDelete(campaignId);
        spinner.stop();
        success(`Campaign ${campaignId} deleted.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
