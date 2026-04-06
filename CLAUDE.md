# adpilot

CLI for the Meta/Facebook Marketing API. Part of an AI ad testing pipeline — designed for both human terminal use and machine (LLM pipeline) consumption. JSON output (`--json` flag) and stdin piping are first-class features.

## Commands

```bash
npm run build        # TypeScript -> dist/ (tsc)
npm test             # 93 tests via Jest (tests/ directory)
npm run lint         # Type-check only (tsc --noEmit)
npm run dev          # Run locally via ts-node
node dist/index.js   # Run built output
```

## Architecture

- **Entry point**: `src/index.ts` — Commander.js program, registers all command groups
- **Commands**: `src/commands/` — one file per domain (campaigns, adsets, ads, creatives, insights, audiences, budget, targeting, etc.)
- **API client**: `src/lib/api.ts` — Meta Graph API wrapper
- **Config**: `src/lib/config.ts` — stored in `~/.adpilot/` via Conf library
- **Utilities**: `src/utils/` — errors, helpers, output formatting, validators
- **Lib helpers**: `src/lib/` — logger, templates, registry, reports, budget-schedules
- **Tests**: `tests/` — Jest with ts-jest preset

## Command Pattern

All commands follow the same structure:
1. Spinner (ora) for progress feedback
2. try/catch with typed AdPilotError
3. `--json` flag for machine-readable output
4. Consistent exit codes via `ExitCode` enum

## Module System

**CommonJS** — not ESM. The following packages are pinned to CJS-compatible versions:
- `chalk` v4 (v5+ is ESM-only)
- `ora` v5 (v6+ is ESM-only)
- `inquirer` v8 (v9+ is ESM-only)
- `conf` v10
- `node-fetch` v2 (v3+ is ESM-only)

tsconfig target: ES2020, module: commonjs.

## Key Dependencies

commander v12, cli-table3, chalk v4, ora v5, inquirer v8, node-fetch v2, conf v10

## Git Workflow

- Feature branches only — never push directly to main
- Branch naming: `feature/<desc>`, `fix/<desc>`, `chore/<desc>`
- PR to main for every change
- Commit format: `<type>: <short summary>`
- Always use `--author="connor odea <connor@quicklotz.com>"` on commits
