#!/usr/bin/env node

/**
 * Find Series Gaps Analysis
 *
 * Compares series data across multiple sources to identify gaps:
 * - Series in reviews but missing from config
 * - Series in config but lacking review/scoring data
 * - Brand coverage analysis
 *
 * Output: data/scores/series-gaps-report.json
 * Usage: npm run find-series-gaps
 */

const fs = require('fs');
const path = require('path');

// Load all data files
const baseDir = '/Users/kevin/_projects/PROJECTS/YogaMatLab/YogaMatLabData';
const brandSeries = JSON.parse(fs.readFileSync(path.join(baseDir, 'config/brand-series.json'), 'utf-8'));
const outdoorGearLab = JSON.parse(fs.readFileSync(path.join(baseDir, 'data/reviews/outdoorgearlab.json'), 'utf-8'));
const redditSheet = JSON.parse(fs.readFileSync(path.join(baseDir, 'data/reviews/reddit-sheet.json'), 'utf-8'));
const seriesScores = JSON.parse(fs.readFileSync(path.join(baseDir, 'data/scores/series-scores.json'), 'utf-8'));

// Extract all seriesKeys from brand-series.json
const configSeriesKeys = new Set();
brandSeries.forEach(brand => {
  brand.series.forEach(series => {
    const seriesKey = `${brand.slug}:${series.slug}`;
    configSeriesKeys.add(seriesKey);
  });
});

// Extract all seriesKeys from review data
const oglKeys = new Set(outdoorGearLab.filter(x => x.seriesKey).map(x => x.seriesKey));
const redditKeys = new Set(redditSheet.filter(x => x.seriesKey).map(x => x.seriesKey));
const scoresKeys = new Set(seriesScores.map(x => x.seriesKey));

// Combine all review sources
const allReviewKeys = new Set([...oglKeys, ...redditKeys, ...scoresKeys]);

// Find gaps
console.log('===============================================================');
console.log('SERIES KEY GAP ANALYSIS');
console.log('===============================================================\n');

console.log('Summary Statistics:');
console.log('---------------------------------------------------------------');
console.log('  Config (brand-series.json):    ' + configSeriesKeys.size + ' series');
console.log('  OutdoorGearLab reviews:        ' + oglKeys.size + ' series');
console.log('  Reddit community data:         ' + redditKeys.size + ' series');
console.log('  Scored series:                 ' + scoresKeys.size + ' series');
console.log('  Total unique in reviews:       ' + allReviewKeys.size + ' series\n');

// Gap 1: In reviews but NOT in config
const inReviewsNotConfig = [...allReviewKeys].filter(key => !configSeriesKeys.has(key));
console.log('IN REVIEW DATA BUT MISSING FROM CONFIG:');
console.log('---------------------------------------------------------------');
if (inReviewsNotConfig.length === 0) {
  console.log('  None - all review series are in config!\n');
} else {
  console.log('  Found ' + inReviewsNotConfig.length + ' missing series:\n');
  
  inReviewsNotConfig.sort().forEach(key => {
    const sources = [];
    if (oglKeys.has(key)) sources.push('OGL');
    if (redditKeys.has(key)) sources.push('Reddit');
    if (scoresKeys.has(key)) sources.push('Scored');
    
    // Get brand and series from first occurrence
    let brandName = '';
    let seriesName = '';
    const oglEntry = outdoorGearLab.find(x => x.seriesKey === key);
    const redditEntry = redditSheet.find(x => x.seriesKey === key);
    
    if (oglEntry) {
      brandName = oglEntry.Brand;
      seriesName = oglEntry.Series;
    } else if (redditEntry) {
      brandName = redditEntry.Company;
      seriesName = redditEntry.Name;
    }
    
    console.log('  - ' + key);
    console.log('    Brand: ' + brandName + ', Series: ' + seriesName);
    console.log('    Sources: ' + sources.join(', '));
    console.log('');
  });
}

