import { Command } from 'commander';
import { apiGet } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { output, printRecord, error } from '../utils/output';
import { createSpinner, formatBudget } from '../utils/helpers';

export function registerAccountCommands(program: Command): void {
  const account = program
    .command('account')
    .description('View ad account information');

  account
    .command('info')
    .description('Get ad account details')
    .option('--account-id <id>', 'Ad account ID (overrides config)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching account info...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const fields =
          'id,name,account_id,account_status,currency,timezone_name,business_name,amount_spent,balance,spend_cap,min_campaign_group_spend_cap,funding_source_details';
        const data = await apiGet(accountId, { fields });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          printRecord(
            {
              id: data.id,
              name: data.name,
              accountId: data.account_id,
              status: data.account_status === 1 ? 'ACTIVE' : `CODE_${data.account_status}`,
              currency: data.currency,
              timezone: data.timezone_name,
              business: data.business_name || '-',
              amountSpent: formatBudget(data.amount_spent),
              balance: formatBudget(data.balance),
              spendCap: formatBudget(data.spend_cap),
            },
            'Ad Account'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  account
    .command('list')
    .description('List all ad accounts for the current user')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching ad accounts...');
      spinner.start();
      try {
        const data = await apiGet('me/adaccounts', {
          fields: 'id,name,account_id,account_status,currency',
          limit: 100,
        });
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          output(
            (data.data || []).map((a: any) => ({
              id: a.id,
              name: a.name || '-',
              accountId: a.account_id,
              status: a.account_status === 1 ? 'ACTIVE' : `CODE_${a.account_status}`,
              currency: a.currency,
            }))
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
