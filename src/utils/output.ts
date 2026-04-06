import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import Table from 'cli-table3';
import { getConfig } from '../lib/config';

export function printJson(data: any): void {
  console.log(JSON.stringify(data, null, 2));
}

export function printTable(
  headers: string[],
  rows: (string | number | undefined | null)[][],
  title?: string
): void {
  if (title) {
    console.log(chalk.bold.cyan(`\n${title}`));
  }

  const table = new Table({
    head: headers.map((h) => chalk.bold.white(h)),
    style: { head: [], border: [] },
    wordWrap: true,
  });

  for (const row of rows) {
    table.push(row.map((cell) => String(cell ?? '-')));
  }

  console.log(table.toString());
  console.log(chalk.gray(`  ${rows.length} result(s)\n`));
}

export function printRecord(record: Record<string, any>, title?: string): void {
  if (title) {
    console.log(chalk.bold.cyan(`\n${title}`));
  }

  const table = new Table({
    style: { head: [], border: [] },
    wordWrap: true,
    colWidths: [25, 60],
  });

  for (const [key, value] of Object.entries(record)) {
    const displayValue =
      typeof value === 'object' && value !== null
        ? JSON.stringify(value, null, 2)
        : String(value ?? '-');
    table.push([chalk.bold(key), displayValue]);
  }

  console.log(table.toString());
  console.log();
}

export function output(data: any, format?: 'table' | 'json'): void {
  const fmt = format || getConfig().defaultOutputFormat;
  if (fmt === 'json') {
    printJson(data);
  } else {
    if (Array.isArray(data)) {
      if (data.length === 0) {
        console.log(chalk.yellow('No results found.'));
        return;
      }
      const headers = Object.keys(data[0]);
      const rows = data.map((item) => headers.map((h) => item[h]));
      printTable(headers, rows);
    } else {
      printRecord(data);
    }
  }
}

export function success(message: string): void {
  console.log(chalk.green('✓ ') + message);
}

export function error(message: string): void {
  console.error(chalk.red('✗ ') + message);
}

export function warn(message: string): void {
  console.log(chalk.yellow('⚠ ') + message);
}

export function info(message: string): void {
  console.log(chalk.blue('ℹ ') + message);
}

export function writeCsv(
  filePath: string,
  headers: string[],
  rows: (string | number | undefined | null)[][]
): void {
  const escape = (val: any) => {
    const str = String(val ?? '');
    return str.includes(',') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ];
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

export function statusColor(status: string): string {
  switch (status?.toUpperCase()) {
    case 'ACTIVE':
      return chalk.green(status);
    case 'PAUSED':
      return chalk.yellow(status);
    case 'ARCHIVED':
      return chalk.gray(status);
    case 'DELETED':
      return chalk.red(status);
    case 'WITH_ISSUES':
      return chalk.redBright(status);
    case 'IN_PROCESS':
    case 'PENDING_REVIEW':
      return chalk.blue(status);
    default:
      return status || '-';
  }
}
