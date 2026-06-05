-- CreateTable
CREATE TABLE "portfolio_settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL DEFAULT 'Main Portfolio',
    "totalCapitalThb" REAL NOT NULL,
    "totalCapitalUsd" REAL NOT NULL,
    "exchangeRate" REAL NOT NULL,
    "source" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "allocation_targets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetPct" REAL NOT NULL,
    "targetUsd" REAL NOT NULL,
    "targetThb" REAL NOT NULL,
    "bucket" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "allocation_targets_ticker_key" ON "allocation_targets"("ticker");
