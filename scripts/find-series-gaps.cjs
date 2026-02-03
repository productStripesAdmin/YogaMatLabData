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
const brands = JSON.parse(fs.readFileSync(path.join(baseDir, 'config/brands.json'), 'utf-8'));
const outdoorGearLab = JSON.parse(fs.readFileSync(path.join(baseDir, 'data/reviews/outdoorgearlab.json'), 'utf-8'));
const redditSheet = JSON.parse(fs.readFileSync(path.join(baseDir, 'data/reviews/reddit-sheet.json'), 'utf-8'));
const seriesScores = JSON.parse(fs.readFileSync(path.join(baseDir, 'data/scores/series-scores.json'), 'utf-8'));
const researchSources = JSON.parse(fs.readFileSync(path.join(baseDir, 'data/reviews/research-sources.json'), 'utf-8'));

// Create set of published brand slugs
const publishedBrands = new Set(
  brands.brands
    .filter(b => b.isPublished === true)
    .map(b => b.slug)
);

// Extract all seriesKeys from brand-series.json (only for published brands)
const configSeriesKeys = new Set();
brandSeries.forEach(brand => {
  if (!publishedBrands.has(brand.slug)) return;
  brand.series.forEach(series => {
    const seriesKey = `${brand.slug}:${series.slug}`;
    configSeriesKeys.add(seriesKey);
  });
});

// Extract brand slugs from review data to filter by published status
const getReviewBrandSlugs = (entries) => {
  const slugs = new Set();
  entries.forEach(entry => {
    if (entry.seriesKey) {
      const [brandSlug] = entry.seriesKey.split(':');
      slugs.add(brandSlug);
    }
  });
  return slugs;
};

// Extract all seriesKeys from review data (only for published brands)
const oglKeys = new Set(
  outdoorGearLab
    .filter(x => x.seriesKey && publishedBrands.has(x.seriesKey.split(':')[0]))
    .map(x => x.seriesKey)
);
const redditKeys = new Set(
  redditSheet
    .filter(x => x.seriesKey && publishedBrands.has(x.seriesKey.split(':')[0]))
    .map(x => x.seriesKey)
);
const scoresKeys = new Set(
  seriesScores
    .filter(x => publishedBrands.has(x.seriesKey.split(':')[0]))
    .map(x => x.seriesKey)
);
const researchKeys = new Set(
  researchSources
    .filter(x => publishedBrands.has(x.seriesKey.split(':')[0]))
    .map(x => x.seriesKey)
);

// Combine all review sources
const allReviewKeys = new Set([...oglKeys, ...redditKeys, ...scoresKeys, ...researchKeys]);

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
console.log('  Research sources documented:   ' + researchKeys.size + ' series');
console.log('  Total unique in reviews:       ' + allReviewKeys.size + ' series\n');

// First, analyze brand alignment across review sources
console.log('BRAND ALIGNMENT ANALYSIS:');
console.log('---------------------------------------------------------------');

const reviewBrands = new Set();
[...outdoorGearLab, ...redditSheet].forEach(entry => {
  const brandName = entry.Brand || entry.Company;
  if (brandName && brandName.trim()) {
    reviewBrands.add(brandName.trim());
  }
});

const brandStatus = {};

// Create multiple lookup keys for fuzzy matching
const brandLookup = new Map();
const brandAliases = {
  'jade': 'jadeyoga',
  'alo': 'aloyoga',
  'ajna': 'ajna',
  'b yoga': 'b-yoga',
  'yoloha': 'yoloha',
  'lululemon': 'lululemon',
  'yoga design lab': 'yogadesignlab',
  'yogamatters': 'yogamatters',
  'primasole': 'primasole',
  'hugger mugger': 'huggermugger',
  'iuga': 'iuga',
  'prana verde': 'pranaverde',
  'jollie': 'jollie',
  'gaiam': 'gaiam',
  'liforme': 'liforme',
  'manduka': 'manduka'
};

