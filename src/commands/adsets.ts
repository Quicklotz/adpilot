import { Command } from 'commander';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { output, printRecord, printTable, success, error } from '../utils/output';
import {
  createSpinner,
  formatBudget,
  formatDate,
  truncate,
  buildFieldsParam,
  BILLING_EVENTS,
  OPTIMIZATION_GOALS,
  BID_STRATEGIES,
} from '../utils/helpers';
import { statusColor } from '../utils/output';
import { validateBillingEvent, validateOptimizationGoal, validateJson } from '../utils/validators';

export function registerAdSetCommands(program: Command): void {
  const adsets = program
    .command('adsets')
    .alias('adset')
    .description('Manage ad sets');

  // LIST
  adsets
    .command('list')
    .alias('ls')
    .description('List ad sets')
    .option('--account-id <id>', 'Ad account ID')
    .option('--campaign-id <id>', 'Filter by campaign ID')
    .option('--status <status>', 'Filter by effective_status')
    .option('--limit <n>', 'Max results', '25')
    .option('--fields <fields>', 'Comma-separated fields')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching ad sets...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'id',
          'name',
          'campaign_id',
          'status',
          'effective_status',
          'daily_budget',
          'lifetime_budget',
          'billing_event',
          'optimization_goal',
          'bid_amount',
          'start_time',
          'end_time',
        ]);

        const params: Record<string, any> = { fields, limit: opts.limit };
        if (opts.status) {
          params.filtering = [
            { field: 'effective_status', operator: 'IN', value: opts.status.split(',') },
          ];
        }

        const endpoint = opts.campaignId
          ? `${opts.campaignId}/adsets`
          : `${opts.accountId || getAdAccountId()}/adsets`;

        const data = await apiGet(endpoint, params);
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const rows = (data.data || []).map((a: any) => [
            a.id,
            truncate(a.name, 25),
            a.campaign_id || '-',
            statusColor(a.effective_status || a.status),
            formatBudget(a.daily_budget),
            formatBudget(a.lifetime_budget),
            a.billing_event || '-',
            a.optimization_goal || '-',
          ]);
          printTable(
            ['ID', 'Name', 'Campaign', 'Status', 'Daily $', 'Lifetime $', 'Billing', 'Optimization'],
            rows,
            'Ad Sets'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // GET
  adsets
    .command('get <adSetId>')
    .description('Get ad set details')
    .option('--fields <fields>', 'Comma-separated fields')
    .option('--json', 'Output as JSON')
    .action(async (adSetId, opts) => {
      const spinner = createSpinner('Fetching ad set...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'id',
          'name',
          'campaign_id',
          'status',
          'effective_status',
          'daily_budget',
          'lifetime_budget',
          'bid_amount',
          'bid_strategy',
          'billing_event',
          'optimization_goal',
          'targeting',
          'promoted_object',
          'start_time',
          'end_time',
          'created_time',
          'updated_time',
          'learning_stage_info',
          'is_dynamic_creative',
        ]);
        const data = await apiGet(adSetId, { fields });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          printRecord(
            {
              id: data.id,
              name: data.name,
              campaignId: data.campaign_id,
              status: data.status,
              effectiveStatus: data.effective_status,
              dailyBudget: formatBudget(data.daily_budget),
              lifetimeBudget: formatBudget(data.lifetime_budget),
              bidAmount: data.bid_amount ? formatBudget(data.bid_amount) : '-',
              bidStrategy: data.bid_strategy || '-',
              billingEvent: data.billing_event,
              optimizationGoal: data.optimization_goal,
              targeting: data.targeting,
              promotedObject: data.promoted_object,
              startTime: formatDate(data.start_time),
              endTime: formatDate(data.end_time),
              created: formatDate(data.created_time),
              updated: formatDate(data.updated_time),
              learningStage: data.learning_stage_info?.status || '-',
              dynamicCreative: data.is_dynamic_creative || false,
            },
            'Ad Set Details'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // CREATE
  adsets
    .command('create')
    .description('Create a new ad set')
    .requiredOption('-n, --name <name>', 'Ad set name')
    .requiredOption('--campaign-id <id>', 'Parent campaign ID')
    .requiredOption(
      '--billing-event <event>',
      `Billing event: ${BILLING_EVENTS.join(', ')}`
    )
    .requiredOption(
      '--optimization-goal <goal>',
      `Optimization goal: ${OPTIMIZATION_GOALS.join(', ')}`
    )
    .requiredOption('--targeting <json>', 'Targeting spec as JSON string')
    .option('--status <status>', 'ACTIVE or PAUSED', 'PAUSED')
    .option('--daily-budget <amount>', 'Daily budget in cents')
    .option('--lifetime-budget <amount>', 'Lifetime budget in cents')
    .option('--bid-amount <amount>', 'Bid amount in cents')
    .option('--bid-strategy <strategy>', `Bid strategy: ${BID_STRATEGIES.join(', ')}`)
    .option('--start-time <datetime>', 'Start time (ISO 8601)')
    .option('--end-time <datetime>', 'End time (ISO 8601)')
    .option('--promoted-object <json>', 'Promoted object as JSON')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating ad set...');
      spinner.start();
      try {
        validateBillingEvent(opts.billingEvent);
        validateOptimizationGoal(opts.optimizationGoal);
        validateJson(opts.targeting);

        const accountId = opts.accountId || getAdAccountId();
        const body: Record<string, any> = {
          name: opts.name,
          campaign_id: opts.campaignId,
          billing_event: opts.billingEvent,
          optimization_goal: opts.optimizationGoal,
          targeting: opts.targeting,
          status: opts.status,
        };

        if (opts.dailyBudget) body.daily_budget = opts.dailyBudget;
        if (opts.lifetimeBudget) body.lifetime_budget = opts.lifetimeBudget;
        if (opts.bidAmount) body.bid_amount = opts.bidAmount;
        if (opts.bidStrategy) body.bid_strategy = opts.bidStrategy;
        if (opts.startTime) body.start_time = opts.startTime;
        if (opts.endTime) body.end_time = opts.endTime;
        if (opts.promotedObject) body.promoted_object = opts.promotedObject;

        const data = await apiPost(`${accountId}/adsets`, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Ad set created with ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // UPDATE
  adsets
    .command('update <adSetId>')
    .description('Update an ad set')
    .option('-n, --name <name>', 'Ad set name')
    .option('--status <status>', 'ACTIVE, PAUSED, ARCHIVED, or DELETED')
    .option('--daily-budget <amount>', 'Daily budget in cents')
    .option('--lifetime-budget <amount>', 'Lifetime budget in cents')
    .option('--bid-amount <amount>', 'Bid amount in cents')
    .option('--bid-strategy <strategy>', 'Bid strategy')
    .option('--targeting <json>', 'Targeting spec as JSON')
    .option('--billing-event <event>', 'Billing event')
    .option('--optimization-goal <goal>', 'Optimization goal')
    .option('--start-time <datetime>', 'Start time')
    .option('--end-time <datetime>', 'End time')
    .option('--json', 'Output as JSON')
    .action(async (adSetId, opts) => {
      const spinner = createSpinner('Updating ad set...');
      spinner.start();
      try {
        const body: Record<string, any> = {};
        if (opts.name) body.name = opts.name;
        if (opts.status) body.status = opts.status;
        if (opts.dailyBudget) body.daily_budget = opts.dailyBudget;
        if (opts.lifetimeBudget) body.lifetime_budget = opts.lifetimeBudget;
        if (opts.bidAmount) body.bid_amount = opts.bidAmount;
        if (opts.bidStrategy) body.bid_strategy = opts.bidStrategy;
        if (opts.targeting) body.targeting = opts.targeting;
        if (opts.billingEvent) body.billing_event = opts.billingEvent;
        if (opts.optimizationGoal) body.optimization_goal = opts.optimizationGoal;
        if (opts.startTime) body.start_time = opts.startTime;
        if (opts.endTime) body.end_time = opts.endTime;

        if (Object.keys(body).length === 0) {
          spinner.stop();
          error('No fields to update.');
          process.exit(1);
        }

        const data = await apiPost(adSetId, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Ad set ${adSetId} updated.`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // PAUSE
  adsets
    .command('pause <adSetId>')
    .description('Pause an ad set')
    .action(async (adSetId) => {
      const spinner = createSpinner('Pausing ad set...');
      spinner.start();
      try {
        await apiPost(adSetId, { status: 'PAUSED' });
        spinner.stop();
        success(`Ad set ${adSetId} paused.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // RESUME
  adsets
    .command('resume <adSetId>')
    .alias('activate')
    .description('Resume/activate an ad set')
    .action(async (adSetId) => {
      const spinner = createSpinner('Resuming ad set...');
      spinner.start();
      try {
        await apiPost(adSetId, { status: 'ACTIVE' });
        spinner.stop();
        success(`Ad set ${adSetId} activated.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  adsets
    .command('delete <adSetId>')
    .alias('rm')
    .description('Delete an ad set')
    .action(async (adSetId) => {
      const spinner = createSpinner('Deleting ad set...');
      spinner.start();
      try {
        await apiDelete(adSetId);
        spinner.stop();
        success(`Ad set ${adSetId} deleted.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
