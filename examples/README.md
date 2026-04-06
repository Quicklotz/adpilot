# AdPilot Template Cookbook

Practical guide to using AdPilot templates for ad testing, IP validation, and campaign scaling.

## Available Templates

| Template | Objective | Ad Sets | Ads | Use Case |
|----------|-----------|---------|-----|----------|
| `basic-traffic-campaign.json` | OUTCOME_TRAFFIC | 1 (broad) | 1 | Quick smoke test for a landing page |
| `multi-variant-test.json` | OUTCOME_TRAFFIC | 3 (age splits) | 6 (2 per set) | A/B test two headlines across demographics |
| `lead-gen-campaign.json` | OUTCOME_LEADS | 2 (broad + lookalike) | 4 (2 per set) | Collect leads via form-based ads |
| `ecommerce-sales.json` | OUTCOME_SALES | 3 (retarget + broad + interest) | 3 (1 per set) | Drive purchases for an e-commerce product |
| `app-install.json` | OUTCOME_APP_PROMOTION | 2 (iOS + Android) | 4 (2 per platform) | Drive mobile app installs |
| `brand-awareness.json` | OUTCOME_AWARENESS | 3 (age splits) | 3 (1 per set) | Low-budget brand awareness ($10/day) |
| `rapid-ip-test.json` | OUTCOME_TRAFFIC | 4 (broad + 3 age splits) | 12 (3 hooks per set) | AI pipeline IP validation with message testing |
| `scaling-winner.json` | OUTCOME_TRAFFIC | 5 (US, UK, CA, AU, DE) | 5 (1 per market) | Scale a winning ad into new markets |

## How Templates Work

Templates are JSON files that define a complete campaign structure: campaign settings, ad sets (audiences), and ads (creatives). They use `{{variable}}` placeholders that get replaced at deploy time.

### Template Structure

```json
{
  "name": "Template Name",
  "description": "What this template does",
  "variables": {
    "product_name": { "type": "string", "description": "..." },
    "daily_budget": { "type": "number", "default": 2000, "description": "Budget in cents" }
  },
  "campaign": { ... },
  "adsets": [ ... ],
  "ads": [ ... ]
}
```

Each ad references an ad set by `adset_index` (0-based), linking it to the correct audience.

### Variable Types

- **`string`** — Text values like product names, URLs, headlines
- **`number`** — Numeric values like budgets (always in cents)

Variables with a `default` value are optional at deploy time. Variables without defaults are required.

## Deploying Templates

### Basic Usage

```bash
# Deploy with required variables
adpilot deploy --template examples/basic-traffic-campaign.json \
  --var product_name="My Widget" \
  --var landing_url="https://example.com/widget"

# Variables with defaults can be overridden
adpilot deploy --template examples/basic-traffic-campaign.json \
  --var product_name="My Widget" \
  --var landing_url="https://example.com/widget" \
  --var daily_budget=5000 \
  --var country=CA
```

### Preview Before Deploying

```bash
# Dry run to see what would be created
adpilot deploy --template examples/rapid-ip-test.json \
  --var ip_name="SmartGarden" \
  --var ip_description="AI-powered indoor garden that grows herbs automatically" \
  --var landing_url="https://smartgarden.test" \
  --dry-run
```

### JSON Output for Pipelines

```bash
# Machine-readable output for AI pipeline consumption
adpilot deploy --template examples/rapid-ip-test.json \
  --var ip_name="SmartGarden" \
  --var ip_description="AI-powered indoor garden" \
  --var landing_url="https://smartgarden.test" \
  --json
```

## AI Pipeline Workflow

The primary use case for AdPilot is automated IP validation. Here is the typical workflow:

### Step 1: Generate an IP Idea

Your AI system generates a product concept with a name, description, and landing page.

### Step 2: Deploy the Rapid IP Test

```bash
adpilot deploy --template examples/rapid-ip-test.json \
  --var ip_name="SmartGarden" \
  --var ip_description="AI-powered indoor garden that grows herbs automatically" \
  --var landing_url="https://smartgarden.test/lp" \
  --var daily_budget=1500 \
  --json
```

This creates 4 ad sets (broad + 3 age segments) with 3 messaging hooks each (problem-aware, solution-aware, curiosity), totaling 12 ads. All start PAUSED.

### Step 3: Activate and Monitor

```bash
# Activate the campaign
adpilot campaigns update <campaign_id> --status ACTIVE

# Check performance after 24-48 hours
adpilot insights campaign <campaign_id> --json
```

