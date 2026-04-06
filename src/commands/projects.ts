import { Command } from 'commander';
import chalk from 'chalk';
import { apiGet } from '../lib/api';
import {
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  linkCampaign,
  unlinkCampaign,
  IPProject,
} from '../lib/registry';
import { output, printTable, printRecord, printJson, success, error, warn } from '../utils/output';
import { createSpinner, formatBudget, DATE_PRESETS } from '../utils/helpers';

export function registerProjectCommands(program: Command): void {
  const projects = program
    .command('projects')
    .alias('project')
    .alias('ip')
    .description('Manage IP / product projects in the local registry');

  // LIST
  projects
    .command('list')
    .alias('ls')
    .description('List all registered IP projects')
    .option('--status <status>', 'Filter by status (active, paused, completed, killed)')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        let items = listProjects();

        if (opts.status) {
          const filterStatus = opts.status.toLowerCase();
          items = items.filter((p) => p.status === filterStatus);
        }

        if (opts.json) {
          printJson(items);
          return;
        }

        if (items.length === 0) {
          console.log(chalk.yellow('No projects found. Create one with: adpilot projects create --name <name>'));
          return;
        }

        const rows = items.map((p) => [
          p.id,
          p.name,
          projectStatusColor(p.status),
          String(p.campaignIds.length),
          p.budgetCents != null ? formatBudget(p.budgetCents) : '-',
          p.tags?.join(', ') || '-',
        ]);

        printTable(
          ['ID', 'Name', 'Status', 'Campaigns', 'Budget', 'Tags'],
          rows,
          'IP Projects'
        );
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // CREATE
  projects
    .command('create')
    .description('Register a new IP/product for testing')
    .requiredOption('-n, --name <name>', 'Project name')
    .option('-d, --description <desc>', 'Project description')
    .option('-u, --url <url>', 'Landing page / product URL')
    .option('-a, --audience <desc>', 'Target audience description')
    .option('-b, --budget <cents>', 'Total budget in cents')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const project = createProject({
          name: opts.name,
          description: opts.description,
          url: opts.url,
          targetAudience: opts.audience,
          budgetCents: opts.budget ? parseInt(opts.budget, 10) : undefined,
          tags: opts.tags ? opts.tags.split(',').map((t: string) => t.trim()) : undefined,
        });

        if (opts.json) {
          printJson(project);
        } else {
          success(`Project created: ${project.id}`);
          printProjectRecord(project);
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // GET
  projects
    .command('get <projectId>')
    .description('Show project details including all linked campaign IDs')
    .option('--json', 'Output as JSON')
    .action(async (projectId, opts) => {
      try {
        const project = getProject(projectId);
        if (!project) {
          error(`Project "${projectId}" not found.`);
          process.exit(1);
          return;
        }

        if (opts.json) {
          printJson(project);
        } else {
          printProjectRecord(project);
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // UPDATE
  projects
    .command('update <projectId>')
    .description('Update a project')
    .option('-n, --name <name>', 'Project name')
    .option('-d, --description <desc>', 'Project description')
    .option('-u, --url <url>', 'Landing page / product URL')
    .option('-b, --budget <cents>', 'Total budget in cents')
    .option('-s, --status <status>', 'Status: active, paused, completed, killed')
    .option('-t, --tags <tags>', 'Comma-separated tags')
    .option('--json', 'Output as JSON')
    .action(async (projectId, opts) => {
      try {
        const updates: Partial<IPProject> = {};
        if (opts.name) updates.name = opts.name;
        if (opts.description) updates.description = opts.description;
        if (opts.url) updates.url = opts.url;
        if (opts.budget) updates.budgetCents = parseInt(opts.budget, 10);
        if (opts.status) updates.status = opts.status.toLowerCase() as IPProject['status'];
        if (opts.tags) updates.tags = opts.tags.split(',').map((t: string) => t.trim());

        if (Object.keys(updates).length === 0) {
          error('No fields to update. Provide at least one option.');
          process.exit(1);
          return;
        }

        const project = updateProject(projectId, updates);

        if (opts.json) {
          printJson(project);
        } else {
          success(`Project "${projectId}" updated.`);
          printProjectRecord(project);
        }
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE
  projects
    .command('delete <projectId>')
    .alias('rm')
    .description('Remove a project from the registry (does NOT delete Meta campaigns)')
    .action(async (projectId) => {
      try {
        deleteProject(projectId);
        success(`Project "${projectId}" removed from registry.`);
        warn('Note: Associated Meta campaigns were NOT deleted.');
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // LINK
  projects
    .command('link <projectId> <campaignId>')
    .description('Associate a Meta campaign ID with this project')
    .action(async (projectId, campaignId) => {
      try {
        linkCampaign(projectId, campaignId);
        success(`Campaign ${campaignId} linked to project "${projectId}".`);
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // UNLINK
  projects
    .command('unlink <projectId> <campaignId>')
    .description('Remove campaign association from project')
    .action(async (projectId, campaignId) => {
      try {
        unlinkCampaign(projectId, campaignId);
        success(`Campaign ${campaignId} unlinked from project "${projectId}".`);
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // REPORT
  projects
    .command('report <projectId>')
    .description('Fetch aggregated insights across all linked campaigns for this project')
    .option(
      '--date-preset <preset>',
      `Date preset: ${DATE_PRESETS.join(', ')}`,
      'last_7d'
    )
    .option('--since <date>', 'Start date (YYYY-MM-DD)')
    .option('--until <date>', 'End date (YYYY-MM-DD)')
    .option('--json', 'Output as JSON')
    .action(async (projectId, opts) => {
      const spinner = createSpinner('Fetching project insights...');
      spinner.start();
      try {
        const project = getProject(projectId);
        if (!project) {
          spinner.stop();
          error(`Project "${projectId}" not found.`);
          process.exit(1);
          return;
        }

        if (project.campaignIds.length === 0) {
          spinner.stop();
          warn(`Project "${projectId}" has no linked campaigns. Link campaigns first with: adpilot projects link ${projectId} <campaignId>`);
          return;
        }

        const insightsFields = 'campaign_name,impressions,clicks,spend,cpc,ctr,reach,actions';
        const params: Record<string, any> = { fields: insightsFields };

        if (opts.since && opts.until) {
          params.time_range = { since: opts.since, until: opts.until };
        } else {
          params.date_preset = opts.datePreset;
        }

        let totalSpend = 0;
        let totalImpressions = 0;
        let totalClicks = 0;
        let totalReach = 0;
        const campaignResults: any[] = [];

        for (const campaignId of project.campaignIds) {
          try {
            const data = await apiGet(`${campaignId}/insights`, params);
            const rows = data.data || [];
            for (const row of rows) {
              const spend = parseFloat(row.spend || '0');
              const impressions = parseInt(row.impressions || '0', 10);
              const clicks = parseInt(row.clicks || '0', 10);
              const reach = parseInt(row.reach || '0', 10);

              totalSpend += spend;
              totalImpressions += impressions;
              totalClicks += clicks;
              totalReach += reach;

              campaignResults.push({
                campaignId,
                campaignName: row.campaign_name || campaignId,
                spend,
                impressions,
                clicks,
                reach,
                ctr: row.ctr ? parseFloat(row.ctr) : 0,
                cpc: row.cpc ? parseFloat(row.cpc) : 0,
              });
            }
          } catch (err: any) {
            campaignResults.push({
              campaignId,
              campaignName: campaignId,
              error: err.message,
            });
          }
        }

        spinner.stop();

        const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

        const summary = {
          project: project.name,
          projectId: project.id,
          linkedCampaigns: project.campaignIds.length,
          totalSpend: `$${totalSpend.toFixed(2)}`,
          totalImpressions,
          totalClicks,
          totalReach,
          avgCtr: `${avgCtr.toFixed(2)}%`,
          avgCpc: `$${avgCpc.toFixed(2)}`,
        };

        if (opts.json) {
          printJson({ summary, campaigns: campaignResults });
        } else {
          printRecord(summary, `Project Report: ${project.name}`);

          if (campaignResults.length > 0) {
            const rows = campaignResults.map((c) => [
              c.campaignId,
              c.campaignName,
              c.error ? chalk.red('ERROR') : `$${c.spend.toFixed(2)}`,
              c.error ? '-' : String(c.impressions),
              c.error ? '-' : String(c.clicks),
              c.error ? '-' : `${c.ctr.toFixed(2)}%`,
              c.error ? '-' : `$${c.cpc.toFixed(2)}`,
              c.error ? c.error : String(c.reach),
            ]);

            printTable(
              ['Campaign ID', 'Name', 'Spend', 'Impressions', 'Clicks', 'CTR', 'CPC', 'Reach'],
              rows,
              'Per-Campaign Breakdown'
            );
          }
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}

function projectStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return chalk.green(status);
    case 'paused':
      return chalk.yellow(status);
    case 'completed':
      return chalk.blue(status);
    case 'killed':
      return chalk.red(status);
    default:
      return status || '-';
  }
}

function printProjectRecord(project: IPProject): void {
  printRecord(
    {
      id: project.id,
      name: project.name,
      status: projectStatusColor(project.status),
      description: project.description || '-',
      url: project.url || '-',
      targetAudience: project.targetAudience || '-',
      budget: project.budgetCents != null ? formatBudget(project.budgetCents) : '-',
      campaigns: project.campaignIds.length > 0 ? project.campaignIds.join(', ') : 'none',
      tags: project.tags?.join(', ') || '-',
      created: project.createdAt,
      updated: project.updatedAt,
    },
    'Project Details'
  );
}
