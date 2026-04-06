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
  getToken,
  listProfiles,
  getProfile,
  saveProfile,
  deleteProfile,
  getActiveProfileName,
  switchProfile,
  Profile,
} from '../lib/config';
import { apiGet } from '../lib/api';
import { success, error, info, printRecord, printTable, printJson } from '../utils/output';
import { createSpinner } from '../utils/helpers';

export function registerAuthCommands(program: Command): void {
  const auth = program.command('auth').description('Manage authentication');

  auth
    .command('login')
    .description('Set your Facebook access token')
    .option('-t, --token <token>', 'Access token (or will be prompted)')
    .action(async (opts) => {
      let token = opts.token;
      if (!token) {
        const answers = await inquirer.prompt([
          {
            type: 'password',
            name: 'token',
            message: 'Enter your Facebook access token:',
            mask: '*',
          },
        ]);
        token = answers.token;
      }

      const spinner = createSpinner('Validating token...');
      spinner.start();

      try {
        const response = await apiGet('me', { fields: 'id,name' }, token);
        spinner.stop();
        setConfig('accessToken', token);
        success(`Authenticated as ${response.name} (ID: ${response.id})`);
      } catch (err: any) {
        spinner.stop();
        error(`Invalid token: ${err.message}`);
        process.exit(1);
      }
    });

  auth
    .command('logout')
    .description('Clear stored access token')
    .action(() => {
      setConfig('accessToken', '' as any);
      success('Access token cleared.');
    });

  auth
    .command('status')
    .description('Show current authentication status')
    .action(async () => {
      try {
        const token = getToken();
        const spinner = createSpinner('Checking token...');
        spinner.start();
        const response = await apiGet('me', { fields: 'id,name' });
        spinner.stop();
        const activeProfile = getActiveProfileName();
        printRecord(
          {
            status: 'Authenticated',
            user: response.name,
            userId: response.id,
            tokenPrefix: token.substring(0, 10) + '...',
            ...(activeProfile ? { activeProfile } : {}),
          },
          'Auth Status'
        );
      } catch (err: any) {
        error(err.message);
      }
    });

  auth
    .command('token')
    .description('Display the current access token')
    .action(() => {
      try {
        const token = getToken();
        info(`Token: ${token}`);
      } catch (err: any) {
        error(err.message);
      }
    });

  // --- Profile management subcommands ---
  const profiles = auth
    .command('profiles')
    .description('Manage multi-account profiles');

  profiles
    .command('list')
    .alias('ls')
    .description('List all saved profiles')
    .option('--json', 'Output as JSON')
    .action((opts) => {
      const allProfiles = listProfiles();
      const activeProfileName = getActiveProfileName();

      if (allProfiles.length === 0) {
        info('No profiles saved. Add one with: adpilot auth profiles add --name <name> --token <token> --account-id <id>');
        return;
      }

      if (opts.json) {
        printJson(allProfiles.map((p) => ({
          ...p,
          active: p.name === activeProfileName,
        })));
        return;
      }

      const rows = allProfiles.map((p) => [
        p.name === activeProfileName ? chalk.green(`* ${p.name}`) : `  ${p.name}`,
        p.accessToken.substring(0, 10) + '...',
        p.adAccountId,
        p.apiVersion || '-',
        p.description || '-',
        p.createdAt,
      ]);

      printTable(
        ['Name', 'Token', 'Account ID', 'API Version', 'Description', 'Created'],
        rows,
        'Profiles'
      );
    });

  profiles
    .command('add')
    .description('Add a new named profile')
    .requiredOption('--name <name>', 'Profile name')
    .requiredOption('--token <token>', 'Access token')
    .requiredOption('--account-id <id>', 'Ad account ID (act_XXXXX)')
    .option('--description <desc>', 'Profile description')
    .option('--api-version <ver>', 'API version override')
    .action(async (opts) => {
      // Check if profile with this name already exists
      const existing = getProfile(opts.name);
      if (existing) {
        error(`Profile "${opts.name}" already exists. Remove it first with: adpilot auth profiles remove ${opts.name}`);
        process.exit(1);
      }

      const spinner = createSpinner('Validating token...');
      spinner.start();

      try {
        const response = await apiGet('me', { fields: 'id,name' }, opts.token);
        spinner.stop();

        const profile: Profile = {
          name: opts.name,
          accessToken: opts.token,
          adAccountId: opts.accountId.startsWith('act_') ? opts.accountId : `act_${opts.accountId}`,
          apiVersion: opts.apiVersion,
          description: opts.description,
          createdAt: new Date().toISOString(),
        };

        saveProfile(profile);
        success(`Profile "${opts.name}" saved (user: ${response.name}, ID: ${response.id})`);

        // If this is the first profile, suggest switching to it
        const allProfiles = listProfiles();
        if (allProfiles.length === 1) {
          info(`Tip: Switch to this profile with: adpilot auth profiles switch ${opts.name}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(`Invalid token: ${err.message}`);
        process.exit(1);
      }
    });

  profiles
    .command('switch <name>')
    .description('Switch to a different profile')
    .action((name) => {
      try {
        switchProfile(name);
        const profile = getProfile(name)!;
        success(`Switched to profile "${name}" (account: ${profile.adAccountId})`);
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  profiles
    .command('remove <name>')
    .alias('rm')
    .description('Delete a profile')
    .action((name) => {
      const profile = getProfile(name);
      if (!profile) {
        error(`Profile "${name}" not found.`);
        process.exit(1);
      }

      const wasActive = getActiveProfileName() === name;
      deleteProfile(name);
      success(`Profile "${name}" deleted.`);
      if (wasActive) {
        info('This was the active profile. No profile is now active.');
      }
    });

  profiles
    .command('current')
    .description('Show the currently active profile')
    .option('--json', 'Output as JSON')
    .action((opts) => {
      const activeProfileName = getActiveProfileName();
      if (!activeProfileName) {
        info('No active profile. Using default config. Switch with: adpilot auth profiles switch <name>');
        return;
      }

      const profile = getProfile(activeProfileName);
      if (!profile) {
        info(`Active profile "${activeProfileName}" not found. It may have been deleted.`);
        return;
      }

      if (opts.json) {
        printJson({ ...profile, active: true });
        return;
      }

      printRecord(
        {
          name: profile.name,
          accessToken: profile.accessToken.substring(0, 10) + '...',
          adAccountId: profile.adAccountId,
          apiVersion: profile.apiVersion || '(default)',
          description: profile.description || '-',
          createdAt: profile.createdAt,
        },
        'Active Profile'
      );
    });

  // --- OAuth 2.0 flow ---

  auth
    .command('oauth')
    .description('Start an OAuth 2.0 flow to get a long-lived token')
    .option('--app-id <id>', 'Facebook App ID (or from config)')
    .option('--app-secret <secret>', 'Facebook App Secret (or from config)')
    .option('--port <port>', 'Local redirect server port', '3456')
    .option(
      '--scopes <scopes>',
      'Comma-separated permissions',
      'ads_management,ads_read,read_insights'
    )
    .action(async (opts) => {
      const cfg = getConfig();
      const appId = opts.appId || cfg.appId;
      const appSecret = opts.appSecret || cfg.appSecret;

      if (!appId) {
        error('Facebook App ID is required. Pass --app-id or set it via: adpilot config set appId <id>');
        process.exit(1);
      }
      if (!appSecret) {
        error('Facebook App Secret is required. Pass --app-secret or set it via: adpilot config set appSecret <secret>');
        process.exit(1);
      }

      const port = parseInt(opts.port, 10);
      const redirectUri = `http://localhost:${port}/callback`;
      const scopes = opts.scopes;

      // Save app credentials to config for future use
      setConfig('appId', appId);
      setConfig('appSecret', appSecret);

      const authUrl =
        `https://www.facebook.com/v25.0/dialog/oauth?` +
        `client_id=${encodeURIComponent(appId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `response_type=code`;

      info('Open this URL in your browser to authorize the app:\n');
      console.log(chalk.underline(authUrl));
      console.log();
      info(`Waiting for callback on http://localhost:${port}/callback ...`);

      try {
        const code = await waitForOAuthCallback(port);

        const spinner = createSpinner('Exchanging code for short-lived token...');
        spinner.start();

        // Step 1: Exchange authorization code for short-lived token
        const shortTokenUrl =
          `https://graph.facebook.com/v25.0/oauth/access_token?` +
          `client_id=${encodeURIComponent(appId)}&` +
          `client_secret=${encodeURIComponent(appSecret)}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `code=${encodeURIComponent(code)}`;

        const shortRes = await fetch(shortTokenUrl);
        const shortData = (await shortRes.json()) as any;

        if (shortData.error) {
          spinner.stop();
          error(`Failed to exchange code: ${shortData.error.message}`);
          process.exit(1);
        }

        spinner.text = 'Exchanging for long-lived token...';

        // Step 2: Exchange short-lived token for long-lived token
        const longTokenUrl =
          `https://graph.facebook.com/v25.0/oauth/access_token?` +
          `grant_type=fb_exchange_token&` +
          `client_id=${encodeURIComponent(appId)}&` +
          `client_secret=${encodeURIComponent(appSecret)}&` +
          `fb_exchange_token=${encodeURIComponent(shortData.access_token)}`;

        const longRes = await fetch(longTokenUrl);
        const longData = (await longRes.json()) as any;

        if (longData.error) {
          spinner.stop();
          error(`Failed to exchange for long-lived token: ${longData.error.message}`);
          process.exit(1);
        }

        const longLivedToken: string = longData.access_token;
        const expiresIn: number | undefined = longData.expires_in; // seconds

        // Save the token and expiry
        setConfig('accessToken', longLivedToken);
        if (expiresIn) {
          const expiresAtSec = Math.floor(Date.now() / 1000) + expiresIn;
          setConfig('tokenExpiresAt', expiresAtSec);
        }

        spinner.text = 'Fetching user info...';

        // Fetch user info to confirm
        const meUrl =
          `https://graph.facebook.com/v25.0/me?fields=id,name&` +
          `access_token=${encodeURIComponent(longLivedToken)}`;
        const meRes = await fetch(meUrl);
        const meData = (await meRes.json()) as any;

        spinner.stop();

        const tokenType = expiresIn ? 'Long-lived user token' : 'User token';
        const expiryDisplay = expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toLocaleString()
          : 'Unknown';

        success('OAuth authentication successful!');
        printRecord(
          {
            tokenType,
            expiresAt: expiryDisplay,
            expiresIn: expiresIn ? `${Math.round(expiresIn / 86400)} days` : 'Unknown',
            user: meData.name || 'Unknown',
            userId: meData.id || 'Unknown',
            tokenPrefix: longLivedToken.substring(0, 15) + '...',
          },
          'OAuth Token'
        );
      } catch (err: any) {
        error(`OAuth flow failed: ${err.message}`);
        process.exit(1);
      }
    });

  auth
    .command('refresh')
    .description('Refresh the current token to extend its lifetime')
    .option('--app-id <id>', 'Facebook App ID (or from config)')
    .option('--app-secret <secret>', 'Facebook App Secret (or from config)')
    .action(async (opts) => {
      const cfg = getConfig();
      const appId = opts.appId || cfg.appId;
      const appSecret = opts.appSecret || cfg.appSecret;

      if (!appId) {
        error('Facebook App ID is required. Pass --app-id or set it via: adpilot config set appId <id>');
        process.exit(1);
      }
      if (!appSecret) {
        error('Facebook App Secret is required. Pass --app-secret or set it via: adpilot config set appSecret <secret>');
        process.exit(1);
      }

      let currentToken: string;
      try {
        // Use config directly to bypass expiry check — we want to refresh even expired tokens
        currentToken =
          cfg.accessToken ||
          process.env.ADPILOT_TOKEN ||
          process.env.FACEBOOK_ACCESS_TOKEN ||
          '';
        if (!currentToken) {
          error('No access token found. Run `adpilot auth login` or `adpilot auth oauth` first.');
          process.exit(1);
          return; // unreachable but helps TS
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
        return;
      }

      const spinner = createSpinner('Refreshing token...');
      spinner.start();

      try {
        const refreshUrl =
          `https://graph.facebook.com/v25.0/oauth/access_token?` +
          `grant_type=fb_exchange_token&` +
          `client_id=${encodeURIComponent(appId)}&` +
          `client_secret=${encodeURIComponent(appSecret)}&` +
          `fb_exchange_token=${encodeURIComponent(currentToken)}`;

        const res = await fetch(refreshUrl);
        const data = (await res.json()) as any;

        if (data.error) {
          spinner.stop();
          error(`Failed to refresh token: ${data.error.message}`);
          process.exit(1);
        }

        const newToken: string = data.access_token;
        const expiresIn: number | undefined = data.expires_in;

        setConfig('accessToken', newToken);
        if (expiresIn) {
          const expiresAtSec = Math.floor(Date.now() / 1000) + expiresIn;
          setConfig('tokenExpiresAt', expiresAtSec);
        }

        spinner.stop();

        const expiryDisplay = expiresIn
          ? new Date(Date.now() + expiresIn * 1000).toLocaleString()
          : 'Unknown';

        success('Token refreshed successfully!');
        printRecord(
          {
            expiresAt: expiryDisplay,
            expiresIn: expiresIn ? `${Math.round(expiresIn / 86400)} days` : 'Unknown',
            tokenPrefix: newToken.substring(0, 15) + '...',
          },
          'Refreshed Token'
        );
      } catch (err: any) {
        spinner.stop();
        error(`Failed to refresh token: ${err.message}`);
        process.exit(1);
      }
    });

  auth
    .command('inspect')
    .description('Inspect the current token metadata')
    .option('--app-id <id>', 'Facebook App ID (or from config)')
    .option('--app-secret <secret>', 'Facebook App Secret (or from config)')
    .action(async (opts) => {
      const cfg = getConfig();
      const appId = opts.appId || cfg.appId;
      const appSecret = opts.appSecret || cfg.appSecret;

      let token: string;
      try {
        // Use config directly to bypass expiry check for inspection
        token =
          cfg.accessToken ||
          process.env.ADPILOT_TOKEN ||
          process.env.FACEBOOK_ACCESS_TOKEN ||
          '';
        if (!token) {
          error('No access token found. Run `adpilot auth login` or `adpilot auth oauth` first.');
          process.exit(1);
          return;
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
        return;
      }

      const spinner = createSpinner('Inspecting token...');
      spinner.start();

      try {
        if (appId && appSecret) {
          // Use debug_token endpoint for full metadata
          const appAccessToken = `${appId}|${appSecret}`;
          const debugUrl =
            `https://graph.facebook.com/debug_token?` +
            `input_token=${encodeURIComponent(token)}&` +
            `access_token=${encodeURIComponent(appAccessToken)}`;

          const res = await fetch(debugUrl);
          const data = (await res.json()) as any;

          if (data.error) {
            spinner.stop();
            error(`Failed to inspect token: ${data.error.message}`);
            process.exit(1);
          }

          spinner.stop();

          const tokenData = data.data || {};
          const expiresAt = tokenData.expires_at
            ? tokenData.expires_at === 0
              ? 'Never (non-expiring token)'
              : new Date(tokenData.expires_at * 1000).toLocaleString()
            : 'Unknown';
          const issuedAt = tokenData.issued_at
            ? new Date(tokenData.issued_at * 1000).toLocaleString()
            : 'Unknown';

          printRecord(
            {
              appId: tokenData.app_id || 'Unknown',
              type: tokenData.type || 'Unknown',
              isValid: tokenData.is_valid !== undefined ? String(tokenData.is_valid) : 'Unknown',
              scopes: Array.isArray(tokenData.scopes)
                ? tokenData.scopes.join(', ')
                : 'Unknown',
              expiresAt,
              issuedAt,
              userId: tokenData.user_id || 'Unknown',
              tokenPrefix: token.substring(0, 15) + '...',
            },
            'Token Inspection'
          );
        } else {
          // Fallback: use /me endpoint
          const meUrl =
            `https://graph.facebook.com/v25.0/me?fields=id,name&` +
            `access_token=${encodeURIComponent(token)}`;
          const res = await fetch(meUrl);
          const data = (await res.json()) as any;

          if (data.error) {
            spinner.stop();
            error(`Failed to inspect token: ${data.error.message}`);
            process.exit(1);
          }

          spinner.stop();

          const storedExpiry = cfg.tokenExpiresAt;
          const expiresAt = storedExpiry
            ? new Date(storedExpiry * 1000).toLocaleString()
            : 'Unknown (provide --app-id and --app-secret for full details)';

          printRecord(
            {
              userId: data.id || 'Unknown',
              userName: data.name || 'Unknown',
              expiresAt,
              tokenPrefix: token.substring(0, 15) + '...',
              note: 'Pass --app-id and --app-secret for full token metadata (scopes, type, validity).',
            },
            'Token Inspection (Basic)'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(`Failed to inspect token: ${err.message}`);
        process.exit(1);
      }
    });
}

/**
 * Start a temporary HTTP server and wait for the OAuth callback.
 * Returns the authorization code from the callback URL.
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

    // Timeout after 5 minutes
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('OAuth callback timed out after 5 minutes'));
    }, 5 * 60 * 1000);

    server.on('close', () => {
      clearTimeout(timeout);
    });
  });
}
