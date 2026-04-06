import { Command } from 'commander';
import { getConfig, setConfig, clearConfig, config } from '../lib/config';
import { success, error, printRecord, info } from '../utils/output';

export function registerConfigCommands(program: Command): void {
  const cfg = program.command('config').description('Manage CLI configuration');

  cfg
    .command('show')
    .description('Display current configuration')
    .action(() => {
      const current = getConfig();
      printRecord(
        {
          adAccountId: current.adAccountId || '(not set)',
          apiVersion: current.apiVersion,
          defaultOutputFormat: current.defaultOutputFormat,
          pageSize: current.pageSize,
          accessToken: current.accessToken
            ? current.accessToken.substring(0, 10) + '...'
            : '(not set)',
        },
        'Configuration'
      );
    });

  cfg
    .command('set <key> <value>')
    .description('Set a configuration value')
    .addHelpText(
      'after',
      `
Available keys:
  adAccountId        Your ad account ID (act_XXXXX)
  apiVersion         Graph API version (e.g., v25.0)
  defaultOutputFormat  Output format: table or json
  pageSize           Number of results per page (default: 25)
`
    )
    .action((key: string, value: string) => {
      const validKeys = [
        'adAccountId',
        'apiVersion',
        'defaultOutputFormat',
        'pageSize',
      ];
      if (!validKeys.includes(key)) {
        error(`Invalid key "${key}". Valid keys: ${validKeys.join(', ')}`);
        process.exit(1);
      }

      const finalValue = key === 'pageSize' ? parseInt(value, 10) : value;
      setConfig(key as any, finalValue);
      success(`Set ${key} = ${value}`);
    });

  cfg
    .command('reset')
    .description('Reset all configuration to defaults')
    .action(() => {
      clearConfig();
      success('Configuration reset to defaults.');
    });

  cfg
    .command('path')
    .description('Show the config file path')
    .action(() => {
      info(`Config file: ${config.path}`);
    });
}
