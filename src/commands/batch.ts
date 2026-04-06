import { Command } from 'commander';
import fs from 'fs';
import fetch from 'node-fetch';
import chalk from 'chalk';
import { getConfig, getToken, getAdAccountId } from '../lib/config';
import { success, error, info, printJson, printTable } from '../utils/output';
import { createSpinner } from '../utils/helpers';

// --- Types ---

interface BatchRequest {
  method: string;
  relative_url: string;
  body?: string;
}

interface BatchResponseItem {
  code: number;
  headers: Array<{ name: string; value: string }>;
  body: string;
}

type ObjectType = 'campaign' | 'adset' | 'ad';
type BatchAction = 'get' | 'pause' | 'resume' | 'delete';

const VALID_TYPES: ObjectType[] = ['campaign', 'adset', 'ad'];
const VALID_ACTIONS: BatchAction[] = ['get', 'pause', 'resume', 'delete'];
const MAX_BATCH_SIZE = 50; // Meta API limit per batch request

// --- Core batch execution ---

async function executeBatch(requests: BatchRequest[]): Promise<BatchResponseItem[]> {
  const { apiVersion } = getConfig();
  const token = getToken();

  const url = `https://graph.facebook.com/${apiVersion}/`;
  const formBody = new URLSearchParams();
  formBody.set('access_token', token);
  formBody.set('batch', JSON.stringify(requests));

  const response = await fetch(url, {
    method: 'POST',
    body: formBody,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  if (!response.ok) {
    throw new Error(`Batch API request failed with HTTP ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error(`Unexpected batch API response: ${JSON.stringify(data)}`);
  }

  return data as BatchResponseItem[];
}

async function executeBatchChunked(requests: BatchRequest[]): Promise<BatchResponseItem[]> {
  const results: BatchResponseItem[] = [];

  for (let i = 0; i < requests.length; i += MAX_BATCH_SIZE) {
    const chunk = requests.slice(i, i + MAX_BATCH_SIZE);
    const chunkResults = await executeBatch(chunk);
    results.push(...chunkResults);
  }

  return results;
}

// --- Display helpers ---

function displayBatchResults(
  requests: BatchRequest[],
  responses: BatchResponseItem[],
  jsonOutput: boolean
): void {
  if (jsonOutput) {
    const combined = responses.map((resp, i) => {
      let parsedBody: any;
      try {
        parsedBody = JSON.parse(resp.body);
      } catch {
        parsedBody = resp.body;
      }
      return {
        request: requests[i],
        status: resp.code,
        body: parsedBody,
      };
    });
    printJson(combined);
    return;
  }

  const succeeded = responses.filter((r) => r.code >= 200 && r.code < 300);
  const failed = responses.filter((r) => r.code < 200 || r.code >= 300);

  console.log('');
  for (let i = 0; i < responses.length; i++) {
    const resp = responses[i];
    const req = requests[i];
    const statusColor = resp.code >= 200 && resp.code < 300 ? chalk.green : chalk.red;

    console.log(
      `${statusColor(`[${resp.code}]`)} ${chalk.bold(req.method)} ${req.relative_url}`
    );

    try {
      const body = JSON.parse(resp.body);
      if (body.error) {
        console.log(chalk.red(`  Error: ${body.error.message}`));
      } else if (body.data) {
        console.log(chalk.gray(`  ${body.data.length} result(s) returned`));
      } else if (body.id) {
        console.log(chalk.gray(`  ID: ${body.id}`));
      } else if (body.success !== undefined) {
        console.log(chalk.gray(`  Success: ${body.success}`));
      }
    } catch {
      console.log(chalk.gray(`  ${resp.body}`));
    }
  }

  console.log('');
  success(`${succeeded.length}/${responses.length} requests succeeded`);
  if (failed.length > 0) {
    error(`${failed.length}/${responses.length} requests failed`);
  }
}

// --- Build batch requests from IDs ---

function buildBatchRequests(
  ids: string[],
  action: BatchAction,
  fields?: string
): BatchRequest[] {
  return ids.map((id) => {
    switch (action) {
      case 'get': {
        const fieldsParam = fields || 'id,name,status';
        return {
          method: 'GET',
          relative_url: `${id}?fields=${fieldsParam}`,
        };
      }
      case 'pause':
        return {
          method: 'POST',
          relative_url: id,
          body: 'status=PAUSED',
        };
      case 'resume':
        return {
          method: 'POST',
          relative_url: id,
          body: 'status=ACTIVE',
        };
      case 'delete':
        return {
          method: 'DELETE',
          relative_url: id,
        };
    }
  });
}

// --- Validation ---

function validateBatchRequests(requests: unknown): BatchRequest[] {
  if (!Array.isArray(requests)) {
    throw new Error('Batch file must contain a JSON array of request objects.');
  }

  for (let i = 0; i < requests.length; i++) {
    const req = requests[i];
    if (!req.method || typeof req.method !== 'string') {
      throw new Error(`Request at index ${i} is missing a valid "method" field.`);
    }
    if (!req.relative_url || typeof req.relative_url !== 'string') {
      throw new Error(`Request at index ${i} is missing a valid "relative_url" field.`);
    }
    const method = req.method.toUpperCase();
    if (!['GET', 'POST', 'DELETE'].includes(method)) {
      throw new Error(`Request at index ${i} has invalid method "${req.method}". Must be GET, POST, or DELETE.`);
    }
  }

  return requests as BatchRequest[];
}

// --- Register commands ---

export function registerBatchCommands(program: Command): void {
  const batch = program
    .command('batch')
    .description('Execute batch API requests (multiple calls in a single HTTP request)');

  // RUN: Execute a batch from a JSON file
  batch
    .command('run')
    .description('Execute a batch of API requests from a JSON file')
    .requiredOption('--requests <file>', 'Path to JSON file containing batch requests')
    .option('--json', 'Output results as JSON')
    .action(async (opts) => {
      const filePath = opts.requests;

      if (!fs.existsSync(filePath)) {
        error(`File not found: ${filePath}`);
        return;
      }

      let rawContent: string;
      try {
        rawContent = fs.readFileSync(filePath, 'utf-8');
      } catch (err: any) {
        error(`Failed to read file: ${err.message}`);
        return;
      }

      let requests: BatchRequest[];
      try {
        const parsed = JSON.parse(rawContent);
        requests = validateBatchRequests(parsed);
      } catch (err: any) {
        error(`Invalid batch file: ${err.message}`);
        return;
      }

      if (requests.length === 0) {
        error('Batch file contains no requests.');
        return;
      }

      const spinner = createSpinner(`Executing ${requests.length} batch request(s)...`);
      if (!opts.json) {
        info(`Loaded ${requests.length} request(s) from ${filePath}`);
        spinner.start();
      }

      try {
        const responses = await executeBatchChunked(requests);
        if (!opts.json) spinner.stop();
        displayBatchResults(requests, responses, !!opts.json);
      } catch (err: any) {
        if (!opts.json) spinner.stop();
        error(`Batch request failed: ${err.message}`);
      }
    });

  // FROM-IDS: Build and execute a batch from a list of IDs
  batch
    .command('from-ids')
    .description('Build and execute a batch request from a list of object IDs')
    .requiredOption('--type <type>', 'Object type: campaign, adset, or ad')
    .requiredOption('--ids <ids>', 'Comma-separated list of IDs')
    .requiredOption('--action <action>', 'Action: get, pause, resume, or delete')
    .option('--fields <fields>', 'Comma-separated fields for "get" action (default: id,name,status)')
    .option('--json', 'Output results as JSON')
    .action(async (opts) => {
      // Validate type
      if (!VALID_TYPES.includes(opts.type as ObjectType)) {
        error(`Invalid type "${opts.type}". Must be one of: ${VALID_TYPES.join(', ')}`);
        return;
      }

      // Validate action
      if (!VALID_ACTIONS.includes(opts.action as BatchAction)) {
        error(`Invalid action "${opts.action}". Must be one of: ${VALID_ACTIONS.join(', ')}`);
        return;
      }

      const ids = opts.ids
        .split(',')
        .map((id: string) => id.trim())
        .filter(Boolean);

      if (ids.length === 0) {
        error('No IDs provided.');
        return;
      }

      const action = opts.action as BatchAction;
      const requests = buildBatchRequests(ids, action, opts.fields);

      const spinner = createSpinner(
        `Executing batch ${action} on ${ids.length} ${opts.type}(s)...`
      );
      if (!opts.json) {
        info(
          `Batch ${action} on ${ids.length} ${opts.type}(s) via ${
            Math.ceil(ids.length / MAX_BATCH_SIZE)
          } API call(s)`
        );
        spinner.start();
      }

      try {
        const responses = await executeBatchChunked(requests);
        if (!opts.json) spinner.stop();
        displayBatchResults(requests, responses, !!opts.json);
      } catch (err: any) {
        if (!opts.json) spinner.stop();
        error(`Batch request failed: ${err.message}`);
      }
    });
}
