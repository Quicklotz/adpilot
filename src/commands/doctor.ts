import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConfig, getToken, getAdAccountId } from '../lib/config';
import { apiGet } from '../lib/api';
import { isLoggingEnabled, getLogFiles } from '../lib/logger';
import { info, success, warn, error } from '../utils/output';

interface CheckResult {
  label: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  fixable?: boolean;
  fixHint?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.adpilot');
const LOG_DIR = path.join(CONFIG_DIR, 'logs');

// --- Individual check functions ---

function checkNodeVersion(): CheckResult {
  const version = process.version; // e.g., "v20.11.0"
  const match = version.match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return {
      label: 'Node.js version',
      status: 'fail',
      message: `Could not parse Node.js version: ${version}`,
    };
  }

  const major = parseInt(match[1], 10);
  if (major >= 16) {
    return {
      label: 'Node.js version',
      status: 'pass',
      message: `Node.js ${version} (>= 16.0.0)`,
    };
  }

  return {
    label: 'Node.js version',
    status: 'fail',
    message: `Node.js ${version} is too old (requires >= 16.0.0)`,
    fixHint: 'Upgrade Node.js to version 16 or later',
  };
}

function checkConfigDirectory(): CheckResult {
  if (!fs.existsSync(CONFIG_DIR)) {
    return {
      label: 'Config directory',
      status: 'fail',
      message: `Config directory (~/.adpilot/) does not exist`,
      fixable: true,
      fixHint: 'Will create ~/.adpilot/ directory',
    };
  }

  try {
    fs.accessSync(CONFIG_DIR, fs.constants.W_OK);
    return {
      label: 'Config directory',
      status: 'pass',
      message: 'Config directory (~/.adpilot/)',
    };
  } catch {
    return {
      label: 'Config directory',
      status: 'fail',
      message: 'Config directory (~/.adpilot/) is not writable',
      fixHint: 'Fix permissions: chmod 755 ~/.adpilot',
    };
  }
}

function checkAccessToken(): CheckResult {
  const cfg = getConfig();
  const token =
    cfg.accessToken ||
    process.env.ADPILOT_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN;

  if (token) {
    const source = cfg.accessToken
      ? (cfg.activeProfile ? `profile: ${cfg.activeProfile}` : 'config')
      : (process.env.ADPILOT_TOKEN ? 'env: ADPILOT_TOKEN' : 'env: FACEBOOK_ACCESS_TOKEN');
    return {
      label: 'Access token',
      status: 'pass',
      message: `Access token configured (source: ${source})`,
    };
  }

  return {
    label: 'Access token',
    status: 'fail',
    message: 'No access token configured',
    fixHint: 'Run `adpilot auth login` or `adpilot setup`',
  };
}

async function checkTokenValidity(): Promise<CheckResult> {
  const cfg = getConfig();
  const token =
    cfg.accessToken ||
    process.env.ADPILOT_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN;

  if (!token) {
    return {
      label: 'Token validity',
      status: 'fail',
      message: 'No token to validate',
    };
  }

  try {
    const response = await apiGet('me', { fields: 'id,name' }, token);
    if (response.id && response.name) {
      return {
        label: 'Token validity',
        status: 'pass',
        message: `Token valid (user: ${response.name}, ID: ${response.id})`,
      };
    }
    return {
      label: 'Token validity',
      status: 'fail',
      message: 'Token returned unexpected response',
      fixHint: 'Run `adpilot auth login` to set a new token',
    };
  } catch (err: any) {
    return {
      label: 'Token validity',
      status: 'fail',
      message: `Token invalid: ${err.message}`,
      fixHint: 'Run `adpilot auth login` or `adpilot auth oauth` to get a new token',
    };
  }
}

function checkTokenExpiry(): CheckResult {
  const cfg = getConfig();
  const expiresAt = cfg.tokenExpiresAt;

  if (!expiresAt) {
    return {
      label: 'Token expiry',
      status: 'pass',
      message: 'No expiry information stored (token may be non-expiring)',
    };
  }

  const nowSec = Math.floor(Date.now() / 1000);

  if (nowSec >= expiresAt) {
    return {
      label: 'Token expiry',
      status: 'fail',
      message: `Token expired on ${new Date(expiresAt * 1000).toLocaleString()}`,
      fixHint: 'Run `adpilot auth refresh` or `adpilot auth oauth` to get a new token',
    };
  }

  const remainingSec = expiresAt - nowSec;
  const remainingHours = Math.round((remainingSec / 3600) * 10) / 10;
  const remainingDays = Math.round((remainingSec / 86400) * 10) / 10;

  if (remainingSec < 24 * 3600) {
    return {
      label: 'Token expiry',
      status: 'warn',
      message: `Token expires in ${remainingHours} hour(s)`,
      fixHint: 'Run `adpilot auth refresh` to extend the token',
    };
  }

  if (remainingSec < 7 * 24 * 3600) {
    return {
      label: 'Token expiry',
      status: 'warn',
      message: `Token expires in ${remainingDays} day(s)`,
      fixHint: 'Run `adpilot auth refresh` to extend the token',
    };
  }

  return {
    label: 'Token expiry',
    status: 'pass',
    message: `Token expires in ${remainingDays} day(s) (${new Date(expiresAt * 1000).toLocaleString()})`,
  };
}

