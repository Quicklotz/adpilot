import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
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
}
