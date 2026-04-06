import { Command } from 'commander';
import fetch from 'node-fetch';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { getConfig } from '../lib/config';
import { output, printTable, printRecord, success, error, info, warn } from '../utils/output';
import { createSpinner } from '../utils/helpers';

/**
 * Resolve the Facebook App ID from options or config.
 */
function resolveAppId(opts: { appId?: string }): string {
  const appId = opts.appId || getConfig().appId;
  if (!appId) {
    throw new Error(
      'No Facebook App ID configured. Use --app-id or run `adpilot config set appId YOUR_APP_ID`.'
    );
  }
  return appId;
}

export function registerWebhookCommands(program: Command): void {
  const webhooks = program
    .command('webhooks')
    .alias('webhook')
    .description('Manage webhook subscriptions for ad account change notifications');

  // SUBSCRIBE
  webhooks
    .command('subscribe')
    .description('Subscribe to ad account change notifications')
    .option('--object <type>', 'Object type: ad_account, campaign, adset, ad', 'ad_account')
    .requiredOption('--callback-url <url>', 'Webhook callback URL')
    .option('--fields <fields>', 'Comma-separated fields to subscribe to (e.g., "spend,impressions,status")')
    .requiredOption('--verify-token <token>', 'Verification token for the webhook')
    .option('--app-id <id>', 'Facebook App ID (or from config)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating webhook subscription...');
      spinner.start();
      try {
        const appId = resolveAppId(opts);

        const body: Record<string, any> = {
          object: opts.object,
          callback_url: opts.callbackUrl,
          verify_token: opts.verifyToken,
        };

        if (opts.fields) {
          body.fields = opts.fields.split(',').map((f: string) => f.trim());
        }

        const data = await apiPost(`${appId}/subscriptions`, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          if (data.success) {
            success(`Webhook subscription created for object "${opts.object}".`);
            info(`Callback URL: ${opts.callbackUrl}`);
            if (opts.fields) {
              info(`Fields: ${opts.fields}`);
            }
          } else {
            warn('Subscription request completed but success was not confirmed.');
            output(data, 'json');
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // LIST
  webhooks
    .command('list')
    .alias('ls')
    .description('List all webhook subscriptions')
    .option('--app-id <id>', 'Facebook App ID (or from config)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching webhook subscriptions...');
      spinner.start();
      try {
        const appId = resolveAppId(opts);
        const data = await apiGet(`${appId}/subscriptions`);
        spinner.stop();

        const subscriptions = data.data || [];

        if (opts.json) {
          output(subscriptions, 'json');
        } else {
          if (subscriptions.length === 0) {
            info('No webhook subscriptions found.');
            return;
          }

          const rows = subscriptions.map((sub: any) => [
            sub.object || '-',
            sub.callback_url || '-',
            sub.active ? 'Active' : 'Inactive',
            sub.fields
              ? sub.fields.map((f: any) => (typeof f === 'string' ? f : f.name)).join(', ')
              : '-',
          ]);

          printTable(
            ['Object', 'Callback URL', 'Status', 'Fields'],
            rows,
            'Webhook Subscriptions'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  webhooks
    .command('delete')
    .alias('rm')
    .description('Delete a webhook subscription')
    .requiredOption('--object <type>', 'Object type to unsubscribe')
    .option('--app-id <id>', 'Facebook App ID (or from config)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Deleting webhook subscription...');
      spinner.start();
      try {
        const appId = resolveAppId(opts);
        const data = await apiDelete(`${appId}/subscriptions`, { object: opts.object });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          if (data.success) {
            success(`Webhook subscription for "${opts.object}" deleted.`);
          } else {
            warn('Delete request completed but success was not confirmed.');
            output(data, 'json');
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // TEST
  webhooks
    .command('test')
    .description('Send a test verification request to a webhook callback URL')
    .requiredOption('--callback-url <url>', 'Webhook callback URL to test')
    .requiredOption('--verify-token <token>', 'Verification token')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Sending test verification request...');
      spinner.start();
      try {
        const challenge = `adpilot_test_${Date.now()}`;
        const testUrl = new URL(opts.callbackUrl);
        testUrl.searchParams.set('hub.mode', 'subscribe');
        testUrl.searchParams.set('hub.challenge', challenge);
        testUrl.searchParams.set('hub.verify_token', opts.verifyToken);

        const response = await fetch(testUrl.toString(), {
          method: 'GET',
          timeout: 10000,
        });

        const responseText = await response.text();
        spinner.stop();

        const result = {
          url: testUrl.toString(),
          status: response.status,
          statusText: response.statusText,
          challengeSent: challenge,
          challengeReturned: responseText.trim(),
          verified: responseText.trim() === challenge,
        };

        if (opts.json) {
          output(result, 'json');
        } else {
          printRecord(
            {
              'Callback URL': opts.callbackUrl,
              'HTTP Status': `${response.status} ${response.statusText}`,
              'Challenge Sent': challenge,
              'Challenge Returned': responseText.trim() || '(empty)',
              'Verified': result.verified ? 'YES - Endpoint verified successfully' : 'NO - Challenge mismatch',
            },
            'Webhook Verification Test'
          );

          if (result.verified) {
            success('Webhook endpoint verified successfully.');
          } else {
            warn(
              'Webhook endpoint did not return the expected challenge. ' +
                'Ensure your endpoint reads hub.verify_token, validates it, and returns hub.challenge.'
            );
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(`Failed to reach callback URL: ${err.message}`);
        process.exit(1);
      }
    });
}
