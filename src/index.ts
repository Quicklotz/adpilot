#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { registerAuthCommands } from './commands/auth';
import { registerConfigCommands } from './commands/config';
import { registerAccountCommands } from './commands/account';
import { registerCampaignCommands } from './commands/campaigns';
import { registerAdSetCommands } from './commands/adsets';
import { registerAdCommands } from './commands/ads';
import { registerCreativeCommands } from './commands/creatives';
import { registerInsightsCommands } from './commands/insights';

const program = new Command();

program
  .name('adpilot')
  .description(
    chalk.bold('adpilot') +
      ' — A powerful CLI for the Meta/Facebook Marketing API.\n\n' +
      'Manage campaigns, ad sets, ads, creatives, and insights from your terminal.\n\n' +
      chalk.gray('Get started:\n') +
      chalk.gray('  $ adpilot auth login              # Set your access token\n') +
      chalk.gray('  $ adpilot config set adAccountId act_XXXXX\n') +
      chalk.gray('  $ adpilot campaigns list           # List your campaigns\n') +
      chalk.gray('  $ adpilot insights account          # View account insights')
  )
  .version('1.0.0', '-v, --version');

// Register all command groups
registerAuthCommands(program);
registerConfigCommands(program);
registerAccountCommands(program);
registerCampaignCommands(program);
registerAdSetCommands(program);
registerAdCommands(program);
registerCreativeCommands(program);
registerInsightsCommands(program);

// Global error handling
program.exitOverride();

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (err: any) {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(0);
    }
    if (err.code === 'commander.missingMandatoryOptionValue' || err.code === 'commander.missingArgument') {
      // Commander already printed the error
      process.exit(1);
    }
    console.error(chalk.red(`Error: ${err.message}`));
    process.exit(1);
  }
}

main();
