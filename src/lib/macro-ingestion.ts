// Macro Ingestion Orchestrator — Phase 11: Real World Intelligence
//
// Fetches macro, market, and geopolitical data from external sources
// and stores them into MacroSnapshot, MarketSnapshot, and GeoEvent tables.
//
// Called by the macro_ingestion scheduler job and POST /api/macro-ingestion.

import { db } from "./db";
import { fetchMacroData } from "./macro-client";
import { fetchMarketData } from "./market-data-client";
import { fetchGeoEvents } from "./geo-intel-client";

export interface MacroIngestResult {
  macroPointsStored: number;
  marketPointsStored: number;
  geoEventsStored: number;
  macroMetrics: string[];
  errors: string[];
  durationMs: number;
}

export async function runMacroIngestion(fmpApiKey: string): Promise<MacroIngestResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  let macroPointsStored = 0;
  let marketPointsStored = 0;
  let geoEventsStored = 0;
  const macroMetrics: string[] = [];

  // ── Macro data (FRED) ──────────────────────────────────────────────────────
  try {
    const macroData = await fetchMacroData();
    for (const point of macroData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).macroSnapshot.upsert({
        where: { date_metric: { date: point.date, metric: point.metric } },
        create: {
          date: point.date,
          metric: point.metric,
          value: point.value,
          source: point.source,
          releaseDate: point.releaseDate,
        },
        update: {
          value: point.value,
          releaseDate: point.releaseDate,
        },
      });
      macroPointsStored++;
      macroMetrics.push(`${point.metric}=${point.value}`);
    }
  } catch (err) {
    errors.push(`Macro (FRED): ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Market data (Yahoo Finance) ────────────────────────────────────────────
  try {
    const marketData = await fetchMarketData();
    for (const point of marketData) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).marketSnapshot.upsert({
        where: { date_metric: { date: point.date, metric: point.metric } },
        create: {
          date: point.date,
          metric: point.metric,
          value: point.value,
          source: point.source,
        },
        update: {
          value: point.value,
        },
      });
      marketPointsStored++;
    }
  } catch (err) {
    errors.push(`Market (Yahoo Finance): ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── Geopolitical events (FMP news) ─────────────────────────────────────────
  try {
    const geoEvents = await fetchGeoEvents(fmpApiKey);
    const since24h = new Date(Date.now() - 24 * 3600 * 1000);

    for (const event of geoEvents) {
      // Only store events from the last 24h (this job runs daily)
      if (event.eventDate < since24h) continue;

      // Check for duplicate by region + title prefix within last 24h
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existing = await (db as any).geoEvent.findFirst({
        where: {
          region: event.region,
          eventDate: { gte: since24h },
          eventTitle: { startsWith: event.eventTitle.substring(0, 60) },
        },
      });
      if (existing) continue;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).geoEvent.create({
        data: {
          region: event.region,
          eventTitle: event.eventTitle,
          severity: event.severity,
          affectedSectors: JSON.stringify(event.affectedSectors),
          source: event.source,
          sourceUrl: event.sourceUrl,
          eventDate: event.eventDate,
        },
      });
      geoEventsStored++;
    }
  } catch (err) {
    errors.push(`GeoEvents (FMP News): ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    macroPointsStored,
    marketPointsStored,
    geoEventsStored,
    macroMetrics,
    errors,
    durationMs: Date.now() - t0,
  };
}

// ─── Latest snapshot loaders ──────────────────────────────────────────────────
// Used by engines to read current macro/market state.

export interface LatestMacro {
  metric: string;
  value: number;
  date: Date;
  source: string;
}

export async function getLatestMacroSnapshots(): Promise<Record<string, LatestMacro>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db as any).macroSnapshot.findMany({
    orderBy: { date: "desc" },
    distinct: ["metric"],
  });
  const map: Record<string, LatestMacro> = {};
  for (const row of rows) {
    map[row.metric] = { metric: row.metric, value: row.value, date: row.date, source: row.source };
  }
  return map;
}

export interface LatestMarket {
  metric: string;
  value: number;
  date: Date;
  source: string;
}

export async function getLatestMarketSnapshots(): Promise<Record<string, LatestMarket>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db as any).marketSnapshot.findMany({
    orderBy: { date: "desc" },
    distinct: ["metric"],
  });
  const map: Record<string, LatestMarket> = {};
  for (const row of rows) {
    map[row.metric] = { metric: row.metric, value: row.value, date: row.date, source: row.source };
  }
  return map;
}

export interface RecentGeoEvent {
  id: number;
  region: string;
  eventTitle: string;
  severity: string;
  affectedSectors: string[];
  source: string;
  sourceUrl: string | null;
  eventDate: Date;
}

export async function getRecentGeoEvents(days = 7): Promise<RecentGeoEvent[]> {
  const since = new Date(Date.now() - days * 86400 * 1000);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (db as any).geoEvent.findMany({
    where: { eventDate: { gte: since } },
    orderBy: { eventDate: "desc" },
    take: 20,
  });
  return rows.map((r: {
    id: number; region: string; eventTitle: string; severity: string;
    affectedSectors: string; source: string; sourceUrl: string | null; eventDate: Date;
  }) => ({
    ...r,
    affectedSectors: JSON.parse(r.affectedSectors ?? "[]"),
  }));
}
