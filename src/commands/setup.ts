import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import http from 'http';
import { URL } from 'url';
import fetch from 'node-fetch';
import {
  setConfig,
  getConfig,
  clearConfig,
  config,
  profileStore,
} from '../lib/config';
import { apiGet } from '../lib/api';
import { success, error, info, warn, printRecord } from '../utils/output';
import { createSpinner } from '../utils/helpers';

/**
 * Validate an access token by calling the /me endpoint.
 * Returns user info on success, or null on failure.
 */
async function validateToken(token: string): Promise<{ id: string; name: string } | null> {
  try {
    const response = await apiGet('me', { fields: 'id,name' }, token);
    if (response.id && response.name) {
      return { id: response.id, name: response.name };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch ad accounts accessible by the given token.
 */
async function fetchAdAccounts(token: string): Promise<{ id: string; name: string; account_id: string }[]> {
  try {
    const response = await apiGet<{ id: string; name: string; account_id: string }>(
      'me/adaccounts',
      { fields: 'id,name,account_id', limit: 50 },
      token
    );
    return response.data || [];
  } catch {
    return [];
  }
}

/**
 * Validate an ad account ID by fetching its info.
 */
async function validateAdAccount(accountId: string, token: string): Promise<{ id: string; name: string } | null> {
  try {
    const normalizedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const response = await apiGet(normalizedId, { fields: 'id,name' }, token);
    if (response.id) {
      return { id: response.id, name: response.name || '(unnamed)' };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Start a temporary HTTP server and wait for the OAuth callback.
 */
function waitForOAuthCallback(port: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Bad request</h1>');
        return;
      }

      const parsedUrl = new URL(req.url, `http://localhost:${port}`);

      if (parsedUrl.pathname !== '/callback') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>Not found</h1>');
        return;
      }

      const code = parsedUrl.searchParams.get('code');
      const errorParam = parsedUrl.searchParams.get('error');
      const errorDescription = parsedUrl.searchParams.get('error_description');

      if (errorParam) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(
          `<h1>Authorization Failed</h1><p>${errorDescription || errorParam}</p><p>You can close this window.</p>`
        );
        server.close();
        reject(new Error(`OAuth authorization denied: ${errorDescription || errorParam}`));
        return;
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Missing authorization code</h1><p>You can close this window.</p>');
        server.close();
        reject(new Error('No authorization code received in callback'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        '<h1>Authorization Successful!</h1><p>You can close this window and return to your terminal.</p>'
      );
      server.close();
      resolve(code);
    });

    server.on('error', (err) => {
      reject(new Error(`Failed to start local server on port ${port}: ${err.message}`));
    });

    server.listen(port);

    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    server.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

/**
 * Detect the current shell.
 */
function detectShell(): 'bash' | 'zsh' | 'fish' | 'unknown' {
  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return 'zsh';
  if (shell.includes('bash')) return 'bash';
  if (shell.includes('fish')) return 'fish';
  return 'unknown';
}

export function registerSetupCommands(program: Command): void {
  const setup = program
    .command('setup')
    .description('Interactive first-run setup wizard')
    .action(async () => {
      console.log();
      console.log(chalk.bold.cyan('  Welcome to adpilot! Let\'s get you set up.'));
      console.log(chalk.gray('  This wizard will walk you through initial configuration.\n'));

      let currentToken: string | undefined;
      let userName: string | undefined;
      let userId: string | undefined;

      // --- Step 1: Authentication ---
      const { authMethod } = await inquirer.prompt([
        {
          type: 'list',
          name: 'authMethod',
          message: 'How would you like to authenticate?',
          choices: [
            { name: 'Paste an access token', value: 'paste' },
            { name: 'Use OAuth 2.0', value: 'oauth' },
            { name: 'Set up later', value: 'skip' },
          ],
        },
      ]);

      if (authMethod === 'paste') {
        const { token } = await inquirer.prompt([
          {
            type: 'password',
            name: 'token',
            message: 'Enter your Facebook access token:',
            mask: '*',
          },
        ]);

        const spinner = createSpinner('Validating token...');
        spinner.start();
        const userInfo = await validateToken(token);
        spinner.stop();

        if (userInfo) {
          setConfig('accessToken', token);
          currentToken = token;
          userName = userInfo.name;
          userId = userInfo.id;
          success(`Authenticated as ${userInfo.name} (ID: ${userInfo.id})`);
        } else {
          error('Token validation failed. You can set it later with: adpilot auth login');
        }
      } else if (authMethod === 'oauth') {
        const oauthAnswers = await inquirer.prompt([
          {
            type: 'input',
            name: 'appId',
            message: 'Enter your Facebook App ID:',
            validate: (input: string) => input.trim().length > 0 || 'App ID is required',
          },
          {
            type: 'password',
            name: 'appSecret',
            message: 'Enter your Facebook App Secret:',
            mask: '*',
            validate: (input: string) => input.trim().length > 0 || 'App Secret is required',
          },
        ]);

        const port = 3456;
        const redirectUri = `http://localhost:${port}/callback`;
        const scopes = 'ads_management,ads_read,read_insights';

        setConfig('appId', oauthAnswers.appId.trim());
        setConfig('appSecret', oauthAnswers.appSecret.trim());

        const authUrl =
          `https://www.facebook.com/v25.0/dialog/oauth?` +
          `client_id=${encodeURIComponent(oauthAnswers.appId.trim())}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `scope=${encodeURIComponent(scopes)}&` +
          `response_type=code`;

        console.log();
        info('Open this URL in your browser to authorize the app:\n');
        console.log(chalk.underline(authUrl));
        console.log();
        info(`Waiting for callback on http://localhost:${port}/callback ...`);

        try {
          const code = await waitForOAuthCallback(port);

          const spinner = createSpinner('Exchanging code for token...');
          spinner.start();

          // Exchange code for short-lived token
          const shortTokenUrl =
            `https://graph.facebook.com/v25.0/oauth/access_token?` +
            `client_id=${encodeURIComponent(oauthAnswers.appId.trim())}&` +
            `client_secret=${encodeURIComponent(oauthAnswers.appSecret.trim())}&` +
            `redirect_uri=${encodeURIComponent(redirectUri)}&` +
            `code=${encodeURIComponent(code)}`;

          const shortRes = await fetch(shortTokenUrl);
          const shortData = (await shortRes.json()) as any;

          if (shortData.error) {
            spinner.stop();
            error(`Failed to exchange code: ${shortData.error.message}`);
          } else {
            // Exchange for long-lived token
            const longTokenUrl =
              `https://graph.facebook.com/v25.0/oauth/access_token?` +
              `grant_type=fb_exchange_token&` +
              `client_id=${encodeURIComponent(oauthAnswers.appId.trim())}&` +
              `client_secret=${encodeURIComponent(oauthAnswers.appSecret.trim())}&` +
              `fb_exchange_token=${encodeURIComponent(shortData.access_token)}`;

            const longRes = await fetch(longTokenUrl);
            const longData = (await longRes.json()) as any;

            if (longData.error) {
              spinner.stop();
              error(`Failed to exchange for long-lived token: ${longData.error.message}`);
            } else {
              const longLivedToken: string = longData.access_token;
              const expiresIn: number | undefined = longData.expires_in;

              setConfig('accessToken', longLivedToken);
              currentToken = longLivedToken;
              if (expiresIn) {
                const expiresAtSec = Math.floor(Date.now() / 1000) + expiresIn;
                setConfig('tokenExpiresAt', expiresAtSec);
              }

              const userInfo = await validateToken(longLivedToken);
              spinner.stop();

              if (userInfo) {
                userName = userInfo.name;
                userId = userInfo.id;
                success(`OAuth authentication successful! Logged in as ${userInfo.name}`);
              } else {
                success('OAuth token saved (could not fetch user info).');
              }
            }
          }
        } catch (err: any) {
          error(`OAuth flow failed: ${err.message}`);
        }
      } else {
        info('Skipping authentication. You can set it up later with: adpilot auth login');
      }

      console.log();

      // --- Step 2: Ad Account ---
      if (currentToken) {
        const { accountMethod } = await inquirer.prompt([
          {
            type: 'list',
            name: 'accountMethod',
            message: 'How would you like to set your ad account?',
            choices: [
              { name: 'List my accounts (fetch from API)', value: 'list' },
              { name: 'Enter ad account ID manually', value: 'manual' },
              { name: 'Set up later', value: 'skip' },
            ],
          },
        ]);

        if (accountMethod === 'list') {
          const spinner = createSpinner('Fetching ad accounts...');
          spinner.start();
          const accounts = await fetchAdAccounts(currentToken);
          spinner.stop();

          if (accounts.length === 0) {
            warn('No ad accounts found for this token.');
            info('You can set an account later with: adpilot config set adAccountId act_XXXXX');
          } else {
            const { selectedAccount } = await inquirer.prompt([
              {
                type: 'list',
                name: 'selectedAccount',
                message: 'Select an ad account:',
                choices: accounts.map((acc) => ({
                  name: `${acc.id} — ${acc.name || '(unnamed)'}`,
                  value: acc.id,
                })),
              },
            ]);

            setConfig('adAccountId', selectedAccount);
            success(`Ad account set to ${selectedAccount}`);
          }
        } else if (accountMethod === 'manual') {
          const { accountId } = await inquirer.prompt([
            {
              type: 'input',
              name: 'accountId',
              message: 'Enter your ad account ID (act_XXXXX):',
              validate: (input: string) => {
                const trimmed = input.trim();
                if (!trimmed) return 'Account ID is required';
                return true;
              },
            },
          ]);

          const normalizedId = accountId.trim().startsWith('act_')
            ? accountId.trim()
            : `act_${accountId.trim()}`;

          const spinner = createSpinner('Validating ad account...');
          spinner.start();
          const accountInfo = await validateAdAccount(normalizedId, currentToken);
          spinner.stop();

          if (accountInfo) {
            setConfig('adAccountId', normalizedId);
            success(`Ad account set to ${normalizedId} (${accountInfo.name})`);
          } else {
            warn(`Could not validate account ${normalizedId}. Saving anyway.`);
            setConfig('adAccountId', normalizedId);
          }
        } else {
          info('Skipping ad account. Set it later with: adpilot config set adAccountId act_XXXXX');
        }
      } else {
        info('Skipping ad account setup (no token configured).');
      }

      console.log();

      // --- Step 3: Output Format ---
      const { outputFormat } = await inquirer.prompt([
        {
          type: 'list',
          name: 'outputFormat',
          message: 'Preferred output format?',
          choices: [
            { name: 'Table (human-readable)', value: 'table' },
            { name: 'JSON (machine-readable)', value: 'json' },
          ],
          default: 'table',
        },
      ]);

      setConfig('defaultOutputFormat', outputFormat);
      success(`Output format set to ${outputFormat}`);

      console.log();

      // --- Step 4: Shell Completions ---
      const detectedShell = detectShell();
      const shellLabel = detectedShell !== 'unknown' ? ` (detected: ${detectedShell})` : '';

      const { installCompletions } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'installCompletions',
          message: `Install shell completions?${shellLabel}`,
          default: true,
        },
      ]);

      if (installCompletions) {
        if (detectedShell === 'unknown') {
          warn('Could not detect your shell. Install completions manually:');
          info('  adpilot completions install');
        } else {
          info(`Run \`adpilot completions install\` to install ${detectedShell} completions.`);
        }
      }

      console.log();

      // --- Step 5: API Logging ---
      const { enableLogging } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'enableLogging',
          message: 'Enable API call logging?',
          default: false,
        },
      ]);

      if (enableLogging) {
        setConfig('enableLogging' as any, true as any);
        success('API logging enabled. Logs stored in ~/.adpilot/logs/');
      } else {
        info('API logging disabled. Enable later with: adpilot config set enableLogging true');
      }

      console.log();

      // --- Summary ---
      console.log(chalk.bold.cyan('  Configuration Summary'));
      console.log(chalk.gray('  ' + '-'.repeat(40)));

      const cfg = getConfig();
      const summaryItems: Record<string, string> = {};

      if (userName && userId) {
        summaryItems['User'] = `${userName} (ID: ${userId})`;
      } else if (cfg.accessToken) {
        summaryItems['Token'] = cfg.accessToken.substring(0, 10) + '...';
      } else {
        summaryItems['Auth'] = '(not configured)';
      }

      summaryItems['Ad Account'] = cfg.adAccountId || '(not configured)';
      summaryItems['Output Format'] = cfg.defaultOutputFormat;
      summaryItems['API Version'] = cfg.apiVersion;
      summaryItems['Logging'] = enableLogging ? 'Enabled' : 'Disabled';

      for (const [key, value] of Object.entries(summaryItems)) {
        console.log(`  ${chalk.bold(key)}: ${value}`);
      }

      console.log();
      console.log(chalk.bold.green('  You\'re all set! Try these commands:'));
      console.log(chalk.gray('    adpilot campaigns list'));
      console.log(chalk.gray('    adpilot insights account --date-preset last_7d'));
      console.log(chalk.gray('    adpilot --help'));
      console.log();
    });

  // --- setup reset ---
  setup
    .command('reset')
    .description('Reset all configuration and start fresh')
    .action(async () => {
      const { confirmReset } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirmReset',
          message: 'This will clear ALL configuration (tokens, accounts, preferences). Continue?',
          default: false,
        },
      ]);

      if (!confirmReset) {
        info('Reset cancelled.');
        return;
      }

      clearConfig();

      // Also clear all profiles
      const profiles = profileStore.store;
      for (const key of Object.keys(profiles)) {
        profileStore.delete(key);
      }

      success('All configuration and profiles cleared.');
      info('Run `adpilot setup` to start fresh.');
    });
}