function checkAdAccountId(): CheckResult {
  const cfg = getConfig();
  const id =
    cfg.adAccountId ||
    process.env.ADPILOT_ACCOUNT_ID ||
    process.env.FACEBOOK_AD_ACCOUNT_ID;

  if (id) {
    const normalized = id.startsWith('act_') ? id : `act_${id}`;
    return {
      label: 'Ad account ID',
      status: 'pass',
      message: `Ad account configured (${normalized})`,
    };
  }

  return {
    label: 'Ad account ID',
    status: 'fail',
    message: 'No ad account ID configured',
    fixHint: 'Run `adpilot config set adAccountId act_XXXXX`',
  };
}

async function checkAdAccountAccess(): Promise<CheckResult> {
  const cfg = getConfig();
  const token =
    cfg.accessToken ||
    process.env.ADPILOT_TOKEN ||
    process.env.FACEBOOK_ACCESS_TOKEN;
  const accountId =
    cfg.adAccountId ||
    process.env.ADPILOT_ACCOUNT_ID ||
    process.env.FACEBOOK_AD_ACCOUNT_ID;

  if (!token || !accountId) {
    return {
      label: 'Ad account access',
      status: 'fail',
      message: 'Cannot check — token or account ID missing',
    };
  }

  const normalizedId = accountId.startsWith('act_') ? accountId : `act_${accountId}`;

  try {
    const response = await apiGet(normalizedId, { fields: 'id,name,account_status' }, token);
    if (response.id) {
      return {
        label: 'Ad account access',
        status: 'pass',
        message: `Ad account accessible (${response.name || normalizedId})`,
      };
    }
    return {
      label: 'Ad account access',
      status: 'fail',
      message: 'Could not access ad account',
      fixHint: 'Check that your token has access to this ad account',
    };
  } catch (err: any) {
    return {
      label: 'Ad account access',
      status: 'fail',
      message: `Ad account not accessible: ${err.message}`,
      fixHint: 'Check token permissions or ad account ID',
    };
  }
}

function checkApiVersion(): CheckResult {
  const cfg = getConfig();
  const version = cfg.apiVersion || 'v25.0';
  const match = version.match(/v?(\d+)\.(\d+)/);

  if (!match) {
    return {
      label: 'API version',
      status: 'warn',
      message: `Could not parse API version: ${version}`,
      fixHint: 'Run `adpilot config set apiVersion v25.0`',
    };
  }

  const major = parseInt(match[1], 10);

  if (major < 20) {
    return {
      label: 'API version',
      status: 'warn',
      message: `API version ${version} may be deprecated (< v20.0)`,
      fixHint: 'Run `adpilot config set apiVersion v25.0` to use a current version',
    };
  }

  return {
    label: 'API version',
    status: 'pass',
    message: `API version ${version}`,
  };
}

function checkShellCompletions(): CheckResult {
  const shell = process.env.SHELL || '';
  let installed = false;

  if (shell.includes('zsh')) {
    const completionFile = path.join(os.homedir(), '.zsh', 'completions', '_adpilot');
    installed = fs.existsSync(completionFile);
  } else if (shell.includes('bash')) {
    const bashrcPath = path.join(os.homedir(), '.bashrc');
    if (fs.existsSync(bashrcPath)) {
      try {
        const content = fs.readFileSync(bashrcPath, 'utf-8');
        installed = content.includes('# adpilot bash completion');
      } catch {
        // Can't read bashrc
      }
    }
  } else if (shell.includes('fish')) {
    const fishFile = path.join(os.homedir(), '.config', 'fish', 'completions', 'adpilot.fish');
    installed = fs.existsSync(fishFile);
  }

  if (installed) {
    return {
      label: 'Shell completions',
      status: 'pass',
      message: 'Shell completions installed',
    };
  }

  return {
    label: 'Shell completions',
    status: 'fail',
    message: 'Shell completions not installed',
    fixable: true,
    fixHint: 'Run `adpilot completions install`',
  };
}

function checkLogging(): CheckResult {
  const enabled = isLoggingEnabled();

  if (!enabled) {
    return {
      label: 'Logging',
      status: 'pass',
      message: 'Logging disabled',
    };
  }

  const logFiles = getLogFiles();
  const logDirExists = fs.existsSync(LOG_DIR);

  if (!logDirExists) {
    return {
      label: 'Logging',
      status: 'warn',
      message: 'Logging enabled but log directory does not exist',
      fixable: true,
      fixHint: 'Will create ~/.adpilot/logs/ directory',
    };
  }

  return {
    label: 'Logging',
    status: 'pass',
    message: `Logging enabled (${logFiles.length} log file${logFiles.length === 1 ? '' : 's'})`,
  };
}

// --- Format result output ---

