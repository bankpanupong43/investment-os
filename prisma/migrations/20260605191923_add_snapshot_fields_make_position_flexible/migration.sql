-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sector" TEXT,
    "industry" TEXT,
    "assetClass" TEXT NOT NULL DEFAULT 'equity',
    "shares" REAL,
    "avgCost" REAL,
    "entryDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "currentValueUsd" REAL,
    "currentValueThb" REAL,
    "allocationPct" REAL,
    "unrealizedReturnPct" REAL,
    "costBasisUsd" REAL,
    "dataSource" TEXT,
    "confidence" TEXT,
    "snapshotDate" DATETIME
);

-- CreateTable
CREATE TABLE "theses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "originalThesis" TEXT NOT NULL,
    "currentAssessment" TEXT,
    "keyAssumptions" TEXT NOT NULL DEFAULT '[]',
    "expectedOutcomes" TEXT NOT NULL DEFAULT '[]',
    "risks" TEXT NOT NULL DEFAULT '[]',
    "holdingPeriod" TEXT,
    "holdingPeriodMonths" INTEGER,
    "entryConfidence" INTEGER NOT NULL DEFAULT 7,
    "healthStatus" TEXT NOT NULL DEFAULT 'intact',
    "healthScore" INTEGER NOT NULL DEFAULT 7,
    "lastReviewedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "theses_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "thesis_versions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thesisId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "thesisText" TEXT NOT NULL,
    "keyAssumptions" TEXT NOT NULL DEFAULT '[]',
    "expectedOutcomes" TEXT NOT NULL DEFAULT '[]',
    "risks" TEXT NOT NULL DEFAULT '[]',
    "holdingPeriod" TEXT,
    "entryConfidence" INTEGER NOT NULL,
    "revisionReason" TEXT NOT NULL,
    "revisedBy" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "thesis_versions_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "thesis_updates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thesisId" TEXT NOT NULL,
    "updateType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "triggeredBy" TEXT,
    "sourceUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "thesis_updates_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "thesis_evaluations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thesisId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "assumptionsScore" REAL NOT NULL,
    "outcomesScore" REAL NOT NULL,
    "riskScore" REAL NOT NULL,
    "integrityScore" REAL NOT NULL,
    "overallScore" REAL NOT NULL,
    "assumptionAssessments" TEXT NOT NULL,
    "outcomeAssessments" TEXT NOT NULL,
    "riskAssessments" TEXT NOT NULL,
    "strengths" TEXT NOT NULL,
    "concerns" TEXT NOT NULL,
    "scoreRationale" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "recommendationReason" TEXT NOT NULL,
    "thesisReference" TEXT NOT NULL,
    "evaluatedBy" TEXT NOT NULL DEFAULT 'ai',
    "modelUsed" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "thesis_evaluations_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "theses" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "thesis_evaluations_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "kill_conditions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "conditionType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "metric" TEXT,
    "operator" TEXT,
    "threshold" REAL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "triggeredAt" DATETIME,
    "triggeredNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "kill_conditions_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT,
    "entryType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journal_entries_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "thesisReference" TEXT NOT NULL,
    "killConditionId" TEXT,
    "evaluationId" TEXT,
    "confidence" INTEGER,
    "urgency" TEXT NOT NULL DEFAULT 'low',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "acknowledgedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recommendations_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recommendations_killConditionId_fkey" FOREIGN KEY ("killConditionId") REFERENCES "kill_conditions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "news_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT,
    "ticker" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "content" TEXT,
    "source" TEXT,
    "url" TEXT,
    "sentiment" TEXT,
    "thesisRelevance" TEXT,
    "relevanceReasoning" TEXT,
    "publishedAt" DATETIME,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "news_items_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "earnings_events" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT,
    "ticker" TEXT NOT NULL,
    "fiscalPeriod" TEXT,
    "reportDate" DATETIME,
    "epsActual" REAL,
    "epsEstimate" REAL,
    "revenueActual" REAL,
    "revenueEstimate" REAL,
    "guidanceSummary" TEXT,
    "thesisImpact" TEXT,
    "thesisAssumptionsHit" TEXT,
    "killConditionsChecked" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "earnings_events_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "watchlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT,
    "interestReason" TEXT NOT NULL,
    "draftThesis" TEXT,
    "targetEntryPrice" REAL,
    "addedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "team_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "triggerType" TEXT NOT NULL,
    "triggerNote" TEXT,
    "tickers" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'running',
    "finalSynthesis" TEXT,
    "decisionsCreated" INTEGER NOT NULL DEFAULT 0,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "agent_briefings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "agentRole" TEXT NOT NULL,
    "ticker" TEXT,
    "report" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "agent_briefings_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "team_sessions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "briefs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "briefType" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "deliveredAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "theses_positionId_key" ON "theses"("positionId");

-- CreateIndex
CREATE UNIQUE INDEX "thesis_versions_thesisId_version_key" ON "thesis_versions"("thesisId", "version");

