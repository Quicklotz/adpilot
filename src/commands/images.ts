import fs from 'fs';
import path from 'path';
import { Command } from 'commander';
import { apiGet, apiPost } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { output, printRecord, printTable, success, error } from '../utils/output';
import {
  createSpinner,
  formatDate,
  truncate,
  buildFieldsParam,
} from '../utils/helpers';

export function registerImageCommands(program: Command): void {
  const images = program
    .command('images')
    .alias('image')
    .alias('img')
    .description('Manage ad images');

  // UPLOAD
  images
    .command('upload <filePath>')
    .description('Upload an image to your ad account')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (filePath: string, opts) => {
      const spinner = createSpinner('Uploading image...');
      spinner.start();
      try {
        const resolvedPath = path.resolve(filePath);
        if (!fs.existsSync(resolvedPath)) {
          throw new Error(`File not found: ${resolvedPath}`);
        }

        const imageData = fs.readFileSync(resolvedPath);
        const base64 = imageData.toString('base64');
        const fileName = path.basename(resolvedPath);

        const accountId = opts.accountId || getAdAccountId();

        const data = await apiPost(`${accountId}/adimages`, {
          bytes: base64,
        });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          // Response format: { images: { <filename>: { hash, url, ... } } }
          const imagesData = data.images;
          if (imagesData) {
            const keys = Object.keys(imagesData);
            if (keys.length > 0) {
              const img = imagesData[keys[0]];
              printRecord(
                {
                  hash: img.hash,
                  url: img.url || '-',
                  name: keys[0],
                  file: fileName,
                },
                'Image Uploaded'
              );
              success(`Image hash: ${img.hash}`);
            } else {
              success('Image uploaded.');
              output(data, 'json');
            }
          } else {
            success('Image uploaded.');
            output(data, 'json');
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // LIST
  images
    .command('list')
    .alias('ls')
    .description('List images in your ad account')
    .option('--account-id <id>', 'Ad account ID')
    .option('--limit <n>', 'Max results', '25')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching images...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const fields = 'hash,name,url,width,height,created_time';

        const data = await apiGet(`${accountId}/adimages`, {
          fields,
          limit: opts.limit,
        });
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const rows = (data.data || []).map((img: any) => [
            img.hash || '-',
            truncate(img.name || '-', 30),
            img.width && img.height ? `${img.width}x${img.height}` : '-',
            formatDate(img.created_time),
            truncate(img.url || '-', 40),
          ]);
          printTable(
            ['Hash', 'Name', 'Size', 'Created', 'URL'],
            rows,
            'Ad Images'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