// Build lookup maps
brands.brands.forEach(b => {
  brandLookup.set(b.name.toLowerCase(), b);
  brandLookup.set(b.slug.toLowerCase(), b);
});

reviewBrands.forEach(brandName => {
  const normalized = brandName.toLowerCase().trim();

  // Try direct match
  let configBrand = brandLookup.get(normalized);

  // Try alias
  if (!configBrand) {
    const aliasSlug = brandAliases[normalized];
    if (aliasSlug) {
      configBrand = brandLookup.get(aliasSlug);
    }
  }

  // Try partial match (if no spaces match with spaces)
  if (!configBrand) {
    for (const [key, brand] of brandLookup) {
      if (key.includes(normalized) || normalized.includes(key.replace(/\s+/g, ''))) {
        configBrand = brand;
        break;
      }
    }
  }

  if (configBrand) {
    const status = configBrand.isPublished ? 'published' : 'unpublished';
    if (!brandStatus[status]) brandStatus[status] = [];
    brandStatus[status].push({
      name: brandName,
      slug: configBrand.slug,
      isPublished: configBrand.isPublished
    });
  } else {
    if (!brandStatus['not-in-config']) brandStatus['not-in-config'] = [];
    brandStatus['not-in-config'].push({
      name: brandName,
      slug: null,
      isPublished: null
    });
  }
});

if (brandStatus['published']) {
  console.log('  Published brands in reviews: ' + brandStatus['published'].length);
  brandStatus['published'].forEach(b => console.log('    ✓ ' + b.name + ' (' + b.slug + ')'));
}
if (brandStatus['unpublished']) {
  console.log('  Unpublished brands in reviews: ' + brandStatus['unpublished'].length);
  brandStatus['unpublished'].forEach(b => console.log('    ✗ ' + b.name + ' (' + b.slug + ') - not published'));
}
if (brandStatus['not-in-config']) {
  console.log('  Brands missing from config: ' + brandStatus['not-in-config'].length);
  brandStatus['not-in-config'].forEach(b => console.log('    ? ' + b.name + ' - needs to be added'));
}
console.log('');

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
    if (researchKeys.has(key)) sources.push('Research');

    // Get brand and series from first occurrence
    let brandName = '';
    let seriesName = '';
    const oglEntry = outdoorGearLab.find(x => x.seriesKey === key);
    const redditEntry = redditSheet.find(x => x.seriesKey === key);
    const researchEntry = researchSources.find(x => x.seriesKey === key);

    if (oglEntry) {
      brandName = oglEntry.Brand;
      seriesName = oglEntry.Series;
    } else if (redditEntry) {
      brandName = redditEntry.Company;
      seriesName = redditEntry.Name;
    } else if (researchEntry) {
      const parts = researchEntry.seriesKey.split(':');
      const brand = brandSeries.find(b => b.slug === parts[0]);
      if (brand) {
        const series = brand.series.find(s => s.slug === parts[1]);
        if (series) {
          brandName = brand.slug;
          seriesName = series.name;
        }
      }
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
  brandAlignment: {
    publishedBrandsInReviews: (brandStatus['published'] || []).map(b => ({
      name: b.name,
      slug: b.slug,
      isPublished: true
    })),
    unpublishedBrandsInReviews: (brandStatus['unpublished'] || []).map(b => ({
      name: b.name,
      slug: b.slug,
      isPublished: false
    })),
    brandsMissingFromConfig: (brandStatus['not-in-config'] || []).map(b => ({
      name: b.name,
      status: 'missing-from-config'
    }))
  },
  missingFromConfig: inReviewsNotConfig.map(key => {
    const sources = [];
    if (oglKeys.has(key)) sources.push('OutdoorGearLab');
    if (redditKeys.has(key)) sources.push('Reddit');
    if (scoresKeys.has(key)) sources.push('Scored');
    if (researchKeys.has(key)) sources.push('Research');

    const oglEntry = outdoorGearLab.find(x => x.seriesKey === key);
    const redditEntry = redditSheet.find(x => x.seriesKey === key);
    const researchEntry = researchSources.find(x => x.seriesKey === key);

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
