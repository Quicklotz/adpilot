# adpilot

A powerful CLI for the Meta/Facebook Marketing API. Manage campaigns, ad sets, ads, creatives, audiences, budgets, and performance insights -- all from your terminal. Built for both human use and machine (LLM pipeline) consumption with first-class JSON output and stdin piping.

<!-- Badges -->
<!-- [![npm version](https://img.shields.io/npm/v/adpilot)](https://www.npmjs.com/package/adpilot) -->
<!-- [![license](https://img.shields.io/npm/l/adpilot)](LICENSE) -->

## Features

- **Full Campaign Lifecycle** -- Create, update, pause, resume, archive, copy, and delete campaigns, ad sets, ads, and creatives
- **Performance Insights** -- Pull metrics at any level with date ranges, breakdowns, and CSV export
- **AI Ad Copy Pipeline** -- Generate LLM prompts for ad copy, parse responses into deployable templates, feed performance back for iteration
- **Template Deploy System** -- Define entire campaign stacks in JSON and deploy with a single command
- **Variant Generation** -- Auto-generate combinatorial ad variants across headlines, bodies, CTAs, countries, and age groups
- **Test Cycle Orchestration** -- End-to-end test cycles: deploy, evaluate, kill losers, scale winners
- **Performance Monitoring** -- Threshold-based auto-pause, winner/loser detection with composite scoring
- **Budget Allocation** -- Dynamic cross-project budget allocation by demand score, performance, or equal split
- **Audience Discovery** -- Analyze campaign breakdowns to discover top-performing segments and auto-create targeted ad sets
- **Targeting Builder** -- Interactive wizard and API search for interests, locations, demographics, and audience size estimates
- **A/B Split Testing** -- Create and monitor ad studies with statistical confidence tracking
- **Automated Rules** -- Create metric-based rules to auto-pause, scale, or notify on performance thresholds
- **Lead Management** -- List forms, download leads to CSV, create new lead gen forms
- **Saved Reports** -- Save, run, and compare report templates across time periods with async support
- **Batch API** -- Execute up to 50 API calls in a single HTTP request
- **Webhook Subscriptions** -- Subscribe to ad account change notifications
- **Multi-Account Profiles** -- Switch between multiple ad accounts and tokens instantly
- **OAuth 2.0 Flow** -- Built-in OAuth with long-lived token exchange and refresh
- **Shell Completions** -- Auto-install for Bash, Zsh, and Fish

## Installation

### npm (global)

```bash
npm install -g adpilot
```

### From source

```bash
git clone https://github.com/connorodea/adpilot.git
cd adpilot
npm install
npm run build
npm link
```

### Development

```bash
npm run dev -- campaigns list    # Run via ts-node
```

## Quick Start

```bash
# 1. Authenticate
adpilot auth login

# 2. Set your ad account
adpilot config set adAccountId act_123456789

# 3. List campaigns
adpilot campaigns list

# 4. Pull last 7 days of insights
adpilot insights account --date-preset last_7d

# 5. Export campaign insights to CSV
adpilot insights campaign 123456789 --csv report.csv
```

## Getting a Facebook Access Token

1. Go to [Meta Business Suite](https://business.facebook.com/settings) > **Settings > Users > System Users**
2. Generate a token with `ads_management`, `ads_read`, and `read_insights` permissions
3. Or use the built-in OAuth flow: `adpilot auth oauth --app-id YOUR_APP_ID --app-secret YOUR_SECRET`
4. For testing, use the [Graph API Explorer](https://developers.facebook.com/tools/explorer/)

---

## Command Reference

Every command supports `--help` for full option details. Most list/get commands support `--json`, `--fields`, and `--account-id` flags.

### Core

#### `auth` -- Authentication & profiles

| Subcommand | Description |
|---|---|
| `auth login` | Set access token (interactive or `--token`) |
| `auth logout` | Clear stored token |
| `auth status` | Check authentication status |
| `auth token` | Display current token |
| `auth oauth` | OAuth 2.0 flow for long-lived tokens |
| `auth refresh` | Refresh current token |
| `auth inspect` | Inspect token metadata (scopes, expiry) |
| `auth profiles list` | List all saved profiles |
| `auth profiles add` | Add a named profile (`--name`, `--token`, `--account-id`) |
| `auth profiles switch <name>` | Switch active profile |
| `auth profiles remove <name>` | Delete a profile |
| `auth profiles current` | Show active profile |

```bash
# OAuth flow with automatic long-lived token
adpilot auth oauth --app-id 123 --app-secret abc

# Multi-account setup
adpilot auth profiles add --name client-a --token EAA... --account-id act_111
adpilot auth profiles add --name client-b --token EAA... --account-id act_222
adpilot auth profiles switch client-a
```

#### `config` -- Configuration

| Subcommand | Description |
|---|---|
| `config show` | Display current configuration |
| `config set <key> <value>` | Set a config value |
| `config reset` | Reset all to defaults |
| `config path` | Show config file location |

**Keys:** `adAccountId`, `apiVersion`, `defaultOutputFormat` (table/json), `pageSize`

#### `account` -- Account info

| Subcommand | Description |
|---|---|
| `account info` | View ad account details (status, currency, spend) |
| `account list` | List all ad accounts for the current user |

---

### Campaign Management

#### `campaigns` -- Campaign CRUD (aliases: `campaign`, `camp`)

| Subcommand | Description |
|---|---|
| `campaigns list` | List campaigns (filter by `--status`) |
| `campaigns get <id>` | Get campaign details |
| `campaigns create` | Create campaign (`-n`, `-o`, `--daily-budget`) |
| `campaigns update <id>` | Update name, status, budget, bid strategy |
| `campaigns pause <id>` | Pause a campaign |
| `campaigns resume <id>` | Activate a campaign |
| `campaigns archive <id>` | Archive a campaign |
| `campaigns delete <id>` | Delete a campaign |
| `campaigns copy <id>` | Duplicate a campaign (`--deep` for full copy) |

```bash
adpilot campaigns create -n "Summer Sale" -o OUTCOME_SALES --daily-budget 5000
adpilot campaigns copy 123456 --deep --rename-prefix "Copy -"
```

**Objectives:** `OUTCOME_AWARENESS`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`, `OUTCOME_APP_PROMOTION`

#### `adsets` -- Ad set CRUD (aliases: `adset`)

| Subcommand | Description |
|---|---|
| `adsets list` | List ad sets (`--campaign-id` to filter) |
| `adsets get <id>` | Get ad set details |
| `adsets create` | Create ad set (targeting, billing, optimization) |
| `adsets update <id>` | Update fields |
| `adsets pause <id>` | Pause |
| `adsets resume <id>` | Activate |
| `adsets delete <id>` | Delete |
| `adsets set-schedule <id>` | Set dayparting schedule (`--days`, `--start-minute`, `--end-minute`) |
| `adsets get-schedule <id>` | View current schedule |

```bash
adpilot adsets create -n "US 18-35" \
  --campaign-id 123 \
  --billing-event IMPRESSIONS \
  --optimization-goal LINK_CLICKS \
  --daily-budget 2000 \
  --targeting '{"geo_locations":{"countries":["US"]},"age_min":18,"age_max":35}'

# Weekday-only delivery (dayparting)
adpilot adsets set-schedule 456 --days 1,2,3,4,5 --start-minute 540 --end-minute 1200
```

#### `ads` -- Ad CRUD (aliases: `ad`)

| Subcommand | Description |
|---|---|
| `ads list` | List ads (`--campaign-id`, `--adset-id` filters) |
| `ads get <id>` | Get ad details |
| `ads create` | Create ad with creative spec |
| `ads update <id>` | Update name, status, creative |
| `ads pause <id>` | Pause |
| `ads resume <id>` | Activate |
| `ads delete <id>` | Delete |
| `ads preview <id>` | Generate ad preview HTML |

#### `creatives` -- Creative management (aliases: `creative`)

| Subcommand | Description |
|---|---|
| `creatives list` | List ad creatives |
| `creatives get <id>` | Get creative details |
| `creatives create` | Create from object story spec, image hash, etc. |
| `creatives create-dynamic` | Create dynamic creative with asset feed spec |
| `creatives create-carousel` | Create carousel creative with multiple cards |
| `creatives update <id>` | Update name/status |
| `creatives delete <id>` | Delete |
| `creatives preview <id>` | Preview a creative |

```bash
# Dynamic creative with multiple variants
adpilot creatives create-dynamic -n "Test Creative" \
  --page-id 123 \
  --images hash1,hash2 \
  --titles "Buy Now|Shop Today" \
  --bodies "Great deals|Limited time" \
  --link-url https://example.com

# Carousel creative
adpilot creatives create-carousel -n "Products" \
  --page-id 123 \
  --cards-file cards.json \
  --message "Check out our lineup"
```

#### `images` -- Image management (aliases: `image`, `img`)

| Subcommand | Description |
|---|---|
| `images upload <file>` | Upload image, returns hash |
| `images list` | List images in account |

#### `videos` -- Video management (aliases: `video`, `vid`)

| Subcommand | Description |
|---|---|
| `videos upload <file>` | Upload video file |
| `videos list` | List videos in account |
| `videos get <id>` | Get video details |
| `videos delete <id>` | Delete a video |

---

### Insights & Reporting

#### `insights` -- Performance insights (alias: `report`)

| Subcommand | Description |
|---|---|
| `insights account` | Account-level insights |
| `insights campaign <id>` | Campaign-level insights |
| `insights adset <id>` | Ad set-level insights |
| `insights ad <id>` | Ad-level insights |

All subcommands support `--date-preset`, `--since`/`--until`, `--breakdowns`, `--csv <file>`, and `--json`.

```bash
# Date range with breakdowns
adpilot insights account --since 2025-01-01 --until 2025-01-31 --breakdowns age,gender

# Export to CSV
adpilot insights campaign 123 --date-preset last_30d --csv campaign-report.csv
```

**Date presets:** `today`, `yesterday`, `this_month`, `last_month`, `last_7d`, `last_14d`, `last_30d`, `last_90d`, `maximum`

**Breakdowns:** `age`, `gender`, `country`, `region`, `dma`, `impression_device`, `platform_position`, `publisher_platform`, `device_platform`

#### `reports` -- Saved reports & comparison

| Subcommand | Description |
|---|---|
| `reports save` | Save an insight query as a named template |
| `reports list` | List saved report templates |
| `reports run <name>` | Execute a saved report |
| `reports delete <name>` | Delete a saved report |
| `reports compare` | Compare metrics across two time periods |
| `reports async` | Request a large async insights report |
| `reports async-status <id>` | Check async report status |
| `reports async-download <id>` | Download completed async report |
| `reports async-wait <id>` | Poll and auto-download when complete |

```bash
# Save a report template
adpilot reports save --name weekly-perf --level campaign \
  --fields impressions,clicks,spend,ctr,cpc --date-preset last_7d

# Run it anytime
adpilot reports run weekly-perf --csv weekly.csv

# Compare two time periods
adpilot reports compare --level account \
  --period1 2025-01-01,2025-01-31 \
  --period2 2025-02-01,2025-02-28

# Large async report
adpilot reports async --level ad --fields impressions,clicks,spend --date-preset last_90d
adpilot reports async-wait <report_run_id> --csv large-report.csv
```

---

### AI Pipeline

#### `ai` -- AI-assisted ad copy

| Subcommand | Description |
|---|---|
| `ai generate-copy` | Generate an LLM prompt for ad copy variants |
| `ai parse-copy` | Parse LLM-generated JSON into a deployable template |
| `ai feedback` | Generate performance feedback for LLM iteration |

```bash
# Step 1: Generate prompt for your LLM
adpilot ai generate-copy --product "Widget Pro" \
  --description "A better widget" --tone casual --variants 5

# Step 2: Paste LLM response into a file, then parse it
adpilot ai parse-copy --input llm-response.json \
  --product "Widget Pro" --url https://example.com --output template.json

# Step 3: Deploy the template
adpilot deploy run -t template.json

# Step 4: After data collects, generate feedback for next iteration
adpilot ai feedback --campaign 123456 --date-preset last_7d --output feedback.md
```

#### `generate` -- Variant generation

| Subcommand | Description |
|---|---|
| `generate variants` | Generate combinatorial ad variants from headlines, bodies, CTAs |
| `generate from-template` | Multiply a base template across a variable matrix |

```bash
# Auto-generate variants
adpilot generate variants \
  --name "Widget Pro" --url https://example.com \
  --headlines "Buy Now,Shop Today,Get Yours" \
  --bodies "Great deals await|Limited time offer" \
  --ctas SHOP_NOW,LEARN_MORE \
  --countries US,GB --age-groups 18-30,31-45 \
  --deploy

# Template matrix expansion
adpilot generate from-template \
  --template base.json \
  --matrix '{"country":["US","UK","CA"],"cta":["SHOP_NOW","LEARN_MORE"]}' \
  --output ./variants/ --deploy-all
```

#### `deploy` -- Template deployment

| Subcommand | Description |
|---|---|
| `deploy run` | Deploy a template JSON to Meta Ads |
| `deploy validate` | Validate a template without deploying |

```bash
adpilot deploy run -t campaign.json --dry-run       # Preview what would be created
adpilot deploy run -t campaign.json                   # Deploy for real
adpilot deploy run -t campaign.json --var headline="New Text" --var budget=5000
adpilot deploy validate -t campaign.json              # Validate only
```

#### `cycle` -- Test cycle orchestrator

| Subcommand | Description |
|---|---|
| `cycle run` | Full test cycle: deploy template, link to project, evaluate, act |
| `cycle status <campaignId>` | Quick health check of a running campaign |
| `cycle report <campaignId>` | Detailed report with winners, losers, and recommendations |

```bash
# Full pipeline: deploy + link + monitor
adpilot cycle run -t campaign.json --project my-product \
  --min-ctr 0.5 --max-cpa 50 --evaluate

# Post-run analysis
adpilot cycle report 123456 --date-preset last_7d
```

#### `validate` -- Market validation

| Subcommand | Description |
|---|---|
| `validate market <projectId>` | Generate a market validation report with verdict |

Produces a structured report with STRONG/MODERATE/WEAK/INSUFFICIENT DATA verdict and actionable next steps.

```bash
adpilot validate market my-product --date-preset maximum --output report.md
```

---

### Project Management

#### `projects` -- IP/product registry (aliases: `project`, `ip`)

| Subcommand | Description |
|---|---|
| `projects list` | List all registered projects |
| `projects create` | Register a new product/IP for testing |
| `projects get <id>` | Show project details and linked campaigns |
| `projects update <id>` | Update project fields |
| `projects delete <id>` | Remove from registry |
| `projects link <projectId> <campaignId>` | Associate a campaign with a project |
| `projects unlink <projectId> <campaignId>` | Remove association |
| `projects report <projectId>` | Aggregated insights across all linked campaigns |
| `projects dashboard` | Cross-project performance dashboard with demand scoring |

```bash
adpilot projects create -n "Widget Pro" -u https://example.com -b 100000
adpilot projects link widget-pro 123456789
adpilot projects dashboard --sort demand_score
```

#### `monitor` -- Performance monitoring (alias: `mon`)

| Subcommand | Description |
|---|---|
| `monitor run` | Evaluate campaigns against thresholds, auto-pause underperformers |
| `monitor winners` | Detect top-performing ads, optionally scale budgets |
| `monitor losers` | Detect worst-performing ads, optionally pause |
| `monitor status` | Quick health overview of active campaigns |

```bash
# Auto-kill underperformers
adpilot monitor run --min-ctr 0.5 --max-cpa 50 --max-cpc 5 --dry-run
adpilot monitor run --project my-product   # Scope to a project

# Scale winners by 1.5x
adpilot monitor winners --top 5 --scale-budget 1.5

# Pause bottom performers
adpilot monitor losers --bottom 5 --pause
```

#### `budget` -- Budget allocation & scheduling

| Subcommand | Description |
|---|---|
| `budget allocate` | Dynamically allocate budget across projects by strategy |
| `budget status` | Show budget utilization and pacing across projects |
| `budget schedule` | Set a scheduled budget change for a campaign |
| `budget schedule-list` | List all budget schedules |
| `budget schedule-apply` | Apply/revert pending budget schedules |
| `budget schedule-delete <id>` | Delete a schedule |

```bash
# Allocate $500/day across all projects by demand score
adpilot budget allocate --total-budget 50000 --strategy demand_score --dry-run

# Schedule a budget increase for a sale
adpilot budget schedule --campaign-id 123 --budget 10000 \
  --start-date 2025-03-01 --end-date 2025-03-07 --original-budget 5000
```

**Strategies:** `equal`, `performance` (by CTR), `demand_score` (clicks/spend ratio)

---

### Targeting & Audiences

#### `targeting` -- Targeting builder & search

| Subcommand | Description |
|---|---|
| `targeting build` | Interactive wizard to build targeting JSON |
| `targeting search <query>` | Search interests, locations, demographics |
| `targeting estimate <json>` | Get audience size estimate for a targeting spec |

```bash
adpilot targeting build                                    # Interactive wizard
adpilot targeting search "fitness" --type adinterest       # Search interests
adpilot targeting estimate '{"geo_locations":{"countries":["US"]},"age_min":25}'
```

**Search types:** `adinterest`, `adinterestsuggestion`, `adTargetingCategory`, `adgeolocation`, `adeducationschool`, `adworkemployer`, `adworkposition`, `adlocale`

#### `audiences` -- Custom audiences (alias: `audience`)

| Subcommand | Description |
|---|---|
| `audiences list` | List custom audiences |
| `audiences get <id>` | Get audience details |
| `audiences create` | Create a custom audience |
| `audiences create-lookalike` | Create a lookalike audience from a source |
| `audiences delete <id>` | Delete an audience |

```bash
adpilot audiences create -n "Website Visitors" --subtype WEBSITE
adpilot audiences create-lookalike --source-audience 123 --countries US,GB --ratio 0.02
```

#### `discover` -- Audience discovery engine

| Subcommand | Description |
|---|---|
| `discover audiences <campaignId>` | Analyze breakdowns to find best segments, optionally auto-create ad sets |
| `discover interests <campaignId>` | Suggest interest targeting based on performance |

```bash
# Find top-performing audience segments
adpilot discover audiences 123456 --breakdowns age,gender,country --top 10

# Auto-create ad sets for top segments
adpilot discover audiences 123456 --create-adsets --daily-budget 1500

# Discover related interests
adpilot discover interests 123456
```

---

### Automation

#### `rules` -- Automated ad rules (alias: `rule`)

| Subcommand | Description |
|---|---|
| `rules list` | List ad rules |
| `rules get <id>` | Get rule details |
| `rules create` | Create a rule (metric, operator, threshold, action) |
| `rules quick-create` | Create from presets: `pause-high-cpa`, `pause-low-ctr`, `scale-winners`, `notify-spend` |
| `rules pause <id>` | Disable a rule |
| `rules resume <id>` | Enable a rule |
| `rules delete <id>` | Delete a rule |

```bash
# Quick preset rules
adpilot rules quick-create --type pause-high-cpa --apply-to 123,456 --apply-to-type CAMPAIGN
adpilot rules quick-create --type scale-winners --apply-to 789 --apply-to-type ADSET --threshold 2.0

# Custom rule
adpilot rules create --name "Pause low CTR" \
  --apply-to 123 --apply-to-type AD \
  --metric ctr --operator LESS_THAN --value 0.3 \
  --action PAUSE --schedule DAILY
```

#### `bulk` -- Bulk operations

| Subcommand | Description |
|---|---|
| `bulk pause` | Pause multiple objects by ID |
| `bulk resume` | Resume multiple objects |
| `bulk delete` | Delete multiple objects |
| `bulk update` | Update fields on multiple objects |

```bash
adpilot bulk pause --type campaign --ids 111,222,333
adpilot bulk update --type adset --ids 111,222 --set daily_budget=5000
echo -e "111\n222\n333" | adpilot bulk pause --type ad --stdin
```

#### `batch` -- Batch API requests

| Subcommand | Description |
|---|---|
| `batch run` | Execute batch requests from a JSON file |
| `batch from-ids` | Build and execute batch from object IDs |

Sends up to 50 API calls in a single HTTP request (auto-chunks larger sets).

```bash
# From a file
adpilot batch run --requests batch.json

# Quick batch from IDs
adpilot batch from-ids --type campaign --ids 111,222,333 --action get --fields id,name,status
adpilot batch from-ids --type ad --ids 111,222 --action pause
```

---

### Advanced

#### `labels` -- Ad labels (alias: `label`)

| Subcommand | Description |
|---|---|
| `labels list` | List labels |
| `labels create` | Create a label |
| `labels delete <id>` | Delete a label |
| `labels assign <labelId>` | Assign label to an object (`--to`, `--type`) |
| `labels remove <labelId>` | Remove label from an object (`--from`) |

#### `leads` -- Lead gen forms & downloads

| Subcommand | Description |
|---|---|
| `leads forms` | List lead forms for a page (`--page-id`) |
| `leads form-get <formId>` | Get form details |
| `leads download <formId>` | Download leads (supports `--csv`) |
| `leads create-form` | Create a new lead form |
| `leads delete <formId>` | Delete a form |

```bash
adpilot leads forms --page-id 123456
adpilot leads download 789 --csv leads.csv
```

#### `splits` -- A/B split testing (alias: `split`)

| Subcommand | Description |
|---|---|
| `splits create` | Create an ad study |
| `splits list` | List ad studies |
| `splits get <id>` | Get study details |
| `splits results <id>` | Get results and winner |
| `splits delete <id>` | Delete a study |
| `splits quick-ab` | Quick A/B setup from two ad sets |

```bash
# Quick A/B test
adpilot splits quick-ab --name "Landing Page Test" \
  --adset-a 111 --adset-b 222 --split 50,50 --duration 7

# Check results
adpilot splits results 123456
```

#### `webhooks` -- Webhook subscriptions (alias: `webhook`)

| Subcommand | Description |
|---|---|
| `webhooks subscribe` | Subscribe to change notifications |
| `webhooks list` | List subscriptions |
| `webhooks delete` | Delete a subscription |
| `webhooks test` | Send a test verification to your callback URL |

```bash
adpilot webhooks subscribe --callback-url https://example.com/webhook \
  --verify-token my-secret --fields spend,status

adpilot webhooks test --callback-url https://example.com/webhook \
  --verify-token my-secret
```

#### `logs` -- API call logs

| Subcommand | Description |
|---|---|
| `logs show` | Display API call logs (`--date`, `--status`, `--limit`) |
| `logs clear` | Delete log files (`--before <date>` or `--all`) |

#### `completions` -- Shell completions

| Subcommand | Description |
|---|---|
| `completions bash` | Output Bash completion script |
| `completions zsh` | Output Zsh completion script |
| `completions fish` | Output Fish completion script |
| `completions install` | Auto-detect shell and install |

---

## Template System

adpilot uses JSON template files to define complete campaign stacks (campaign + ad sets + ads + creatives) that can be deployed in a single command.

### Template structure

```json
{
  "name": "My Test Campaign",
  "description": "Optional description",
  "variables": {
    "headline": { "description": "Ad headline", "default": "Buy Now" },
    "budget": { "description": "Daily budget in cents", "default": "1500" }
  },
  "campaign": {
    "name": "{{headline}} Campaign",
    "objective": "OUTCOME_TRAFFIC",
    "status": "PAUSED",
    "special_ad_categories": []
  },
  "adsets": [
    {
      "name": "US Broad",
      "billing_event": "IMPRESSIONS",
      "optimization_goal": "LINK_CLICKS",
      "daily_budget": "{{budget}}",
      "targeting": {
        "geo_locations": { "countries": ["US"] }
      },
      "status": "PAUSED"
    }
  ],
  "ads": [
    {
      "name": "Ad Variant 1",
      "adset_index": 0,
      "creative": {
        "name": "Creative V1",
        "title": "{{headline}}",
        "body": "Check out our product!",
        "link_url": "https://example.com",
        "call_to_action_type": "LEARN_MORE"
      },
      "status": "PAUSED"
    }
  ]
}
```

### Template variables

Templates support `{{variable}}` placeholders that are resolved at deploy time:

```bash
adpilot deploy run -t template.json --var headline="Shop Now" --var budget=3000
```

### Workflow

```bash
# Validate first
adpilot deploy validate -t template.json

# Preview the deploy plan
adpilot deploy run -t template.json --dry-run

# Deploy for real
adpilot deploy run -t template.json
```

---

## AI Ad Testing Pipeline

adpilot supports a full end-to-end AI-driven ad testing pipeline:

```
1. REGISTER       adpilot projects create -n "Widget Pro" -u https://example.com
       |
2. GENERATE        adpilot ai generate-copy --product "Widget Pro" --description "..." --variants 5
       |            (copy prompt to LLM, save response as variants.json)
       |
3. PARSE           adpilot ai parse-copy --input variants.json --product "Widget Pro" --url https://...
       |            (outputs a deployable template)
       |
4. DEPLOY          adpilot deploy run -t template.json
       |            (creates campaign, ad sets, creatives, and ads)
       |
5. LINK            adpilot projects link widget-pro <campaign_id>
       |
6. MONITOR         adpilot monitor status --project widget-pro
       |            adpilot monitor run --project widget-pro --dry-run
       |
7. EVALUATE        adpilot monitor winners --top 5 --scale-budget 1.5
       |            adpilot monitor losers --bottom 5 --pause
       |
8. FEEDBACK        adpilot ai feedback --campaign <id> --output feedback.md
       |            (feed report back into LLM for next iteration)
       |
9. VALIDATE        adpilot validate market widget-pro
                   (go/no-go verdict: STRONG, MODERATE, WEAK, INSUFFICIENT DATA)
```

Or use `cycle run` to orchestrate steps 4-7 in a single command:

```bash
adpilot cycle run -t template.json --project widget-pro --evaluate --min-ctr 0.5 --max-cpa 50
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `ADPILOT_TOKEN` | Access token (overrides config) |
| `FACEBOOK_ACCESS_TOKEN` | Access token (fallback) |

Tokens are resolved in this order: active profile > config file > `ADPILOT_TOKEN` > `FACEBOOK_ACCESS_TOKEN`.

## Configuration

Configuration is stored in `~/.config/adpilot/` (or `~/.adpilot/`) via the [conf](https://github.com/sindresorhus/conf) library.

| Key | Default | Description |
|---|---|---|
| `adAccountId` | (none) | Your ad account ID (`act_XXXXX`) |
| `apiVersion` | `v25.0` | Meta Graph API version |
| `defaultOutputFormat` | `table` | Default output: `table` or `json` |
| `pageSize` | `25` | Default results per page |
| `accessToken` | (none) | Stored access token |
| `appId` | (none) | Facebook App ID (for OAuth) |
| `appSecret` | (none) | Facebook App Secret (for OAuth) |
| `tokenExpiresAt` | (none) | Token expiry timestamp |

```bash
adpilot config show                          # View current config
adpilot config set adAccountId act_123456    # Set account
adpilot config set apiVersion v24.0          # Change API version
adpilot config path                          # Show config file path
```

## Shell Completions

```bash
# Auto-detect and install
adpilot completions install

# Or manually:
# Bash
adpilot completions bash >> ~/.bashrc && source ~/.bashrc

# Zsh
adpilot completions zsh > ~/.zsh/completions/_adpilot
# Add to .zshrc: fpath=(~/.zsh/completions $fpath) && autoload -Uz compinit && compinit

# Fish
adpilot completions fish > ~/.config/fish/completions/adpilot.fish
```

## API Version

Defaults to `v25.0`. Change with:

```bash
adpilot config set apiVersion v24.0
```

## Global Options

Available on most commands:

| Flag | Description |
|---|---|
| `--json` | Output as JSON instead of table |
| `--fields <fields>` | Comma-separated fields to return |
| `--account-id <id>` | Override the configured ad account |
| `--limit <n>` | Max results per page |
| `-v, --version` | Show version |
| `--help` | Show help for any command |

## Contributing

```bash
git clone https://github.com/connorodea/adpilot.git
cd adpilot
npm install
npm run build
npm test           # Run 93+ tests
npm run lint       # Type-check
```

- **Module system:** CommonJS (not ESM). Chalk v4, ora v5, inquirer v8, node-fetch v2 are pinned for CJS compatibility.
- **Commands:** Add new command files in `src/commands/`, register in `src/index.ts`.
- **Tests:** Jest with ts-jest, located in `tests/`.

## License

MIT
