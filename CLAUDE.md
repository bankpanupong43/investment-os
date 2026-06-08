# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint

# Database
npm run db:generate  # Regenerate Prisma client after schema changes
npm run db:push      # Push schema changes without migration (dev)
npm run db:migrate   # Create and run a migration
npm run db:studio    # Open Prisma Studio GUI
npm run db:reset     # Drop and reseed (destructive)

# Data ingestion
npm run refresh:universe   # Run FMP fundamentals refresh for all active universe tickers

# Validation scripts (run individually, not as a suite)
npm run validate:screener
npm run validate:opportunities
npm run validate:research
npm run validate:ingestion

# One-off utilities
npm run backup
npm run integrity
```

No test runner is configured. Validation is done via the `validate:*` scripts using `tsx`.

## Architecture

### Stack
Next.js 14 (App Router) + TypeScript + Prisma + SQLite. No ORM migrations in CI — schema changes use `db:push` in dev. Tailwind for styling. No UI component library — all components are custom inline JSX.

### Database
Single SQLite file. Path comes from `DATABASE_URL` env var. Schema is in `prisma/schema.prisma`. The database lives on Google Drive for sync across machines — `shared-paths.ts` resolves the path platform-independently.

Key env vars: `DATABASE_URL`, `FMP_API_KEY`, `ANTHROPIC_API_KEY`, `FRED_API_KEY`.

### Data Flow

**Universe → Fundamentals → Scores → Opportunities → Dossier** is the core pipeline:

1. `Universe` table — master list of investable tickers (seeded, manually managed)
2. `ingestTicker()` / `ingestUniverse()` (`src/lib/ingestion.ts`) — fetches 3 FMP endpoints per equity ticker, upserts `Fundamental`, creates a new `UniverseScore` record via `computeScores()` (`scoring-engine.ts`)
3. `computeOpportunities()` (`opportunity-engine.ts`) — joins Universe + Fundamentals + Scores + Portfolio positions to produce ranked `OpportunityEntry[]`; scores are 50% company quality, 15% allocation gap, 15% diversification, 10% watchlist, 10% Brain OS alignment
4. `generateDossier(ticker, apiKey)` (`dossier-engine.ts`) — calls `computeOpportunities()`, fetches FMP `/profile`, builds 7 narrative sections (rules-based, no AI); saves to `ResearchDossier` table via `saveDossier()`

**Current constraint**: `generateDossier()` throws if the ticker is not in the active `Universe`. This is the core limitation Phase 13A addresses.

### API Routes Pattern
All API routes are in `src/app/api/`. Routes follow Next.js App Router conventions (`route.ts`). Server-side logic lives in `src/lib/` and is imported into routes — routes are thin wrappers. Types are re-exported from route files so the client pages can `import type` from the API route directly.

### FMP Client (`src/lib/fmp-client.ts`)
Three exports used in production:
- `fetchFundamentals(ticker, apiKey)` — 3 calls: `ratios-ttm`, `key-metrics-ttm`, `income-statement`
- `fetchCompanyProfile(ticker, apiKey)` — 1 call: `profile`; returns `FMPProfile | null`; never throws

FMP free tier = 250 req/day. Equity universe refresh costs `equityCount × 3` calls. Profile is on-demand only.

### Brain OS Context (`src/lib/brain-os-context.ts`)
Reads a `brain-os.json` file from the Brain OS directory (resolved via `shared-paths.ts`). Contains investor profile, investment philosophy, and principles. Read at dossier-generation time to personalize scoring and risk sections. No DB table — file-based only.

### Nightly Scheduler (`src/lib/scheduler.ts`)
Runs a fixed job sequence: macro ingestion → FMP fundamentals refresh → opportunity scoring → morning brief → radar → blueprint → SEC filings → thesis impact → integrity → backup. Each job is recorded in the `Job` table. Triggered via `/api/automation/run` or the Automation page.

### Pages → API Dependencies
- **Screener** (`/screener`) → `GET /api/screener` → `screener-pipeline.ts` → reads `Universe + Fundamental + UniverseScore`
- **Opportunities** (`/opportunities`) → `GET /api/opportunities` → `opportunity-engine.ts`
- **Research** (`/research`) → `GET /api/research` (list dossiers) + `POST /api/research/[ticker]/generate` (generate)
- **Morning** (`/morning`) → `GET /api/morning-brief` → `morning-brief-engine.ts`
- **Committee** (`/committee`) → `GET/POST /api/committee` → `committee-engine.ts`
- **Discovery/Radar** (`/radar`) → `GET /api/radar` → `radar-engine.ts`
- **Watchlist** → `GET/POST /api/watchlist` — reads `Watchlist` table directly

### Watchlist Model
`Watchlist` is standalone — no foreign key to `Universe`. A ticker can be on the watchlist without being in the universe. Status field: `watching | researching | high_conviction | rejected | owned`.

### ResearchDossier Model
One row per ticker (`ticker` is `@unique`). `saveDossier()` upserts. `generatedAt` is the cache timestamp — used to determine staleness for the 7-day cache gate (Phase 13A).

### Scoring
`scoring-engine.ts` — pure function `computeScores(fundamental)` → five dimension scores (0–100) + `totalScore`. No AI involved. Thresholds are hardcoded constants in the file.
