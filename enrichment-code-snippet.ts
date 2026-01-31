// ============================================================================
// CODE TO ADD TO: scripts/lib/brand-series-index.ts (on main branch)
// ============================================================================

// 1. ADD THESE IMPORTS at the top (if not already there):
import { readFileSync } from 'node:fs';
import path from 'node:path';

// 2. ADD THESE INTERFACES after SeriesIndexRecord interface:

interface SeriesScore {
  seriesKey: string;
  scores: {
    gripDry: number;
    gripWet: number;
    durability: number;
    cushioning: number;
    ecoRating: number;
    portability: number;
    easeOfCleaning: number;
    stability: number;
    initialOdor: number;
    value: number;
    performance: number;
    overall: number;
  };
  review: {
    overview: string;
    pros: string[];
    cons: string[];
    bestFor: string;
    notIdealFor: string;
    lastUpdated: string;
  };
  isReviewed: boolean;
  yogaStyles: string[];
  useCases: string[];
  affiliateLinks: {
    brandWebsite?: string;
    amazon?: string;
    [key: string]: string | undefined;
  };
}

// 3. ADD THIS FUNCTION at the end of the file (before closing brace):

function enrichWithScores(seriesIndex: SeriesIndexRecord[]): SeriesIndexRecord[] {
  let seriesScores: SeriesScore[] = [];

  try {
    const configPath = path.join(process.cwd(), 'config', 'series-scores.json');
    const raw = readFileSync(configPath, 'utf-8');
    seriesScores = JSON.parse(raw);
  } catch (error) {
    // If no scoring file exists, just return original data
    console.warn('[enrichWithScores] Could not load series-scores.json, skipping enrichment');
    return seriesIndex;
  }

  return seriesIndex.map(series => {
    const scoreData = seriesScores.find(s => s.seriesKey === series.seriesKey);

    return {
      ...series,
      scores: scoreData?.scores || null,
      review: scoreData?.review || null,
      isReviewed: scoreData?.isReviewed || false,
      yogaStyles: scoreData?.yogaStyles || [],
      useCases: scoreData?.useCases || [],
      affiliateLinks: scoreData?.affiliateLinks || {}
    };
  });
}

// 4. MODIFY THE buildSeriesIndex FUNCTION - change the return statement:
//
// FIND THIS (around line 700):
//   return out;
//
// REPLACE WITH:
//   return enrichWithScores(out);

// 5. UPDATE SeriesIndexRecord interface to include new fields:
//
// ADD these fields to the SeriesIndexRecord interface (around line 200):
/*
  scores?: {
    gripDry: number;
    gripWet: number;
    durability: number;
    cushioning: number;
    ecoRating: number;
    portability: number;
    easeOfCleaning: number;
    stability: number;
    initialOdor: number;
    value: number;
    performance: number;
    overall: number;
  } | null;

  review?: {
    overview: string;
    pros: string[];
    cons: string[];
    bestFor: string;
    notIdealFor: string;
    lastUpdated: string;
  } | null;

  isReviewed?: boolean;
  yogaStyles?: string[];
  useCases?: string[];
  affiliateLinks?: {
    brandWebsite?: string;
    amazon?: string;
    [key: string]: string | undefined;
  };
*/
