import { Command } from 'commander';
import inquirer from 'inquirer';
import fs from 'fs';
import chalk from 'chalk';
import { apiGet } from '../lib/api';
import { getAdAccountId } from '../lib/config';
import { output, printTable, printRecord, printJson, success, error, info } from '../utils/output';
import { createSpinner } from '../utils/helpers';

// Targeting search types supported by Meta API
const TARGETING_SEARCH_TYPES = [
  'adinterest',
  'adinterestsuggestion',
  'adTargetingCategory',
  'adgeolocation',
  'adeducationschool',
  'adworkemployer',
  'adworkposition',
  'adlocale',
] as const;

type TargetingSearchType = typeof TARGETING_SEARCH_TYPES[number];

interface TargetingInterest {
  id: string;
  name: string;
  audience_size?: number;
  path?: string[];
  description?: string;
  topic?: string;
}

export function registerTargetingCommands(program: Command): void {
  const targeting = program
    .command('targeting')
    .description('Build and search targeting specs for ad sets');

  // BUILD — interactive wizard
  targeting
    .command('build')
    .description('Interactive wizard to build a targeting spec JSON')
    .option('--output <file>', 'Write targeting JSON to a file')
    .option('--json', 'Output as raw JSON (no formatting)')
    .action(async (opts) => {
      try {
        const targetingSpec = await runTargetingWizard();

        const jsonStr = JSON.stringify(targetingSpec, null, 2);

        if (opts.output) {
          fs.writeFileSync(opts.output, jsonStr + '\n');
          success(`Targeting spec written to ${opts.output}`);
        }

        if (opts.json) {
          printJson(targetingSpec);
        } else if (!opts.output) {
          console.log(chalk.bold.cyan('\nTargeting Spec'));
          console.log(jsonStr);
        }

        // Print the usage hint
        const compactJson = JSON.stringify(targetingSpec);
        console.log(chalk.gray('\nUse this targeting spec with:'));
        console.log(chalk.gray(`  adpilot adsets create --targeting '${compactJson}'`));
        console.log();
      } catch (err: any) {
        error(err.message);
        process.exit(1);
      }
    });

  // SEARCH — search for targeting options
  targeting
    .command('search <query>')
    .description('Search for targeting options (interests, locations, etc.)')
    .option('--type <type>', `Targeting type: ${TARGETING_SEARCH_TYPES.join(', ')}`, 'adinterest')
    .option('--limit <n>', 'Max results', '10')
    .option('--json', 'Output as JSON')
    .action(async (query, opts) => {
      const searchType = opts.type as TargetingSearchType;

      if (!TARGETING_SEARCH_TYPES.includes(searchType)) {
        error(`Invalid type "${searchType}". Must be one of: ${TARGETING_SEARCH_TYPES.join(', ')}`);
        process.exit(1);
      }

      const spinner = createSpinner(`Searching ${searchType} for "${query}"...`);
      spinner.start();

      try {
        const response = await apiGet('search', {
          type: searchType,
          q: query,
          limit: opts.limit,
        });
        spinner.stop();

        const results = response.data || [];

        if (results.length === 0) {
          info(`No results found for "${query}" (type: ${searchType})`);
          return;
        }

        if (opts.json) {
          output(results, 'json');
          return;
        }

        const rows = results.map((r: TargetingInterest) => [
          r.id,
          r.name,
          searchType,
          r.audience_size != null ? r.audience_size.toLocaleString() : '-',
          r.path ? r.path.join(' > ') : r.description || r.topic || '-',
        ]);

        printTable(
          ['ID', 'Name', 'Type', 'Audience Size', 'Path / Description'],
          rows,
          'Targeting Search Results'
        );
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });

  // ESTIMATE — get audience size estimate
  targeting
    .command('estimate <targetingJson>')
    .description('Get audience size estimate for a targeting spec')
    .option('--account-id <id>', 'Ad account ID')
    .option('--json', 'Output as JSON')
    .action(async (targetingJson, opts) => {
      // Validate JSON
      let parsed: any;
      try {
        parsed = JSON.parse(targetingJson);
      } catch {
        error('Invalid JSON targeting spec. Make sure to wrap it in single quotes.');
        process.exit(1);
      }

      const accountId = opts.accountId || getAdAccountId();
      const spinner = createSpinner('Fetching audience estimate...');
      spinner.start();

      try {
        const response = await apiGet(`${accountId}/delivery_estimate`, {
          targeting_spec: JSON.stringify(parsed),
          optimization_goal: 'REACH',
        });
        spinner.stop();

        const estimates = response.data || [];

        if (opts.json) {
          output(estimates, 'json');
          return;
        }

        if (estimates.length === 0) {
          info('No estimate data returned. The targeting spec may be too narrow or invalid.');
          return;
        }

        const est = estimates[0];
        printRecord(
          {
            dailyReachEstimate: est.daily_outcomes_curve
              ? `${est.daily_outcomes_curve[0]?.reach?.toLocaleString() || '-'} - ${est.daily_outcomes_curve[est.daily_outcomes_curve.length - 1]?.reach?.toLocaleString() || '-'}`
              : '-',
            estimateStatus: est.estimate_status || '-',
            estimateDau: est.estimate_dau != null ? est.estimate_dau.toLocaleString() : '-',
            estimateMauLowerBound: est.estimate_mau_lower_bound != null ? est.estimate_mau_lower_bound.toLocaleString() : '-',
            estimateMauUpperBound: est.estimate_mau_upper_bound != null ? est.estimate_mau_upper_bound.toLocaleString() : '-',
            estimateReady: est.estimate_ready ?? '-',
          },
          'Audience Estimate'
        );
      } catch (err: any) {
        spinner.stop();
        error(err.message);
        process.exit(1);
      }
    });
}

// --- Interactive targeting wizard ---

async function runTargetingWizard(): Promise<Record<string, any>> {
  const targetingSpec: Record<string, any> = {};

  // Step 1: Countries
  const { countries } = await inquirer.prompt([
    {
      type: 'input',
      name: 'countries',
      message: 'Enter target countries (comma-separated codes, e.g., US,UK,CA):',
      default: 'US',
      validate: (input: string) => {
        if (!input.trim()) return 'At least one country code is required.';
        return true;
      },
    },
  ]);
  const countryCodes = countries
    .split(',')
    .map((c: string) => c.trim().toUpperCase())
    .filter((c: string) => c.length > 0);
  targetingSpec.geo_locations = { countries: countryCodes };

  // Step 2: Age range
  const { ageMin, ageMax } = await inquirer.prompt([
    {
      type: 'number',
      name: 'ageMin',
      message: 'Minimum age:',
      default: 18,
      validate: (input: number) => {
        if (input < 13 || input > 65) return 'Age must be between 13 and 65.';
        return true;
      },
    },
    {
      type: 'number',
      name: 'ageMax',
      message: 'Maximum age:',
      default: 65,
      validate: (input: number) => {
        if (input < 13 || input > 65) return 'Age must be between 13 and 65.';
        return true;
      },
    },
  ]);
  targetingSpec.age_min = ageMin;
  targetingSpec.age_max = ageMax;

  // Step 3: Gender
  const { gender } = await inquirer.prompt([
    {
      type: 'list',
      name: 'gender',
      message: 'Target gender:',
      choices: [
        { name: 'All', value: 'all' },
        { name: 'Male', value: 'male' },
        { name: 'Female', value: 'female' },
      ],
    },
  ]);
  if (gender === 'male') {
    targetingSpec.genders = [1];
  } else if (gender === 'female') {
    targetingSpec.genders = [2];
  }
  // For "all", omit genders (Meta default)

  // Step 4: Placements (publisher platforms)
  const { platforms } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'platforms',
      message: 'Select platforms:',
      choices: [
        { name: 'Facebook', value: 'facebook', checked: true },
        { name: 'Instagram', value: 'instagram', checked: true },
        { name: 'Audience Network', value: 'audience_network' },
        { name: 'Messenger', value: 'messenger' },
      ],
      validate: (input: string[]) => {
        if (input.length === 0) return 'Select at least one platform.';
        return true;
      },
    },
  ]);
  targetingSpec.publisher_platforms = platforms;

  // Set platform-specific positions based on selection
  if (platforms.includes('facebook')) {
    targetingSpec.facebook_positions = ['feed', 'right_column'];
  }
  if (platforms.includes('instagram')) {
    targetingSpec.instagram_positions = ['stream', 'story'];
  }

  // Step 5: Device platforms
  const { device } = await inquirer.prompt([
    {
      type: 'list',
      name: 'device',
      message: 'Target devices:',
      choices: [
        { name: 'All', value: 'all' },
        { name: 'Mobile only', value: 'mobile' },
        { name: 'Desktop only', value: 'desktop' },
      ],
    },
  ]);
  if (device === 'mobile') {
    targetingSpec.device_platforms = ['mobile'];
  } else if (device === 'desktop') {
    targetingSpec.device_platforms = ['desktop'];
  } else {
    targetingSpec.device_platforms = ['mobile', 'desktop'];
  }

  // Step 6: Detailed targeting (interests)
  const { interestKeywords } = await inquirer.prompt([
    {
      type: 'input',
      name: 'interestKeywords',
      message: 'Enter interest keywords (comma-separated, or press Enter to skip):',
    },
  ]);

  if (interestKeywords && interestKeywords.trim()) {
    const keywords = interestKeywords
      .split(',')
      .map((k: string) => k.trim())
      .filter((k: string) => k.length > 0);

    const selectedInterests: TargetingInterest[] = [];

    for (const keyword of keywords) {
      const spinner = createSpinner(`Searching interests for "${keyword}"...`);
      spinner.start();

      try {
        const response = await apiGet('search', {
          type: 'adinterest',
          q: keyword,
          limit: 10,
        });
        spinner.stop();

        const results: TargetingInterest[] = response.data || [];

        if (results.length === 0) {
          info(`No interests found for "${keyword}". Skipping.`);
          continue;
        }

        const { selected } = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'selected',
            message: `Select interests for "${keyword}":`,
            choices: results.map((r) => ({
              name: `${r.name} (audience: ${r.audience_size != null ? r.audience_size.toLocaleString() : 'N/A'})`,
              value: r,
              checked: false,
            })),
          },
        ]);

        selectedInterests.push(...selected);
      } catch (err: any) {
        spinner.stop();
        info(`Could not search for "${keyword}": ${err.message}. Skipping.`);
      }
    }

    if (selectedInterests.length > 0) {
      targetingSpec.flexible_spec = [
        {
          interests: selectedInterests.map((i) => ({
            id: i.id,
            name: i.name,
          })),
        },
      ];
    }
  }

  return targetingSpec;
}