// Gap 2: In config but NOT in any reviews
const inConfigNotReviews = [...configSeriesKeys].filter(key => !allReviewKeys.has(key));
console.log('IN CONFIG BUT NOT IN ANY REVIEW DATA:');
console.log('---------------------------------------------------------------');
console.log('  Found ' + inConfigNotReviews.length + ' series without review data\n');

// Show just the first 20 as examples
const sampleSize = 20;
if (inConfigNotReviews.length > 0) {
  console.log('  Showing first ' + Math.min(sampleSize, inConfigNotReviews.length) + ' examples:\n');
  
  inConfigNotReviews.slice(0, sampleSize).sort().forEach(key => {
    const parts = key.split(':');
    const brandSlug = parts[0];
    const seriesSlug = parts[1];
    const brand = brandSeries.find(b => b.slug === brandSlug);
    const series = brand ? brand.series.find(s => s.slug === seriesSlug) : null;
    
    console.log('  - ' + key);
    if (series) {
      console.log('    Name: ' + series.name);
      console.log('    Tagline: ' + series.tagline);
    }
    console.log('');
  });
  
  if (inConfigNotReviews.length > sampleSize) {
    console.log('  ... and ' + (inConfigNotReviews.length - sampleSize) + ' more\n');
  }
}

// Gap 3: Detailed breakdown by brand for missing review data
console.log('BRANDS WITH MOST SERIES MISSING REVIEW DATA:');
console.log('---------------------------------------------------------------');

const missingByBrand = {};
inConfigNotReviews.forEach(key => {
  const brandSlug = key.split(':')[0];
  if (!missingByBrand[brandSlug]) {
    missingByBrand[brandSlug] = 0;
  }
  missingByBrand[brandSlug]++;
});

const brandsSorted = Object.entries(missingByBrand)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10);

brandsSorted.forEach(entry => {
  const brandSlug = entry[0];
  const count = entry[1];
  const brand = brandSeries.find(b => b.slug === brandSlug);
  const totalSeries = brand ? brand.series.length : 0;
  const coverage = totalSeries > 0 ? Math.round((totalSeries - count) / totalSeries * 100) : 0;
  
  const paddedBrand = brandSlug + ' '.repeat(Math.max(0, 20 - brandSlug.length));
  console.log('  ' + paddedBrand + ' ' + count + '/' + totalSeries + ' missing (' + coverage + '% coverage)');
});

console.log('\n===============================================================\n');

// Export detailed report
const report = {
  timestamp: new Date().toISOString(),
  summary: {
    configTotal: configSeriesKeys.size,
    reviewTotal: allReviewKeys.size,
    inReviewsNotConfig: inReviewsNotConfig.length,
    inConfigNotReviews: inConfigNotReviews.length
  },
  missingFromConfig: inReviewsNotConfig.map(key => {
    const sources = [];
    if (oglKeys.has(key)) sources.push('OutdoorGearLab');
    if (redditKeys.has(key)) sources.push('Reddit');
    if (scoresKeys.has(key)) sources.push('Scored');
    
    const oglEntry = outdoorGearLab.find(x => x.seriesKey === key);
    const redditEntry = redditSheet.find(x => x.seriesKey === key);
    
    return {
      seriesKey: key,
      brand: (oglEntry ? oglEntry.Brand : (redditEntry ? redditEntry.Company : '')),
      series: (oglEntry ? oglEntry.Series : (redditEntry ? redditEntry.Name : '')),
      sources: sources
    };
  }),
  missingReviewData: inConfigNotReviews.map(key => {
    const parts = key.split(':');
    const brandSlug = parts[0];
    const seriesSlug = parts[1];
    const brand = brandSeries.find(b => b.slug === brandSlug);
    const series = brand ? brand.series.find(s => s.slug === seriesSlug) : null;
    
    return {
      seriesKey: key,
      name: series ? series.name : '',
      tagline: series ? series.tagline : ''
    };
  })
};

fs.writeFileSync(
  path.join(baseDir, 'data/scores/series-gaps-report.json'),
  JSON.stringify(report, null, 2)
);

console.log('Detailed report saved to: data/scores/series-gaps-report.json\n');
