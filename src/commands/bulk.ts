import { Command } from 'commander';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { apiPost, apiDelete } from '../lib/api';
import { success, error, warn, info, printJson, printTable } from '../utils/output';
import { createSpinner, parseKeyValue } from '../utils/helpers';

// --- Types ---

type ObjectType = 'campaign' | 'adset' | 'ad';
const VALID_TYPES: ObjectType[] = ['campaign', 'adset', 'ad'];

interface BulkResult {
  id: string;
  success: boolean;
  error?: string;
}

interface BulkOptions {
  type: ObjectType;
  ids?: string;
  stdin?: boolean;
  json?: boolean;
  set?: string[];
}

// --- Helpers ---

async function readStdinIds(): Promise<string[]> {
  if (process.stdin.isTTY) return [];
  const rl = createInterface({ input: process.stdin });
  const ids: string[] = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) ids.push(trimmed);
  }
  return ids;
}

async function resolveIds(opts: BulkOptions): Promise<string[]> {
  let ids: string[] = [];

  if (opts.ids) {
    ids = opts.ids.split(',').map((id) => id.trim()).filter(Boolean);
  }

  if (opts.stdin) {
    const stdinIds = await readStdinIds();
    ids = ids.concat(stdinIds);
  }

  // Deduplicate
  return [...new Set(ids)];
}

function validateType(type: string): ObjectType {
  if (!VALID_TYPES.includes(type as ObjectType)) {
    throw new Error(
      `Invalid type "${type}". Must be one of: ${VALID_TYPES.join(', ')}`
    );
  }
  return type as ObjectType;
}

function printSummary(results: BulkResult[], action: string, jsonOutput: boolean): void {
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  if (jsonOutput) {
    printJson({
      action,
      total: results.length,
      succeeded: succeeded.length,
      failed: failed.length,
      results,
    });
    return;
  }

  console.log('');
  if (succeeded.length > 0) {
    success(`${succeeded.length}/${results.length} ${action} successfully`);
  }
  if (failed.length > 0) {
    error(`${failed.length}/${results.length} failed:`);
    const headers = ['ID', 'Error'];
    const rows = failed.map((r) => [r.id, r.error || 'Unknown error']);
    printTable(headers, rows);
  }
}

// --- Bulk operations ---

async function bulkUpdateStatus(
  ids: string[],
  status: string,
  type: ObjectType,
  jsonOutput: boolean
): Promise<void> {
  const action = status === 'PAUSED' ? 'paused' : status === 'ACTIVE' ? 'resumed' : status.toLowerCase();
  const spinner = createSpinner(`Processing ${ids.length} ${type}(s)...`);
  if (!jsonOutput) spinner.start();

  const results: BulkResult[] = [];

  for (const id of ids) {
    try {
      await apiPost(id, { status });
      results.push({ id, success: true });
      if (!jsonOutput) {
        spinner.text = `${action}: ${id} (${results.length}/${ids.length})`;
      }
    } catch (err: any) {
      results.push({ id, success: false, error: err.message });
    }
  }

  if (!jsonOutput) spinner.stop();
  printSummary(results, action, jsonOutput);
}

async function bulkDelete(
  ids: string[],
  type: ObjectType,
  jsonOutput: boolean
): Promise<void> {
  if (!jsonOutput) {
    warn(`About to delete ${ids.length} ${type}(s). This cannot be undone.`);
    // In a non-interactive pipe context, proceed. For TTY, we warn but proceed
    // since there's no interactive prompt in this CLI pattern.
  }

  const spinner = createSpinner(`Deleting ${ids.length} ${type}(s)...`);
  if (!jsonOutput) spinner.start();

  const results: BulkResult[] = [];

  for (const id of ids) {
    try {
      await apiDelete(id);
      results.push({ id, success: true });
      if (!jsonOutput) {
        spinner.text = `Deleted: ${id} (${results.length}/${ids.length})`;
      }
    } catch (err: any) {
      results.push({ id, success: false, error: err.message });
    }
  }

  if (!jsonOutput) spinner.stop();
  printSummary(results, 'deleted', jsonOutput);
}

