import { Command } from 'commander';
import { apiGet, apiPost, apiDelete } from '../lib/api';
import { printTable, printRecord, printJson, success, error, writeCsv } from '../utils/output';
import { createSpinner, formatDate, truncate } from '../utils/helpers';

export function registerLeadsCommands(program: Command): void {
  const leads = program
    .command('leads')
    .description('Manage lead gen forms and download leads');

  // LIST FORMS
  leads
    .command('forms')
    .description('List lead gen forms for a page')
    .requiredOption('--page-id <id>', 'Facebook Page ID')
    .option('--limit <n>', 'Max results', '25')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Fetching lead forms...');
      spinner.start();
      try {
        const fields = 'id,name,status,leads_count,created_time,questions';
        const data = await apiGet(`${opts.pageId}/leadgen_forms`, {
          fields,
          limit: opts.limit,
        });
        spinner.stop();

        if (opts.json) {
          printJson(data.data);
        } else {
          const rows = (data.data || []).map((f: any) => [
            f.id,
            truncate(f.name || '-', 35),
            f.status || '-',
            f.leads_count != null ? String(f.leads_count) : '-',
            formatDate(f.created_time),
          ]);
          printTable(
            ['ID', 'Name', 'Status', 'Leads Count', 'Created'],
            rows,
            'Lead Gen Forms'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // GET FORM DETAILS
  leads
    .command('form-get <formId>')
    .description('Get detailed lead form info')
    .option('--json', 'Output as JSON')
    .action(async (formId, opts) => {
      const spinner = createSpinner('Fetching form details...');
      spinner.start();
      try {
        const fields = 'id,name,status,leads_count,questions,privacy_policy_url,created_time';
        const data = await apiGet(formId, { fields });
        spinner.stop();

        if (opts.json) {
          printJson(data);
        } else {
          const questions = (data.questions || []).map((q: any) =>
            q.label ? `${q.type}: ${q.label}` : q.type
          );
          printRecord(
            {
              ID: data.id,
              Name: data.name || '-',
              Status: data.status || '-',
              'Leads Count': data.leads_count != null ? String(data.leads_count) : '-',
              Questions: questions.length > 0 ? questions.join('\n') : '-',
              'Privacy Policy URL': data.privacy_policy_url || '-',
              Created: formatDate(data.created_time),
            },
            'Lead Form Details'
          );
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DOWNLOAD LEADS
  leads
    .command('download <formId>')
    .description('Download leads from a form')
    .option('--limit <n>', 'Max leads to fetch', '100')
    .option('--csv <file>', 'Export to CSV file')
    .option('--json', 'Output as JSON')
    .action(async (formId, opts) => {
      const spinner = createSpinner('Downloading leads...');
      spinner.start();
      try {
        const fields = 'id,created_time,field_data';
        const data = await apiGet(`${formId}/leads`, {
          fields,
          limit: opts.limit,
        });
        spinner.stop();

        const rawLeads = data.data || [];

        if (rawLeads.length === 0) {
          error('No leads found for this form.');
          return;
        }

        // Collect all unique field names from field_data across all leads
        const fieldNamesSet = new Set<string>();
        for (const lead of rawLeads) {
          for (const fd of lead.field_data || []) {
            fieldNamesSet.add(fd.name);
          }
        }
        const fieldNames = Array.from(fieldNamesSet);

        // Flatten leads into rows
        const flatLeads = rawLeads.map((lead: any) => {
          const row: Record<string, string> = {
            id: lead.id,
            created_time: lead.created_time || '',
          };
          for (const name of fieldNames) {
            row[name] = '';
          }
          for (const fd of lead.field_data || []) {
            row[fd.name] = (fd.values || []).join(', ');
          }
          return row;
        });

        if (opts.json) {
          printJson(flatLeads);
        } else if (opts.csv) {
          const headers = ['id', 'created_time', ...fieldNames];
          const csvRows = flatLeads.map((lead: Record<string, string>) =>
            headers.map((h) => lead[h] ?? '')
          );
          writeCsv(opts.csv, headers, csvRows);
          success(`Exported ${flatLeads.length} lead(s) to ${opts.csv}`);
        } else {
          const headers = ['ID', 'Created', ...fieldNames];
          const rows = flatLeads.map((lead: Record<string, string>) => [
            lead.id,
            formatDate(lead.created_time),
            ...fieldNames.map((name) => truncate(lead[name] || '-', 30)),
          ]);
          printTable(headers, rows, `Leads (${flatLeads.length})`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // CREATE FORM
  leads
    .command('create-form')
    .description('Create a new lead gen form')
    .requiredOption('--page-id <id>', 'Facebook Page ID')
    .requiredOption('--name <name>', 'Form name')
    .requiredOption('--questions <json>', 'JSON array of questions')
    .requiredOption('--privacy-policy <url>', 'Privacy policy URL')
    .option('--thank-you-message <text>', 'Thank you screen message')
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      const spinner = createSpinner('Creating lead form...');
      spinner.start();
      try {
        let questions: any[];
        try {
          questions = JSON.parse(opts.questions);
        } catch {
          spinner.stop();
          error('Invalid JSON for --questions. Provide a valid JSON array.');
          process.exit(1);
          return;
        }

        if (!Array.isArray(questions)) {
          spinner.stop();
          error('--questions must be a JSON array.');
          process.exit(1);
          return;
        }

        const body: Record<string, any> = {
          name: opts.name,
          questions,
          privacy_policy: { url: opts.privacyPolicy },
        };

        if (opts.thankYouMessage) {
          body.thank_you_page = { title: 'Thank You', body: opts.thankYouMessage };
        }

        const data = await apiPost(`${opts.pageId}/leadgen_forms`, body);
        spinner.stop();

        if (opts.json) {
          printJson(data);
        } else {
          success(`Lead form created with ID: ${data.id}`);
        }
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // DELETE FORM
  leads
    .command('delete <formId>')
    .alias('rm')
    .description('Delete a lead gen form')
    .action(async (formId) => {
      const spinner = createSpinner('Deleting lead form...');
      spinner.start();
      try {
        await apiDelete(formId);
        spinner.stop();
        success(`Lead form ${formId} deleted.`);
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}
