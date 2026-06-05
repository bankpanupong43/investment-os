-- CreateTable
CREATE TABLE "investment_theses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticker" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "thesis" TEXT NOT NULL,
    "whyOwn" TEXT NOT NULL,
    "risks" TEXT NOT NULL,
    "killCriteria" TEXT NOT NULL,
    "confidenceScore" INTEGER NOT NULL DEFAULT 7,
    "reviewFrequency" TEXT NOT NULL DEFAULT 'quarterly',
    "lastReviewedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isDraft" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "thesis_reviews" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "thesisId" TEXT NOT NULL,
    "reviewType" TEXT NOT NULL,
    "previousConfidence" INTEGER,
    "newConfidence" INTEGER,
    "notes" TEXT,
    "reviewedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "thesis_reviews_thesisId_fkey" FOREIGN KEY ("thesisId") REFERENCES "investment_theses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "investment_theses_ticker_key" ON "investment_theses"("ticker");