function formatResult(result: CheckResult): string {
  const icon =
    result.status === 'pass'
      ? chalk.green('  \u2713')
      : result.status === 'warn'
      ? chalk.yellow('  \u26A0')
      : chalk.red('  \u2717');

  let line = `${icon} ${result.message}`;

  if (result.status !== 'pass' && result.fixHint) {
    line += chalk.gray(` \u2014 ${result.fixHint}`);
  }

  return line;
}

// --- Main doctor command ---

export function registerDoctorCommands(program: Command): void {
  const doctor = program
    .command('doctor')
    .description('Diagnose adpilot installation and configuration')
    .action(async () => {
      console.log();
      console.log(chalk.bold.cyan('  adpilot doctor'));
      console.log();

      const results: CheckResult[] = [];

      // Run synchronous checks first
      results.push(checkNodeVersion());
      results.push(checkConfigDirectory());
      results.push(checkAccessToken());

      // Token validity requires API call
      const hasToken = results[2].status === 'pass';
      if (hasToken) {
        results.push(await checkTokenValidity());
      }

      // Token expiry
      results.push(checkTokenExpiry());

      // Ad account ID
      results.push(checkAdAccountId());

      // Ad account access requires API call
      const hasAccountId = results[results.length - 1].status === 'pass';
      if (hasToken && hasAccountId) {
        results.push(await checkAdAccountAccess());
      }

      // API version
      results.push(checkApiVersion());

      // Shell completions
      results.push(checkShellCompletions());

      // Logging
      results.push(checkLogging());

      // Print all results
      for (const result of results) {
        console.log(formatResult(result));
      }

      // Summary
      const passed = results.filter((r) => r.status === 'pass').length;
      const warnings = results.filter((r) => r.status === 'warn').length;
      const failed = results.filter((r) => r.status === 'fail').length;

      console.log();
      const parts: string[] = [];
      if (passed > 0) parts.push(chalk.green(`${passed} passed`));
      if (warnings > 0) parts.push(chalk.yellow(`${warnings} warning${warnings === 1 ? '' : 's'}`));
      if (failed > 0) parts.push(chalk.red(`${failed} failed`));
      console.log(`  ${parts.join(', ')}`);
      console.log();
    });

  // --- doctor fix ---
  doctor
    .command('fix')
    .description('Auto-fix what can be fixed')
    .action(async () => {
      console.log();
      console.log(chalk.bold.cyan('  adpilot doctor fix'));
      console.log();

      let fixCount = 0;
      let manualCount = 0;

      // Fix 1: Create config directory if missing
      if (!fs.existsSync(CONFIG_DIR)) {
        try {
          fs.mkdirSync(CONFIG_DIR, { recursive: true });
          success('Created config directory (~/.adpilot/)');
          fixCount++;
        } catch (err: any) {
          error(`Failed to create config directory: ${err.message}`);
        }
      } else {
        info('Config directory already exists.');
      }

      // Fix 2: Create log directory if logging is enabled but directory is missing
      const loggingEnabled = isLoggingEnabled();
      if (loggingEnabled && !fs.existsSync(LOG_DIR)) {
        try {
          fs.mkdirSync(LOG_DIR, { recursive: true });
          success('Created log directory (~/.adpilot/logs/)');
          fixCount++;
        } catch (err: any) {
          error(`Failed to create log directory: ${err.message}`);
        }
      }

      // Fix 3: Check shell completions
      const completionResult = checkShellCompletions();
      if (completionResult.status === 'fail') {
        info('Shell completions are not installed.');
        info('  Run: adpilot completions install');
        manualCount++;
      } else {
        info('Shell completions already installed.');
      }

      // Fix 4: Check for missing token
      const tokenResult = checkAccessToken();
      if (tokenResult.status === 'fail') {
        warn('No access token configured.');
        info('  Run: adpilot auth login');
        info('  Or:  adpilot setup');
        manualCount++;
      }

      // Fix 5: Check for missing ad account
      const accountResult = checkAdAccountId();
      if (accountResult.status === 'fail') {
        warn('No ad account ID configured.');
        info('  Run: adpilot config set adAccountId act_XXXXX');
        manualCount++;
      }

      // Fix 6: Check API version
      const versionResult = checkApiVersion();
      if (versionResult.status === 'warn') {
        warn(`API version may be outdated: ${getConfig().apiVersion}`);
        info('  Run: adpilot config set apiVersion v25.0');
        manualCount++;
      }

      // Fix 7: Check token expiry
      const expiryResult = checkTokenExpiry();
      if (expiryResult.status === 'fail' || expiryResult.status === 'warn') {
        if (expiryResult.status === 'fail') {
          warn('Token has expired.');
        } else {
          warn('Token is expiring soon.');
        }
        info('  Run: adpilot auth refresh');
        manualCount++;
      }

      console.log();
      if (fixCount > 0) {
        success(`Auto-fixed ${fixCount} issue${fixCount === 1 ? '' : 's'}.`);
      }
      if (manualCount > 0) {
        info(`${manualCount} issue${manualCount === 1 ? '' : 's'} require${manualCount === 1 ? 's' : ''} manual intervention (see suggestions above).`);
      }
      if (fixCount === 0 && manualCount === 0) {
        success('Everything looks good! No fixes needed.');
      }
      console.log();
    });
}
