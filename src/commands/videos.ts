import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import { Command } from 'commander';
import { apiGet, apiDelete } from '../lib/api';
import { getAdAccountId, getToken, getConfig } from '../lib/config';
import { output, printRecord, printTable, success, error } from '../utils/output';
import {
  createSpinner,
  formatDate,
  truncate,
} from '../utils/helpers';

/**
 * Build a multipart/form-data body from key-value fields and an optional file.
 */
function createMultipartBody(
  fields: Record<string, string>,
  filePath?: string,
  fileFieldName = 'source'
): { body: Buffer; contentType: string } {
  const boundary = '----AdPilotBoundary' + Date.now();
  const parts: Buffer[] = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      )
    );
  }

  if (filePath) {
    const fileName = path.basename(filePath);
    const fileContent = fs.readFileSync(filePath);
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r\nContent-Type: application/octet-stream\r\n\r\n`
      )
    );
    parts.push(fileContent);
    parts.push(Buffer.from('\r\n'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function formatDuration(seconds: number | string | undefined): string {
  if (seconds === undefined || seconds === null) return '-';
  const secs = typeof seconds === 'string' ? parseFloat(seconds) : seconds;
  if (isNaN(secs)) return '-';
  const mins = Math.floor(secs / 60);
  const remaining = Math.round(secs % 60);
  return mins > 0 ? `${mins}m ${remaining}s` : `${remaining}s`;
}

export function registerVideoCommands(program: Command): void {
  const videos = program
    .command('videos')
    .alias('video')
    .alias('vid')
    .description('Manage ad videos');

  // UPLOAD
  videos
    .command('upload <filePath>')
    .description('Upload a video file to your ad account')
    .option('--title <title>', 'Video title')
    .option('--description <desc>', 'Video description')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (filePath: string, opts) => {
      const spinner = createSpinner('Uploading video...');
      spinner.start();
      try {
        const resolvedPath = path.resolve(filePath);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`File not found: ${resolvedPath}`);
        }

        const accountId = opts.accountId || getAdAccountId();
        const accessToken = getToken();
        const { apiVersion } = getConfig();

        const fields: Record<string, string> = {
          access_token: accessToken,
        };
        if (opts.title) fields.title = opts.title;
        if (opts.description) fields.description = opts.description;

        const { body, contentType } = createMultipartBody(
          fields,
          resolvedPath,
          'source'
        );

        const url = `https://graph-video.facebook.com/${apiVersion}/${accountId}/advideos`;
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body,
        });

        const data = (await response.json()) as any;
        spinner.stop();

        if (data.error) {
          throw new Error(
            `[${data.error.code}] ${data.error.type}: ${data.error.message}`
          );
        }

        if (opts.json) {
          output(data, 'json');
        } else {
          printRecord(
            {
              id: data.id,
              title: opts.title || '-',
              file: path.basename(resolvedPath),
            },
            'Video Uploaded'
          );
          success(`Video ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // LIST
  videos
    .command('list')
    .alias('ls')
    .description('List videos in your ad account')
    .option('--account-id <id>', 'Ad account ID')
    .option('--limit <n>', 'Max results', '25')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching videos...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const fields =
          'id,title,description,length,source,created_time,updated_time,thumbnails';

        const data = await apiGet(`${accountId}/advideos`, {
          fields,
          limit: opts.limit,
        });
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const rows = (data.data || []).map((v: any) => [
            v.id,
            truncate(v.title || '-', 30),
            formatDuration(v.length),
            formatDate(v.created_time),
          ]);
          printTable(['ID', 'Title', 'Duration', 'Created'], rows, 'Ad Videos');
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // GET
  videos
    .command('get <videoId>')
    .description('Get video details')
    .option('--json', 'Output as JSON')
    .action(async (videoId: string, opts) => {
      const spinner = createSpinner('Fetching video...');
      spinner.start();
      try {
        const fields =
          'id,title,description,length,source,embed_html,thumbnails,created_time,updated_time';
        const data = await apiGet(videoId, { fields });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          printRecord(
            {
              id: data.id,
              title: data.title || '-',
              description: data.description || '-',
              duration: formatDuration(data.length),
              source: data.source || '-',
              embedHtml: data.embed_html
                ? truncate(data.embed_html, 60)
                : '-',
              thumbnails: data.thumbnails,
              created: formatDate(data.created_time),
              updated: formatDate(data.updated_time),
            },
            'Video Details'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  videos
    .command('delete <videoId>')
    .alias('rm')
    .description('Delete a video')
    .action(async (videoId: string) => {
      const spinner = createSpinner('Deleting video...');
      spinner.start();
      try {
        await apiDelete(videoId);
        spinner.stop();
        success(`Video ${videoId} deleted.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
