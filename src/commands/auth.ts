import { Command } from 'commander';
import inquirer from 'inquirer';
import { setConfig, getConfig, clearConfig, getToken } from '../lib/config';
import { apiGet } from '../lib/api';
import { success, error, info, printRecord } from '../utils/output';
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
        printRecord(
          {
            status: 'Authenticated',
            user: response.name,
            userId: response.id,
            tokenPrefix: token.substring(0, 10) + '...',
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
}
