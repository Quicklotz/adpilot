import { Command } from 'commander';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { output, printRecord, printTable, success, error } from '../utils/output';
import {
  createSpinner,
  formatDate,
  truncate,
  buildFieldsParam,
  CTA_TYPES,
} from '../utils/helpers';
import { statusColor } from '../utils/output';

export function registerCreativeCommands(program: Command): void {
  const creatives = program
    .command('creatives')
    .alias('creative')
    .description('Manage ad creatives');

  // LIST
  creatives
    .command('list')
    .alias('ls')
    .description('List ad creatives')
    .option('--account-id <id>', 'Ad account ID')
    .option('--limit <n>', 'Max results', '25')
    .option('--fields <fields>', 'Comma-separated fields')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching creatives...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const fields = buildFieldsParam(opts.fields, [
          'id',
          'name',
          'status',
          'object_type',
          'title',
          'body',
          'call_to_action_type',
          'image_url',
          'thumbnail_url',
        ]);

        const data = await apiGet(`${accountId}/adcreatives`, {
          fields,
          limit: opts.limit,
        });
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const rows = (data.data || []).map((c: any) => [
            c.id,
            truncate(c.name || '-', 25),
            statusColor(c.status || '-'),
            c.object_type || '-',
            truncate(c.title || '-', 20),
            truncate(c.body || '-', 30),
            c.call_to_action_type || '-',
          ]);
          printTable(
            ['ID', 'Name', 'Status', 'Type', 'Title', 'Body', 'CTA'],
            rows,
            'Ad Creatives'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // GET
  creatives
    .command('get <creativeId>')
    .description('Get creative details')
    .option('--fields <fields>', 'Comma-separated fields')
    .option('--json', 'Output as JSON')
    .action(async (creativeId, opts) => {
      const spinner = createSpinner('Fetching creative...');
      spinner.start();
      try {
        const fields = buildFieldsParam(opts.fields, [
          'id',
          'name',
          'status',
          'object_type',
          'title',
          'body',
          'call_to_action_type',
          'image_hash',
          'image_url',
          'video_id',
          'thumbnail_url',
          'object_story_spec',
          'object_story_id',
          'link_url',
          'url_tags',
          'actor_id',
          'asset_feed_spec',
          'platform_customizations',
        ]);
        const data = await apiGet(creativeId, { fields });
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          printRecord(
            {
              id: data.id,
              name: data.name,
              status: data.status,
              objectType: data.object_type,
              title: data.title || '-',
              body: data.body || '-',
              ctaType: data.call_to_action_type || '-',
              imageHash: data.image_hash || '-',
              imageUrl: data.image_url || '-',
              videoId: data.video_id || '-',
              thumbnailUrl: data.thumbnail_url || '-',
              objectStorySpec: data.object_story_spec,
              objectStoryId: data.object_story_id || '-',
              linkUrl: data.link_url || '-',
              urlTags: data.url_tags || '-',
              actorId: data.actor_id || '-',
            },
            'Creative Details'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // CREATE
  creatives
    .command('create')
    .description('Create a new ad creative')
    .requiredOption('-n, --name <name>', 'Creative name')
    .option('--object-story-spec <json>', 'Object story spec as JSON (for inline post creation)')
    .option('--object-story-id <id>', 'Existing page post ID to use')
    .option('--title <title>', 'Ad title')
    .option('--body <body>', 'Ad body text')
    .option('--image-hash <hash>', 'Image hash from ad image library')
    .option('--image-url <url>', 'Image URL')
    .option('--video-id <id>', 'Video ID')
    .option('--link-url <url>', 'Destination URL')
    .option('--call-to-action-type <type>', `CTA type: ${CTA_TYPES.join(', ')}`)
    .option('--url-tags <tags>', 'URL tracking parameters')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating creative...');
      spinner.start();
      try {
        const accountId = opts.accountId || getAdAccountId();
        const body: Record<string, any> = {
          name: opts.name,
        };

        if (opts.objectStorySpec) body.object_story_spec = opts.objectStorySpec;
        if (opts.objectStoryId) body.object_story_id = opts.objectStoryId;
        if (opts.title) body.title = opts.title;
        if (opts.body) body.body = opts.body;
        if (opts.imageHash) body.image_hash = opts.imageHash;
        if (opts.imageUrl) body.image_url = opts.imageUrl;
        if (opts.videoId) body.video_id = opts.videoId;
        if (opts.linkUrl) body.link_url = opts.linkUrl;
        if (opts.callToActionType) body.call_to_action_type = opts.callToActionType;
        if (opts.urlTags) body.url_tags = opts.urlTags;

        const data = await apiPost(`${accountId}/adcreatives`, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Creative created with ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // UPDATE
  creatives
    .command('update <creativeId>')
    .description('Update a creative')
    .option('-n, --name <name>', 'Creative name')
    .option('--status <status>', 'ACTIVE or DELETED')
    .option('--json', 'Output as JSON')
    .action(async (creativeId, opts) => {
      const spinner = createSpinner('Updating creative...');
      spinner.start();
      try {
        const body: Record<string, any> = {};
        if (opts.name) body.name = opts.name;
        if (opts.status) body.status = opts.status;

        if (Object.keys(body).length === 0) {
          spinner.stop();
          error('No fields to update.');
          process.exit(1);
        }

        const data = await apiPost(creativeId, body);
        spinner.stop();

        if (opts.json) {
          output(data, 'json');
        } else {
          success(`Creative ${creativeId} updated.`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  creatives
    .command('delete <creativeId>')
    .alias('rm')
    .description('Delete a creative')
    .action(async (creativeId) => {
      const spinner = createSpinner('Deleting creative...');
      spinner.start();
      try {
        await apiDelete(creativeId);
        spinner.stop();
        success(`Creative ${creativeId} deleted.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // PREVIEW
  creatives
    .command('preview <creativeId>')
    .description('Preview a creative')
    .option('--format <format>', 'Ad format', 'DESKTOP_FEED_STANDARD')
    .option('--json', 'Output as JSON')
    .action(async (creativeId, opts) => {
      const spinner = createSpinner('Generating preview...');
      spinner.start();
      try {
        const data = await apiGet(`${creativeId}/previews`, {
          ad_format: opts.format,
        });
        spinner.stop();

        if (opts.json) {
          output(data.data, 'json');
        } else {
          const previews = data.data || [];
          for (const preview of previews) {
            console.log(preview.body);
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
