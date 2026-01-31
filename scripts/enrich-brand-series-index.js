#!/usr/bin/env node

/**
 * Enrich brand-series-index.json with scoring data
 *
 * This script merges series-scores.json into brand-series-index.json
 * to create an enriched version with all scoring fields.
 *
 * Usage:
 *   node scripts/enrich-brand-series-index.js [input-date] [output-date]
 *
 * Example:
 *   node scripts/enrich-brand-series-index.js 2026-01-29 2026-01-30
 *
 * If no dates provided, uses latest aggregated data
 */

const fs = require('fs');
const path = require('path');

// Find latest aggregated data directory
function getLatestAggregatedDir() {
  const aggregatedPath = path.join(__dirname, '../data/aggregated');
  const dirs = fs.readdirSync(aggregatedPath)
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();

  return dirs[0];
}

function enrichBrandSeriesWithScores(brandSeriesIndex, seriesScores) {
  return brandSeriesIndex.map(series => {
    const scoreData = seriesScores.find(s => s.seriesKey === series.seriesKey);

    if (!scoreData) {
      // No scoring data available for this series
      return {
        ...series,
        scores: null,
        review: null,
        isReviewed: false,
        yogaStyles: [],
        useCases: [],
        affiliateLinks: {}
      };
    }

    // Merge scoring data
    return {
      ...series,
      scores: scoreData.scores,
      review: scoreData.review,
      isReviewed: scoreData.isReviewed,
      yogaStyles: scoreData.yogaStyles,
      useCases: scoreData.useCases,
      affiliateLinks: scoreData.affiliateLinks
    };
  });
}

function main() {
  const inputDate = process.argv[2] || getLatestAggregatedDir();
  const outputDate = process.argv[3] || new Date().toISOString().split('T')[0];

  console.log('🔧 Enriching brand-series-index.json with scoring data\n');

  // Paths
  const inputDir = path.join(__dirname, '../data/aggregated', inputDate);
  const outputDir = path.join(__dirname, '../data/aggregated', outputDate);
  const scoresPath = path.join(__dirname, '../config/series-scores.json');

  const inputPath = path.join(inputDir, 'brand-series-index.json');
  const outputPath = path.join(outputDir, 'brand-series-index.json');

  // Validate input paths
  if (!fs.existsSync(inputPath)) {
    console.error(`❌ Input file not found: ${inputPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(scoresPath)) {
    console.error(`❌ Scores file not found: ${scoresPath}`);
    process.exit(1);
  }

  // Load data
  console.log(`📖 Loading brand-series-index from ${inputDate}...`);
  const brandSeriesIndex = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  console.log(`📖 Loading series-scores.json...`);
  const seriesScores = JSON.parse(fs.readFileSync(scoresPath, 'utf8'));

  // Enrich
  console.log(`\n🔄 Enriching ${brandSeriesIndex.length} series...`);
  const enriched = enrichBrandSeriesWithScores(brandSeriesIndex, seriesScores);

  // Count enriched vs not
  const enrichedCount = enriched.filter(s => s.isReviewed).length;
  const notEnrichedCount = enriched.length - enrichedCount;

  console.log(`   ✅ ${enrichedCount} series have scoring data`);
  console.log(`   ⚠️  ${notEnrichedCount} series without scores (will have null values)`);

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    console.log(`\n📁 Creating output directory: ${outputDir}`);
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write enriched data
  console.log(`\n💾 Writing enriched data to ${outputDate}...`);
  fs.writeFileSync(
    outputPath,
    JSON.stringify(enriched, null, 2),
    'utf8'
  );

  console.log(`\n✅ Enrichment complete!`);
  console.log(`\n📊 Output: ${outputPath}`);
  console.log(`   File size: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);

  // Show example of enriched entry
  const exampleSeries = enriched.find(s => s.isReviewed);
  if (exampleSeries) {
    console.log(`\n📝 Example enriched entry (${exampleSeries.seriesKey}):`);
    console.log(JSON.stringify({
      seriesKey: exampleSeries.seriesKey,
      seriesName: exampleSeries.seriesName,
      isReviewed: exampleSeries.isReviewed,
      scores: exampleSeries.scores,
      yogaStyles: exampleSeries.yogaStyles,
      useCases: exampleSeries.useCases,
      review: {
        overview: exampleSeries.review.overview.substring(0, 100) + '...',
        pros: exampleSeries.review.pros.slice(0, 2),
        cons: exampleSeries.review.cons.slice(0, 2),
        bestFor: exampleSeries.review.bestFor.substring(0, 80) + '...',
      },
      affiliateLinks: exampleSeries.affiliateLinks
    }, null, 2));
  }

  console.log('\n✨ Done!\n');
}

if (require.main === module) {
  main();
}

module.exports = { enrichBrandSeriesWithScores };
