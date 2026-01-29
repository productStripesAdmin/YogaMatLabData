import assert from 'node:assert/strict';
import { buildSeriesIndex } from './lib/brand-series-index.js';
import type { NormalizedYogaMat } from './lib/field-mapper.js';

const base: Pick<NormalizedYogaMat, 'brandSlug' | 'slug' | 'name'> = {
  brandSlug: 'yolohayoga',
  slug: 'yolohayoga-mountain-magic-unity-pro-cork-yoga-mat',
  name: 'Mountain Magic Unity Pro Cork Yoga Mat',
};

const products = [
  {
    ...base,
    shopifyHandle: 'mountain-magic-unity-pro-cork-yoga-mat',
    seriesKey: 'yolohayoga:unity-pro-cork',
    seriesName: 'Unity Pro Cork',
    seriesConfidence: 0.95,
    seriesVersion: 'series-v1',
    designName: 'Mountain Magic',
    availableColors: ['Forest', 'Forest '],
    thicknessMmx10Values: [60],
    minPrice: 159,
    maxPrice: 159,
    variantPriceValues: [159],
    isAvailable: true,
  },
  {
    ...base,
    slug: 'yolohayoga-desert-dusk-unity-pro-cork-yoga-mat',
    shopifyHandle: 'desert-dusk-unity-pro-cork-yoga-mat',
    seriesKey: 'yolohayoga:unity-pro-cork',
    seriesName: 'Unity Pro Cork',
    seriesConfidence: 0.9,
    seriesVersion: 'series-v1',
    designName: 'Desert Dusk',
    availableColors: ['forest', 'Sand'],
    thicknessMmx10Values: [60],
    minPrice: 159,
    maxPrice: 179,
    variantPriceValues: [159, 179],
    isAvailable: false,
  },
  {
    ...base,
    slug: 'yolohayoga-bundle-example',
    shopifyHandle: 'bundle-example',
    name: 'Cork Yoga Mat and Massage Balls Bundle',
    titleOriginal: 'Cork Yoga Mat and Massage Balls Bundle',
    shopifyProductType: 'Bundle',
    seriesKey: 'yolohayoga:bundle-example',
    seriesName: 'Bundle Example',
    designName: 'Bundle Example',
  },
] as NormalizedYogaMat[];

const series = buildSeriesIndex(products);

assert.equal(series.length, 1);
assert.equal(series[0].seriesKey, 'yolohayoga:unity-pro-cork');
assert.equal(series[0].productCount, 2);
assert.deepEqual(series[0].designNames, ['Mountain Magic', 'Desert Dusk']);
assert.deepEqual(series[0].availableColors, ['Forest', 'Sand']);
assert.deepEqual(series[0].variantPriceValues, [159, 179]);
assert.equal(series[0].isAvailable, true);

console.log('✓ test-series-index: ok');