async function bulkUpdate(
  ids: string[],
  type: ObjectType,
  fields: Record<string, string>,
  jsonOutput: boolean
): Promise<void> {
  const fieldKeys = Object.keys(fields).join(', ');
  const spinner = createSpinner(`Updating ${ids.length} ${type}(s) [${fieldKeys}]...`);
  if (!jsonOutput) spinner.start();

  const results: BulkResult[] = [];

  for (const id of ids) {
    try {
      await apiPost(id, fields);
      results.push({ id, success: true });
      if (!jsonOutput) {
        spinner.text = `Updated: ${id} (${results.length}/${ids.length})`;
      }
    } catch (err: any) {
      results.push({ id, success: false, error: err.message });
    }
  }

  if (!jsonOutput) spinner.stop();
  printSummary(results, 'updated', jsonOutput);
}

// --- Register commands ---

export function registerBulkCommands(program: Command): void {
  const bulk = program
    .command('bulk')
    .description('Bulk operations on multiple objects (campaigns, ad sets, ads)');

  // PAUSE
  bulk
    .command('pause')
    .description('Pause multiple objects by ID')
    .requiredOption('--type <type>', 'Object type: campaign, adset, or ad')
    .option('--ids <ids>', 'Comma-separated list of IDs')
    .option('--stdin', 'Read IDs from stdin (one per line)')
    .option('--json', 'Output results as JSON')
    .action(async (opts) => {
      const type = validateType(opts.type);
      const ids = await resolveIds(opts);
      if (ids.length === 0) {
        error('No IDs provided. Use --ids or --stdin to supply object IDs.');
        return;
      }
      if (!opts.json) {
        info(`Pausing ${ids.length} ${type}(s)...`);
      }
      await bulkUpdateStatus(ids, 'PAUSED', type, !!opts.json);
    });

  // RESUME
  bulk
    .command('resume')
    .description('Resume (activate) multiple objects by ID')
    .requiredOption('--type <type>', 'Object type: campaign, adset, or ad')
    .option('--ids <ids>', 'Comma-separated list of IDs')
    .option('--stdin', 'Read IDs from stdin (one per line)')
    .option('--json', 'Output results as JSON')
    .action(async (opts) => {
      const type = validateType(opts.type);
      const ids = await resolveIds(opts);
      if (ids.length === 0) {
        error('No IDs provided. Use --ids or --stdin to supply object IDs.');
        return;
      }
      if (!opts.json) {
        info(`Resuming ${ids.length} ${type}(s)...`);
      }
      await bulkUpdateStatus(ids, 'ACTIVE', type, !!opts.json);
    });

  // DELETE
  bulk
    .command('delete')
    .description('Delete multiple objects by ID')
    .requiredOption('--type <type>', 'Object type: campaign, adset, or ad')
    .option('--ids <ids>', 'Comma-separated list of IDs')
    .option('--stdin', 'Read IDs from stdin (one per line)')
    .option('--json', 'Output results as JSON')
    .action(async (opts) => {
      const type = validateType(opts.type);
      const ids = await resolveIds(opts);
      if (ids.length === 0) {
        error('No IDs provided. Use --ids or --stdin to supply object IDs.');
        return;
      }
      await bulkDelete(ids, type, !!opts.json);
    });

  // UPDATE
  bulk
    .command('update')
    .description('Update a field on multiple objects')
    .requiredOption('--type <type>', 'Object type: campaign, adset, or ad')
    .option('--ids <ids>', 'Comma-separated list of IDs')
    .option('--stdin', 'Read IDs from stdin (one per line)')
    .option('--set <pairs...>', 'Key=value pairs to set (e.g., --set daily_budget=5000)')
    .option('--json', 'Output results as JSON')
    .action(async (opts) => {
      const type = validateType(opts.type);
      const ids = await resolveIds(opts);
      if (ids.length === 0) {
        error('No IDs provided. Use --ids or --stdin to supply object IDs.');
        return;
      }
      if (!opts.set || opts.set.length === 0) {
        error('No fields to update. Use --set key=value to specify updates.');
        return;
      }
      const fields = parseKeyValue(opts.set);
      if (!opts.json) {
        info(`Updating ${ids.length} ${type}(s): ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
      await bulkUpdate(ids, type, fields, !!opts.json);
    });
}