### Step 4: Analyze Results

```bash
# Get ad-level metrics
adpilot insights ads --campaign <campaign_id> --json

# Identify the winning ad set and creative
adpilot insights adsets --campaign <campaign_id> --json
```

### Step 5: Scale the Winner

Once you have identified the best-performing headline, body, and audience:

```bash
adpilot deploy --template examples/scaling-winner.json \
  --var product_name="SmartGarden" \
  --var winning_headline="What If There Was a Better Way?" \
  --var winning_body="AI-powered indoor garden that grows herbs automatically. People are calling SmartGarden a game-changer. Find out why." \
  --var landing_url="https://smartgarden.test/lp" \
  --var image_hash="abc123def456" \
  --var daily_budget=2500 \
  --json
```

This deploys the proven creative across 5 markets (US, UK, CA, AU, DE) at $25/day each.

## Template Selection Guide

**"I want to quickly test if people care about my idea."**
Use `rapid-ip-test.json` — it tests 3 messaging angles across 4 age groups.

**"I have a product page and want to drive traffic to it."**
Use `basic-traffic-campaign.json` for a simple test, or `multi-variant-test.json` to A/B test two headlines.

**"I want to collect email signups or leads."**
Use `lead-gen-campaign.json` — optimized for lead forms with SIGN_UP CTAs.

**"I'm selling a product online."**
Use `ecommerce-sales.json` — includes retargeting, broad, and interest audiences with SHOP_NOW CTAs.

**"I'm promoting a mobile app."**
Use `app-install.json` — separate iOS and Android targeting with platform-specific store URLs.

**"I just want people to know my brand exists."**
Use `brand-awareness.json` — low budget ($10/day), reach-optimized across age groups.

**"I found a winning ad and want to go international."**
Use `scaling-winner.json` — deploys one proven creative across 5 English-speaking + German markets.

## Creating Custom Templates

### Start from an Existing Template

The easiest approach is to copy and modify an existing template:

```bash
cp examples/basic-traffic-campaign.json examples/my-custom-template.json
```

### Template Rules

1. **`name`** (required) — Unique template name
2. **`campaign.name`** (required) — Campaign name, usually includes `{{product_name}}`
3. **`campaign.objective`** (required) — Meta campaign objective
4. **Ad sets** need: `name`, `billing_event`, `optimization_goal`, `targeting`
5. **Ads** need: `name`, `adset_index` (0-based reference to ad sets array), `creative` with at least a `name`
6. **Budgets** are always in **cents** (2000 = $20.00)
7. All templates should start with `"status": "PAUSED"` for safety

### Variable Best Practices

- Define every dynamic value as a variable
- Always provide defaults for budgets and country codes
- Use descriptive names: `product_name` not `pn`
- Document each variable with a `description`

### Validation

Templates are validated at deploy time. To check a template manually:

```bash
python3 -c "import json; json.load(open('examples/my-template.json'))" && echo "Valid JSON"
```

The validator checks:
- Required fields are present
- `adset_index` values are within range
- All `{{variables}}` are resolved (no unresolved placeholders)

## Tips for Effective Ad Testing

### Budget

- Start with $10-15/day per ad set for validation
- You need ~1,000 impressions per ad for statistically meaningful data
- Run tests for at least 48-72 hours before making decisions
- Scale winners to $25-50/day per market

### Audiences

- Keep ad sets focused on one variable (age OR location, not both changing)
- Broad audiences (18-65) work well as a control group
- Test at least 3 age segments to find your sweet spot

### Creative

- Test one variable at a time: headline OR body OR image, not all three
- The `rapid-ip-test.json` template tests 3 messaging angles:
  - **Problem-aware**: Calls out the pain point directly
  - **Solution-aware**: Leads with the product as the answer
  - **Curiosity**: Creates intrigue without revealing too much
- Keep headlines under 40 characters for mobile
- Body text sweet spot is 90-125 characters

### Metrics to Watch

- **CTR (Click-Through Rate)**: Above 1% is good for cold traffic
- **CPC (Cost Per Click)**: Varies by industry, lower is better
- **CPM (Cost Per 1,000 Impressions)**: Indicates audience competition
- **Link Clicks**: Raw volume matters for statistical significance

### Common Mistakes

- Running too many variants with too little budget (spread too thin)
- Changing ads before they have enough data (be patient)
- Not using PAUSED status on deploy (always review before activating)
- Forgetting budgets are in cents (2000 = $20, not $2,000)
