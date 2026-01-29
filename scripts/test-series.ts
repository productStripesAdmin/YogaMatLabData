import { mapShopifyToYogaMat } from './lib/field-mapper.js';
import type { ShopifyProduct } from './lib/fetch-products-json.js';

function makeProduct(params: {
  id: number;
  title: string;
  handle: string;
  vendor?: string;
  productType?: string;
}): ShopifyProduct {
  const now = new Date().toISOString();
  return {
    id: params.id,
    title: params.title,
    handle: params.handle,
    body_html: '',
    published_at: now,
    created_at: now,
    updated_at: now,
    vendor: params.vendor ?? 'Test',
    product_type: params.productType ?? 'Yoga Mats',
    tags: [],
    variants: [
      {
        id: params.id + 1,
        title: 'Default Title',
        option1: 'Default Title',
        option2: null,
        option3: null,
        sku: 'TEST-SKU',
        price: '10.00',
        compare_at_price: null,
        grams: 1000,
        available: true,
        required_shipping: true,
        taxable: true,
        position: 1,
        product_id: params.id,
        created_at: now,
        updated_at: now,
      },
    ],
    images: [],
    options: [
      {
        name: 'Title',
        position: 1,
        values: ['Default Title'],
      },
    ],
  };
}

const samples: Array<{ label: string; brandSlug: string; product: ShopifyProduct }> = [
  {
    label: 'Yoloha: design + Aura Cork',
    brandSlug: 'yolohayoga',
    product: makeProduct({
      id: 1,
      title: 'Mountain Magic Aura Cork Yoga Mat',
      handle: 'mountain-magic-aura-cork-yoga-mat',
      vendor: 'Yoloha Yoga',
    }),
  },
  {
    label: 'Yoloha: base Unity Pro XL Cork',
    brandSlug: 'yolohayoga',
    product: makeProduct({
      id: 2,
      title: 'Unity Pro XL Cork Yoga Mat',
      handle: 'unity-xl-cork-yoga-mat',
      vendor: 'Yoloha Yoga',
    }),
  },
  {
    label: 'Yoga Design Lab: series + design',
    brandSlug: 'yogadesignlab',
    product: makeProduct({
      id: 3,
      title: 'Combo Yoga Mat - Celestial',
      handle: 'combo-yoga-mat-celestial',
      vendor: 'Yoga Design Lab',
    }),
  },
  {
    label: 'House of Mats: collection/thickness suffix',
    brandSlug: 'houseofmats',
    product: makeProduct({
      id: 4,
      title: 'Forest Green Yoga mat - Studio Collection - 4.5mm',
      handle: 'forest-green',
      vendor: 'House of Mats',
    }),
  },
  {
    label: 'Liforme: Travel line by handle',
    brandSlug: 'liforme',
    product: makeProduct({
      id: 5,
      title: 'Liforme Cosmic Moon Travel Yoga Mat',
      handle: 'liforme-cosmic-moon-travel-yoga-mat',
      vendor: 'Liforme',
    }),
  },
];

for (const sample of samples) {
  const normalized = mapShopifyToYogaMat(sample.product, sample.brandSlug);
  console.log('\n---', sample.label, '---');
  console.log({
    titleOriginal: normalized.titleOriginal,
    seriesKey: normalized.seriesKey,
    seriesName: normalized.seriesName,
    seriesConfidence: normalized.seriesConfidence,
    designName: normalized.designName,
  });
}
