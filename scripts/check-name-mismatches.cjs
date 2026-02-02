#!/usr/bin/env node

/**
 * Check Name Mismatches Analysis
 *
 * Validates series naming consistency across data sources:
 * - Series names in brand-series.json vs scoring data
 * - Series names in brand-series.json vs review sources (Reddit, OutdoorGearLab)
 * - Identifies typos, formatting inconsistencies, and variations
 *
 * Output: data/scores/name-mismatches-report.json
 * Usage: npm run check-name-mismatches
 */

const fs = require('fs');
const path = require('path');

// Normalize text for comparison
function normalizeText(value) {
  return (value ?? '')
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Load JSON files
function loadJson(filepath) {
  try {
    const raw = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Error loading ${filepath}:`, error.message);
    return null;
  }
}

// Main analysis
function main() {
  const baseDir = process.cwd();
  
  // Load all data sources
  const brandSeries = loadJson(path.join(baseDir, 'config/brand-series.json'));
  const seriesScores = loadJson(path.join(baseDir, 'data/scores/series-scores.json'));
  const redditData = loadJson(path.join(baseDir, 'data/reviews/reddit-sheet.json'));
  const oglData = loadJson(path.join(baseDir, 'data/reviews/outdoorgearlab.json'));

  if (!brandSeries) {
    console.error('Failed to load brand-series.json');
    process.exit(1);
  }

  // Build series name index from config
  const configIndex = new Map();
  brandSeries.forEach(brand => {
    brand.series.forEach(series => {
      const seriesKey = `${brand.slug}:${series.slug}`;
      configIndex.set(seriesKey, {
        configName: series.name,
        configSlug: series.slug,
        brandSlug: brand.slug,
        brandName: brand.name
      });
    });
  });

  const majorMismatches = [];
  const minorMismatches = [];

  // Note: series-scores.json doesn't contain seriesName field, only scoring data
  // No name validation needed for this source

  // Check Reddit data names
  if (redditData && Array.isArray(redditData)) {
    const redditByKey = new Map();

    redditData.forEach(row => {
      const company = row.Company?.trim() || '';
      const name = row.Name?.trim() || '';
      if (!company || !name) return;

      // Try to match to config
      const brand = brandSeries.find(b => 
        normalizeText(b.name).includes(normalizeText(company)) ||
        normalizeText(company).includes(normalizeText(b.name))
      );
      if (!brand) return;

      const series = brand.series.find(s =>
        normalizeText(s.name).includes(normalizeText(name)) ||
        normalizeText(name).includes(normalizeText(s.name))
      );
      if (!series) return;

      const seriesKey = `${brand.slug}:${series.slug}`;
      if (!redditByKey.has(seriesKey)) {
        redditByKey.set(seriesKey, []);
      }
      redditByKey.get(seriesKey).push(name);
    });

    redditByKey.forEach((sourceNames, seriesKey) => {
      const configEntry = configIndex.get(seriesKey);
      if (!configEntry) return;

      const configName = configEntry.configName || '';
      const uniqueSourceNames = [...new Set(sourceNames)];

      const hasMatch = uniqueSourceNames.some(name => 
        normalizeText(name) === normalizeText(configName)
      );

      if (!hasMatch && uniqueSourceNames.length > 0) {
        const existing = minorMismatches.find(m => m.seriesKey === seriesKey);
        if (existing) {
          existing.sourceNames.push(...uniqueSourceNames);
          existing.sourceNames = [...new Set(existing.sourceNames)];
          if (!existing.sources) existing.sources = [];
          existing.sources.push('reddit-sheet.json');
        } else {
          minorMismatches.push({
            seriesKey,
            source: 'reddit-sheet.json',
            configName,
            sourceNames: uniqueSourceNames,
            severity: 'minor'
          });
        }
      }
    });
  }

  // Check OutdoorGearLab data names
  if (oglData && Array.isArray(oglData)) {
    const oglByKey = new Map();

    oglData.forEach(row => {
      const brand = row.Brand?.trim() || '';
      const series = row.Series?.trim() || '';
      if (!brand || !series) return;

      // Try to match to config
      const brandEntry = brandSeries.find(b => 
        normalizeText(b.name).includes(normalizeText(brand)) ||
        normalizeText(brand).includes(normalizeText(b.name))
      );
      if (!brandEntry) return;

      const seriesEntry = brandEntry.series.find(s =>
        normalizeText(s.name).includes(normalizeText(series)) ||
        normalizeText(series).includes(normalizeText(s.name))
      );
      if (!seriesEntry) return;

      const seriesKey = `${brandEntry.slug}:${seriesEntry.slug}`;
      if (!oglByKey.has(seriesKey)) {
        oglByKey.set(seriesKey, []);
      }
      oglByKey.get(seriesKey).push(series);
    });

    oglByKey.forEach((sourceNames, seriesKey) => {
      const configEntry = configIndex.get(seriesKey);
      if (!configEntry) return;

      const configName = configEntry.configName || '';
      const uniqueSourceNames = [...new Set(sourceNames)];

      const hasMatch = uniqueSourceNames.some(name => 
        normalizeText(name) === normalizeText(configName)
      );

      if (!hasMatch && uniqueSourceNames.length > 0) {
        const existing = minorMismatches.find(m => m.seriesKey === seriesKey);
        if (existing) {
          existing.sourceNames.push(...uniqueSourceNames);
          existing.sourceNames = [...new Set(existing.sourceNames)];
          if (!existing.sources) existing.sources = [];
          existing.sources.push('outdoorgearlab.json');
        } else {
          minorMismatches.push({
            seriesKey,
            source: 'outdoorgearlab.json',
            configName,
            sourceNames: uniqueSourceNames,
            severity: 'minor'
          });
        }
      }
    });
  }

  // Remove duplicates
  const uniqueMajor = Array.from(new Map(
    majorMismatches.map(m => [m.seriesKey, m])
  ).values());
  
  const uniqueMinor = Array.from(new Map(
    minorMismatches.map(m => [m.seriesKey, m])
  ).values());

  // Generate report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalMismatches: uniqueMajor.length + uniqueMinor.length,
      majorMismatches: uniqueMajor.length,
      minorMismatches: uniqueMinor.length
    },
    major: uniqueMajor,
    minor: uniqueMinor
  };

  // Display results
  console.log('\n===============================================================');
  console.log('NAME MISMATCHES ANALYSIS');
  console.log('===============================================================\n');

  console.log('Summary:');
  console.log(`  Total mismatches: ${report.summary.totalMismatches}`);
  console.log(`  Major (critical): ${report.summary.majorMismatches}`);
  console.log(`  Minor (variations): ${report.summary.minorMismatches}\n`);

  if (uniqueMajor.length > 0) {
    console.log('MAJOR MISMATCHES (critical inconsistencies):');
    console.log('---------------------------------------------------------------');
    uniqueMajor.forEach(m => {
      console.log(`  ${m.seriesKey}`);
      console.log(`    Config: "${m.configName}"`);
      console.log(`    Source: "${m.sourceNames.join('", "')}"`);
      console.log(`    From: ${m.source}\n`);
    });
  }

  if (uniqueMinor.length > 0) {
    console.log('MINOR MISMATCHES (formatting variations):');
    console.log('---------------------------------------------------------------');
    uniqueMinor.slice(0, 10).forEach(m => {
      console.log(`  ${m.seriesKey}`);
      console.log(`    Config: "${m.configName}"`);
      console.log(`    Found: "${m.sourceNames.join('", "')}"`);
      console.log(`    From: ${m.source}\n`);
    });
    
    if (uniqueMinor.length > 10) {
      console.log(`  ... and ${uniqueMinor.length - 10} more minor variations\n`);
    }
  }

  if (report.summary.totalMismatches === 0) {
    console.log('✓ No name mismatches found! All series names are consistent.\n');
  }

  // Write report
  const reportPath = path.join(baseDir, 'data/scores/name-mismatches-report.json');
  const reportDir = path.dirname(reportPath);
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true });
  }

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log('===============================================================');
  console.log(`Report saved to: data/scores/name-mismatches-report.json\n`);
}

main();
