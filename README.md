# adpilot

A powerful CLI for the Meta/Facebook Marketing API. Manage campaigns, ad sets, ads, creatives, and performance insights — all from your terminal.

## Features

- **Campaigns** — Create, list, get, update, pause, resume, archive, delete
- **Ad Sets** — Full CRUD with targeting, budgets, billing events, optimization goals
- **Ads** — Create, manage, preview ads with creative linking
- **Creatives** — Build and manage ad creatives with image/video support
- **Insights** — Pull performance reports at account, campaign, ad set, and ad levels
- **Auth** — Secure token management with validation
- **Config** — Persistent configuration for account ID, API version, output format
- **Output** — Beautiful table output or JSON for scripting

## Installation

```bash
npm install -g adpilot
```

Or clone and link locally:

```bash
git clone https://github.com/connorodea/adpilot.git
cd adpilot
npm install
npm run build
npm link
```

## Quick Start

```bash
# 1. Set your Facebook access token
adpilot auth login

# 2. Configure your ad account
adpilot config set adAccountId act_123456789

# 3. List campaigns
adpilot campaigns list

# 4. View account insights
adpilot insights account --date-preset last_7d
```

## Getting a Facebook Access Token

1. Go to [Meta Business Suite](https://business.facebook.com/settings)
2. Navigate to **Settings > Users > System Users**
3. Create a system user and generate a token with `ads_management` and `ads_read` permissions
4. Or use the [Graph API Explorer](https://developers.facebook.com/tools/explorer/) for testing

## Commands

### Auth

```bash
adpilot auth login              # Set access token (interactive or --token)
adpilot auth logout             # Clear stored token
adpilot auth status             # Check authentication status
adpilot auth token              # Display current token
```

### Config

```bash
adpilot config show             # Display current configuration
adpilot config set <key> <val>  # Set a config value
adpilot config reset            # Reset to defaults
adpilot config path             # Show config file location
```

**Config keys:** `adAccountId`, `apiVersion`, `defaultOutputFormat` (table|json), `pageSize`

### Account

```bash
adpilot account info            # View ad account details
adpilot account list            # List all ad accounts
```

### Campaigns

```bash
adpilot campaigns list                    # List all campaigns
adpilot campaigns get <id>                # Get campaign details
adpilot campaigns create -n "My Campaign" -o OUTCOME_SALES --daily-budget 5000
adpilot campaigns update <id> --name "New Name" --daily-budget 10000
adpilot campaigns pause <id>              # Pause a campaign
adpilot campaigns resume <id>             # Resume a campaign
adpilot campaigns archive <id>            # Archive a campaign
adpilot campaigns delete <id>             # Delete a campaign
```

**Objectives:** `OUTCOME_AWARENESS`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`, `OUTCOME_APP_PROMOTION`

### Ad Sets

```bash
adpilot adsets list                       # List all ad sets
adpilot adsets list --campaign-id <id>    # Filter by campaign
adpilot adsets get <id>                   # Get ad set details
adpilot adsets create -n "My Ad Set" \
  --campaign-id <id> \
  --billing-event IMPRESSIONS \
  --optimization-goal LINK_CLICKS \
  --daily-budget 2000 \
  --targeting '{"geo_locations":{"countries":["US"]}}'
adpilot adsets update <id> --daily-budget 3000
adpilot adsets pause <id>
adpilot adsets resume <id>
adpilot adsets delete <id>
```

### Ads

```bash
adpilot ads list                          # List all ads
adpilot ads list --adset-id <id>          # Filter by ad set
adpilot ads get <id>                      # Get ad details
adpilot ads create -n "My Ad" \
  --adset-id <id> \
  --creative '{"creative_id":"<creative_id>"}'
adpilot ads update <id> --name "Updated Ad"
adpilot ads pause <id>
adpilot ads resume <id>
adpilot ads delete <id>
adpilot ads preview <id>                  # Preview an ad
```

### Creatives

```bash
adpilot creatives list                    # List all creatives
adpilot creatives get <id>                # Get creative details
adpilot creatives create -n "My Creative" \
  --object-story-spec '{"page_id":"<page_id>","link_data":{"image_hash":"<hash>","link":"https://example.com","message":"Check this out!"}}'
adpilot creatives update <id> --name "New Name"
adpilot creatives delete <id>
adpilot creatives preview <id>            # Preview a creative
```

### Insights

```bash
# Account-level insights
adpilot insights account --date-preset last_30d
adpilot insights account --since 2025-01-01 --until 2025-01-31

# Campaign insights
adpilot insights campaign <id> --date-preset last_7d

# Ad set insights
adpilot insights adset <id> --breakdowns age,gender

# Ad insights
adpilot insights ad <id> --fields impressions,clicks,spend,ctr,actions
```

**Date presets:** `today`, `yesterday`, `this_month`, `last_month`, `last_7d`, `last_14d`, `last_30d`, `last_90d`, `maximum`, and more.

**Breakdowns:** `age`, `gender`, `country`, `region`, `impression_device`, `platform_position`, `publisher_platform`, `device_platform`

## Global Options

Every list/get command supports:
- `--json` — Output as JSON instead of table
- `--fields <fields>` — Custom comma-separated fields
- `--account-id <id>` — Override the configured ad account

## API Version

Defaults to `v25.0`. Change with:

```bash
adpilot config set apiVersion v24.0
```

## License

MIT
