import { mapShopifyToYogaMat } from './lib/field-mapper.js';
import type { ShopifyProduct } from './lib/fetch-products-json.js';

function makeProduct(params: { id: number; title: string; handle: string; bodyHtml: string }): ShopifyProduct {
  const now = new Date().toISOString();
  return {
    id: params.id,
    title: params.title,
    handle: params.handle,
    body_html: params.bodyHtml,
    published_at: now,
    created_at: now,
    updated_at: now,
    vendor: 'Test',
    product_type: 'Yoga Mats',
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
    label: 'Gaiam: 68"L x 24"W x 4mm',
    brandSlug: 'gaiam',
    product: makeProduct({
      id: 1,
      title: 'Classic Mystic Ink Yoga Mat (4mm)',
      handle: 'classic-mystic-ink-yoga-mat-4mm',
      bodyHtml: '<p><strong>Measurements: </strong>68"L x 24"W x 4mm.</p>',
    }),
  },
  {
    label: 'Alo: 6.2ft x 2.2ft x 3mm',
    brandSlug: 'aloyoga',
    product: makeProduct({
      id: 2,
      title: 'Lightweight Warrior Mat - Black',
      handle: 'a0779u-lightweight-warrior-mat-black',
      bodyHtml: '<p>Dimensions: 6.2ft x 2.2ft x 3mm</p><p>Weight: Approximately 5 lbs</p>',
    }),
  },
  {
    label: 'Unicode inches: 72″ x 24”',
    brandSlug: '42birds',
    product: makeProduct({
      id: 3,
      title: '100% Cork Yoga Mat "The Woodpecker"',
      handle: 'all-natural-cork-yoga-mat',
      bodyHtml: '<p>Specifications: 72″ x 24” | 5mm thick</p>',
    }),
  },
  {
    label: 'Jade: 24" wide (no space edge cases)',
    brandSlug: 'jade',
    product: makeProduct({
      id: 4,
      title: 'Jade Yoga Mat',
      handle: 'jade-yoga-mat',
      bodyHtml: '<p>Dimensions: 3/16&quot; thick, 24&quot; wide, available in two lengths: 68&quot; and 74&rdquo;, and weighs about 5 pounds.</p>',
    }),
  },
  {
    label: 'Yoga Design Lab: 70" (178 cm) long x 24" (61 cm) wide',
    brandSlug: 'yogadesignlab',
    product: makeProduct({
      id: 5,
      title: 'Combo Yoga Mat - Rainbow',
      handle: 'combo-yoga-mat-rainbow',
      bodyHtml: '<p><strong>Dimensions:</strong> 70&quot; (178 cm) long x 24&quot; (61 cm) wide</p><p><strong>Thickness Options:</strong> 3.5mm or 5.5mm</p>',
    }),
  },
];

for (const sample of samples) {
  const normalized = mapShopifyToYogaMat(sample.product, sample.brandSlug);
  console.log('\n---', sample.label, '---');
  console.log({
    length: normalized.length,
    width: normalized.width,
    thickness: normalized.thickness,
    dimensionQuery: {
      lengthCmMin: normalized.lengthCmMin,
      widthCmMin: normalized.widthCmMin,
      lengthCMx10Values: normalized.lengthCMx10Values,
      widthCMx10Values: normalized.widthCMx10Values,
    }
  });
}
