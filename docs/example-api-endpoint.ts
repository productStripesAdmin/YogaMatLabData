/**
 * Example API Endpoint for YML_app
 *
 * This demonstrates how to create an API route that merges
 * brand-series-index.json with series-scores.json
 *
 * Framework: Next.js App Router (adjust for your framework)
 */

import { NextRequest, NextResponse } from 'next/server';
import brandSeriesIndex from '@/data/aggregated/latest/brand-series-index.json';
import seriesScores from '@/config/series-scores.json';
import {
  enrichBrandSeriesWithScores,
  filterSeriesByCriteria,
  sortSeries,
  type EnrichedBrandSeriesEntry,
  type YogaStyle,
  type UseCase,
  type SeriesSortBy,
} from '@/types/series-scores';

// GET /api/series
// Query params:
//   - yogaStyle: filter by yoga style
//   - useCase: filter by use case
//   - minOverallScore: filter by minimum overall score
//   - maxPrice: filter by maximum price
//   - minGripWet: filter by minimum wet grip
//   - reviewedOnly: boolean, only show reviewed series
//   - sortBy: sort field (overall, value, gripWet, etc.)
//   - sortDirection: asc or desc
//   - limit: max results to return
//   - offset: pagination offset

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Enrich series with scores
    let enriched = enrichBrandSeriesWithScores(
      brandSeriesIndex,
      seriesScores
    );

    // Apply filters
    const filters: any = {};

    if (searchParams.has('yogaStyle')) {
      filters.yogaStyle = searchParams.get('yogaStyle') as YogaStyle;
    }

    if (searchParams.has('useCase')) {
      filters.useCase = searchParams.get('useCase') as UseCase;
    }

    if (searchParams.has('minOverallScore')) {
      filters.minOverallScore = parseFloat(searchParams.get('minOverallScore')!);
    }

    if (searchParams.has('maxPrice')) {
      filters.maxPrice = parseFloat(searchParams.get('maxPrice')!);
    }

    if (searchParams.has('minGripWet')) {
      filters.minGripWet = parseFloat(searchParams.get('minGripWet')!);
    }

    if (searchParams.has('minGripDry')) {
      filters.minGripDry = parseFloat(searchParams.get('minGripDry')!);
    }

    if (searchParams.has('minCushioning')) {
      filters.minCushioning = parseFloat(searchParams.get('minCushioning')!);
    }

    if (searchParams.has('minDurability')) {
      filters.minDurability = parseFloat(searchParams.get('minDurability')!);
    }

    if (searchParams.has('minEcoRating')) {
      filters.minEcoRating = parseFloat(searchParams.get('minEcoRating')!);
    }

    if (searchParams.get('reviewedOnly') === 'true') {
      filters.requiresReviewed = true;
    }

    if (Object.keys(filters).length > 0) {
      enriched = filterSeriesByCriteria(enriched, filters);
    }

    // Apply sorting
    const sortBy = (searchParams.get('sortBy') as SeriesSortBy) || 'overall';
    const sortDirection = (searchParams.get('sortDirection') as 'asc' | 'desc') || 'desc';

    enriched = sortSeries(enriched, sortBy, sortDirection);

    // Apply pagination
    const limit = searchParams.has('limit')
      ? parseInt(searchParams.get('limit')!)
      : undefined;
    const offset = searchParams.has('offset')
      ? parseInt(searchParams.get('offset')!)
      : 0;

    const total = enriched.length;
    const paginated = limit
      ? enriched.slice(offset, offset + limit)
      : enriched.slice(offset);

    return NextResponse.json({
      data: paginated,
      meta: {
        total,
        offset,
        limit: limit || total,
        filters: filters,
        sortBy,
        sortDirection,
      },
    });

  } catch (error) {
    console.error('Error in /api/series:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET /api/series/[seriesKey]
// Get single series by key

export async function getSeriesByKey(seriesKey: string): Promise<EnrichedBrandSeriesEntry | null> {
  const enriched = enrichBrandSeriesWithScores(
    brandSeriesIndex,
    seriesScores
  );

  return enriched.find(s => s.seriesKey === seriesKey) || null;
}

// Example usage in client components:

/*
// Fetch all series for Hot Yoga
const response = await fetch('/api/series?yogaStyle=Hot%20Yoga&minGripWet=8&reviewedOnly=true&sortBy=overall');
const { data, meta } = await response.json();

// data will be:
[
  {
    seriesKey: "manduka:grp-hot-yoga",
    seriesName: "GRP® Hot Yoga",
    scores: {
      gripWet: 9.5,
      overall: 8.5,
      ...
    },
    review: {
      overview: "The Manduka GRP Hot Yoga Mat...",
      pros: [...],
      ...
    },
    yogaStyles: ["Hot Yoga", "Bikram", "Power Yoga"],
    ...
  },
  ...
]

// Fetch specific series
const series = await fetch('/api/series/manduka:pro').then(r => r.json());
*/

// Example: Get top 5 mats for beginner
export async function getBeginnerRecommendations(): Promise<EnrichedBrandSeriesEntry[]> {
  const enriched = enrichBrandSeriesWithScores(
    brandSeriesIndex,
    seriesScores
  );

  const filtered = filterSeriesByCriteria(enriched, {
    maxPrice: 100,
    requiresReviewed: true,
  });

  // Prioritize mats good for beginners
  const sorted = filtered.sort((a, b) => {
    // Calculate beginner score
    const aScore = (a.scores?.easeOfCleaning || 0) * 0.3 +
                   (a.scores?.value || 0) * 0.3 +
                   (a.scores?.cushioning || 0) * 0.2 +
                   (a.scores?.overall || 0) * 0.2;

    const bScore = (b.scores?.easeOfCleaning || 0) * 0.3 +
                   (b.scores?.value || 0) * 0.3 +
                   (b.scores?.cushioning || 0) * 0.2 +
                   (b.scores?.overall || 0) * 0.2;

    return bScore - aScore;
  });

  return sorted.slice(0, 5);
}

// Example: Get mats similar to a given series
export async function getSimilarMats(
  seriesKey: string,
  limit: number = 5
): Promise<EnrichedBrandSeriesEntry[]> {
  const enriched = enrichBrandSeriesWithScores(
    brandSeriesIndex,
    seriesScores
  );

  const target = enriched.find(s => s.seriesKey === seriesKey);
  if (!target || !target.scores) {
    return [];
  }

  // Calculate similarity score based on score differences
  const scored = enriched
    .filter(s => s.seriesKey !== seriesKey && s.scores)
    .map(s => {
      const scoreDiff = Object.keys(target.scores!).reduce((sum, key) => {
        if (key === 'overall') return sum;
        const diff = Math.abs((target.scores as any)[key] - (s.scores as any)[key]);
        return sum + diff;
      }, 0);

      return {
        series: s,
        similarity: 100 - scoreDiff, // Higher is more similar
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return scored.map(item => item.series);
}

// Example: Get best value mats (high scores, low price)
export async function getBestValueMats(limit: number = 5): Promise<EnrichedBrandSeriesEntry[]> {
  const enriched = enrichBrandSeriesWithScores(
    brandSeriesIndex,
    seriesScores
  );

  const filtered = filterSeriesByCriteria(enriched, {
    requiresReviewed: true,
  });

  // Calculate value score
  const scored = filtered
    .filter(s => s.scores && s.minPrice > 0)
    .map(s => {
      // Normalize price (lower is better)
      const maxPrice = Math.max(...filtered.map(x => x.minPrice));
      const normalizedPrice = 10 - (s.minPrice / maxPrice) * 10;

      // Value score: combination of overall score and normalized price
      const valueScore = (s.scores!.overall * 0.6) + (normalizedPrice * 0.4);

      return {
        series: s,
        valueScore,
      };
    })
    .sort((a, b) => b.valueScore - a.valueScore)
    .slice(0, limit);

  return scored.map(item => item.series);
}

// Example: Quiz result recommendations
export interface QuizAnswers {
  experience: 'beginner' | 'intermediate' | 'advanced';
  primaryStyle: YogaStyle;
  budget: number;
  sweaty: boolean;
  travel: boolean;
  ecoConscious: boolean;
}

export async function getQuizRecommendations(
  answers: QuizAnswers,
  limit: number = 3
): Promise<EnrichedBrandSeriesEntry[]> {
  const enriched = enrichBrandSeriesWithScores(
    brandSeriesIndex,
    seriesScores
  );

  // Build filter criteria from quiz answers
  const filters: any = {
    yogaStyle: answers.primaryStyle,
    maxPrice: answers.budget,
    requiresReviewed: true,
  };

  if (answers.sweaty) {
    filters.minGripWet = 7.5;
  }

  if (answers.travel) {
    filters.useCase = 'Travel';
  }

  if (answers.ecoConscious) {
    filters.minEcoRating = 7.0;
  }

  let filtered = filterSeriesByCriteria(enriched, filters);

  // Score based on experience level
  const scored = filtered.map(s => {
    if (!s.scores) return { series: s, matchScore: 0 };

    let matchScore = s.scores.overall;

    // Adjust for experience level
    if (answers.experience === 'beginner') {
      matchScore += (s.scores.easeOfCleaning - 5) * 0.3;
      matchScore += (s.scores.value - 5) * 0.2;
    } else if (answers.experience === 'advanced') {
      matchScore += (s.scores.performance - 5) * 0.3;
      matchScore += (s.scores.durability - 5) * 0.2;
    }

    return { series: s, matchScore };
  });

  return scored
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, limit)
    .map(item => item.series);
}
