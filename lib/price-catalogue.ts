// Price catalogue for the budget planner.
// Data only: no logic lives here. Every entry is keyed by an id from compatibility-catalogue.ts, so no product is described twice.
//
// Data policy:
// - Prices were read from the product pages of the approved Indian retailers listed in APPROVED_RETAILERS on RESEARCHED.
// - Only IN-STOCK listings of the exact catalogue model (or the exact variant named in `variant`) are observations.
//   Every other listing seen is kept under `rejected` with the reason it was not counted.
// - Amazon.in and Flipkart third-party marketplace listings are not approved sources and are never counted.
// - min, max and median are stored with the record and are checked against the observations by the tests.
// - A model with no usable observation is `unverified`: it is excluded from budget results, never given a guessed price.
// - Prices are a snapshot, not live prices. They are listed prices in rupees (INR); shipping and bank offers are not included.

export const RESEARCHED = '2026-10-29';

export const APPROVED_RETAILERS = ['MD Computers', 'PrimeABGB', 'Vedant Computers', 'EliteHubs', 'Computech Store', 'PC Studio'] as const;
export type Retailer = (typeof APPROVED_RETAILERS)[number];

export type Observation = {
  retailer: Retailer;
  url: string;
  listing: string; // the listing title, as shown on the page
  productCode?: string; // the manufacturer part number or SKU shown on the page
  priceInr: number;
  availability: 'in-stock';
  observed: string; // ISO date the page was read
};

export type RejectedListing = {
  retailer: Retailer | 'Amazon.in';
  url: string;
  listing: string;
  priceInr?: number;
  availability: 'in-stock' | 'out-of-stock';
  reason: string;
};

export type PriceStats = { min: number; median: number; max: number };

export type VerifiedPrice = {
  status: 'verified';
  productId: string;
  variant?: string; // set when the price is for one named variant of the catalogue model
  observations: Observation[];
  stats: PriceStats;
  rejected: RejectedListing[];
};

export type UnverifiedReason = 'not-listed' | 'out-of-stock-only' | 'variant-ambiguous' | 'different-model';

export type UnverifiedPrice = {
  status: 'unverified';
  productId: string;
  reason: UnverifiedReason;
  explanation: string;
  rejected: RejectedListing[];
};

export type PriceRecord = VerifiedPrice | UnverifiedPrice;

const AT = RESEARCHED;
const seen = (retailer: Retailer, url: string, listing: string, priceInr: number, productCode?: string): Observation => ({ retailer, url, listing, productCode, priceInr, availability: 'in-stock', observed: AT });

export const PRICE_RECORDS: PriceRecord[] = [
  // ── CPUs ──
  {
    status: 'verified', productId: 'amd-ryzen-5-7600',
    observations: [
      seen('MD Computers', 'https://mdcomputers.in/product/amd-ryzen-5-7600-100-100001015box-desktop-processor', 'AMD Ryzen 5 7600 Processor with Radeon Graphics', 19800, '100-100001015BOX'),
      seen('EliteHubs', 'https://elitehubs.com/products/amd-ryzen-5-7600-processor-with-radeon-graphics', 'AMD Ryzen 5 7600 7th Generation Processor ( 5.1 GHz / 6 Cores / 12 Threads )', 19995, 'amd-ryzen-5-7600'),
    ],
    stats: { min: 19800, median: 19897.5, max: 19995 },
    rejected: [],
  },
  {
    status: 'verified', productId: 'amd-ryzen-5-5600x', variant: 'Retail box (100-100000065BOX); OEM packs excluded',
    observations: [
      seen('Vedant Computers', 'https://www.vedantcomputers.com/amd-ryzen-5-5600x-processor-100-100000065box', 'AMD Ryzen 5 5600X Processor (6 Cores, 12 Threads, Max. Boost Clock Up To 4.6GHz, AM4 Socket and 35MB Cache)', 14550, '100-100000065BOX'),
      seen('PrimeABGB', 'https://www.primeabgb.com/online-price-reviews-india/amd-ryzen-5-5600x-desktop-processor-6-cores-12-threads-3-7ghz/', 'AMD Ryzen 5 5600X Desktop Processor (6 Cores/12 Threads/3.7GHz)', 15033, '100-100000065BOX'),
      seen('EliteHubs', 'https://elitehubs.com/products/amd-ryzen-5-5600x-processor', 'AMD Ryzen 5 5600X 5th Gen Processor ( 4.6 GHz / 6 Cores / 12 Threads )', 15195, 'AMD-Ryzen-5-5600X'),
      seen('MD Computers', 'https://mdcomputers.in/product/amd-ryzen-5-5600x-100-100000065box-desktop-processor', 'AMD Ryzen 5 5600X Processor', 15200, '100-100000065BOX'),
    ],
    stats: { min: 14550, median: 15114, max: 15200 },
    rejected: [
      { retailer: 'PrimeABGB', url: 'https://www.primeabgb.com/online-price-reviews-india/amd-ryzen-5-5600x-desktop-processor-6-cores-12-threads-3-7ghz-oem-pack-with-stock-cooler-100-100000065/', listing: 'AMD Ryzen 5 5600X Desktop Processor OEM Pack with Stock Cooler 100-100000065', priceInr: 13758, availability: 'out-of-stock', reason: 'OEM pack, a different product from the retail box; also out of stock' },
    ],
  },
  {
    status: 'verified', productId: 'intel-core-i5-13400f',
    observations: [
      seen('MD Computers', 'https://mdcomputers.in/product/intel-i5-13400f-bx8071513400f-desktop-processor', 'Intel Core i5-13400F Processor', 17700, 'BX8071513400F'),
    ],
    stats: { min: 17700, median: 17700, max: 17700 },
    rejected: [
      { retailer: 'Vedant Computers', url: 'https://www.vedantcomputers.com/intel-core-i5-13400f-processor', listing: 'Intel Core i5-13400F Processor (20M Cache, up to 4.60 GHz)', priceInr: 17470, availability: 'out-of-stock', reason: 'Out of stock' },
      { retailer: 'PrimeABGB', url: 'https://www.primeabgb.com/online-price-reviews-india/intel-core-i5-13400f-2-5ghz-ten-core-lga1700-processor-bx8071513400f/', listing: 'Intel Core i5 13400F 2.5GHz Ten Core LGA1700 Processor BX8071513400F', priceInr: 12399, availability: 'out-of-stock', reason: 'Out of stock; the page shows two conflicting prices' },
    ],
  },

  // ── Motherboards ──
  {
    status: 'verified', productId: 'asus-rog-strix-b650-a-gaming-wifi',
    observations: [
      seen('MD Computers', 'https://mdcomputers.in/product/asus-rog-strix-b650-a-gaming-wifi-motherboard', 'ASUS ROG Strix B650-A Gaming WIFI ATX Motherboard', 30950, 'ROG-STRIX-B650-A-GAMING-WIFI'),
      seen('EliteHubs', 'https://elitehubs.com/products/asus-rog-strix-b650-a-gaming-wifi6e-ddr5-amd-motherboard', 'ASUS ROG STRIX B650-A Gaming Wifi6e DDR5 AMD Motherboard', 30948, 'ROG-STRIX-B650-A-GAMING-WIFI'),
    ],
    stats: { min: 30948, median: 30949, max: 30950 },
    rejected: [],
  },
  {
    status: 'unverified', productId: 'asus-rog-strix-b650e-i-gaming-wifi', reason: 'not-listed',
    explanation: 'No approved retailer has a price for this board. PC Studio lists it without a price, and the other approved retailers do not list it.',
    rejected: [
      { retailer: 'PC Studio', url: 'https://www.pcstudio.in/product/asus-rog-strix-b650e-i-gaming-wifi-am5-mini-itx-motherboard/', listing: 'Asus Rog Strix B650E-I Gaming Wifi AM5 Mini-ITX Motherboard', availability: 'out-of-stock', reason: 'Out of stock, no price shown' },
    ],
  },
  {
    status: 'unverified', productId: 'asus-rog-maximus-z790-extreme', reason: 'out-of-stock-only',
    explanation: 'No approved retailer has a current price for this board, so none of the listings found is counted.',
    rejected: [
      { retailer: 'MD Computers', url: 'https://mdcomputers.in/asus-rog-maximus-z790-extreme-wifi.html', listing: 'Asus ROG Maximus Z790 Extreme (Wi-Fi) Motherboard', priceInr: 98999, availability: 'out-of-stock', reason: 'Out of stock' },
      { retailer: 'Computech Store', url: 'https://computechstore.in/product/asus-z790-extreme-wifi-motherboard/', listing: 'Asus ROG Maximus Z790 Extreme (Wi-Fi) Motherboard', priceInr: 95499, availability: 'out-of-stock', reason: 'Sold out' },
      { retailer: 'PC Studio', url: 'https://www.pcstudio.in/product/asus-rog-maximus-z790-extreme-lga1700-eatx-motherboard/', listing: 'Asus Rog Maximus Z790 Extreme LGA1700 EATX Motherboard', priceInr: 103900, availability: 'out-of-stock', reason: 'Out of stock' },
    ],
  },
  {
    status: 'unverified', productId: 'msi-mag-b550-tomahawk', reason: 'variant-ambiguous',
    explanation: 'No current price was found for the exact MAG B550 TOMAHAWK. The other listings are for the MAG B550 TOMAHAWK WIFI, which is treated as a different model unless a manufacturer source shows the two match.',
    rejected: [
      { retailer: 'PrimeABGB', url: 'https://www.primeabgb.com/online-price-reviews-india/msi-mag-b550-tomahawk-amd-b550-motherboard/', listing: 'MSI MAG B550 TOMAHAWK AMD Motherboard', priceInr: 16438, availability: 'out-of-stock', reason: 'Out of stock' },
      { retailer: 'MD Computers', url: 'https://mdcomputers.in/product/msi-mag-b550-tomahawk-wifi-ddr4-motherboard', listing: 'MSI MAG B550 Tomahawk WIFI DDR4 ATX Motherboard', priceInr: 18700, availability: 'in-stock', reason: 'Different model (WIFI variant)' },
      { retailer: 'Vedant Computers', url: 'https://www.vedantcomputers.com/msi-mag-b550-tomahawk-wifi', listing: 'MSI MAG B550 Tomahawk Wifi Motherboard', priceInr: 18690, availability: 'in-stock', reason: 'Different model (WIFI variant)' },
    ],
  },
  {
    status: 'verified', productId: 'msi-pro-b760m-a-wifi-ddr4',
    observations: [
      seen('Vedant Computers', 'https://www.vedantcomputers.com/msi-pro-b760m-a-wifi-ddr4-motherboard', 'MSI Pro B760M-A Wifi DDR4 Motherboard', 15190, 'PRO B760M-A WIFI DDR4'),
      seen('MD Computers', 'https://mdcomputers.in/product/msi-pro-b760m-a-wifi-ddr4-motherboard', 'MSI Pro B760M-A WIFI DDR4 Motherboard', 15400, 'PRO-B760M-A-WIFI-DDR4'),
    ],
    stats: { min: 15190, median: 15295, max: 15400 },
    rejected: [
      { retailer: 'PrimeABGB', url: 'https://www.primeabgb.com/online-price-reviews-india/msi-pro-b760m-a-wifi-ddr4-proseries-motherboard/', listing: 'MSI PRO B760M-A WiFi DDR4 ProSeries Motherboard', priceInr: 14199, availability: 'out-of-stock', reason: 'Out of stock' },
    ],
  },

  // ── RAM kits ──
  {
    status: 'unverified', productId: 'corsair-cmk16gx4m2b3200c16', reason: 'not-listed',
    explanation: 'No approved retailer lists this exact 2 x 8GB kit with a price. They carry other Corsair kits, such as the single-stick CMK16GX4M1E3200C16, which is a different product.',
    rejected: [],
  },
  {
    status: 'unverified', productId: 'corsair-cmk32gx5m2b6000c30', reason: 'not-listed',
    explanation: 'No approved retailer lists this exact CL30 kit with a price. The CL36 kits they carry are different products.',
    rejected: [],
  },
  {
    status: 'verified', productId: 'corsair-cmk16gx4m1e3200c16',
    observations: [
      seen('Vedant Computers', 'https://www.vedantcomputers.com/corsair-vengeance-lpx-16gb-16gbx1-ddr4-dram-3200mhz-c16-memory-kit-black-cmk16gx4m1e3200c16', 'Corsair Vengeance LPX 16GB (16GBX1) DDR4 3200MHz C16 RAM - Black', 13300, 'CMK16GX4M1E3200C16'),
      seen('MD Computers', 'https://mdcomputers.in/product/corsair-ram-vengeance-lpx-cmk16gx4m1e3200c16', 'Corsair Vengeance LPX 16GB 3200MHz CL16 DDR4 RAM', 13399, 'CMK16GX4M1E3200C16'),
    ],
    stats: { min: 13300, median: 13349.5, max: 13399 },
    rejected: [
      { retailer: 'Computech Store', url: 'https://computechstore.in/product/corsair-vengeance-lpx-cmk16gx4m1a3200c16/', listing: 'Corsair Vengeance Lpx 16GB (16 GBx1) DDR4 3200MHz RAM', priceInr: 13299, availability: 'in-stock', reason: 'Ambiguous identity: the page SKU says CMK16GX4M1E3200C16 but its address and image names say CMK16GX4M1A3200C16' },
      { retailer: 'PrimeABGB', url: 'https://www.primeabgb.com/online-price-reviews-india/corsair-vengeance-lpx-16gb-16gbx1-3200mhz-ddr4-desktop-memory-cmk16gx4m1e3200c16/', listing: 'Corsair Vengeance LPX 16GB (16GBx1) 3200MHz DDR4 Desktop Memory CMK16GX4M1E3200C16', priceInr: 11500, availability: 'out-of-stock', reason: 'Out of stock' },
    ],
  },
  {
    status: 'verified', productId: 'corsair-cmk16gx5m1e6000z36',
    observations: [
      seen('Vedant Computers', 'https://www.vedantcomputers.com/corsair-vengeance-16gbx1-6000mhz-cmk16gx5m1e6000z36', 'Corsair Vengeance 16GB (16GBX1) DDR5 6000MHz CL36 RAM - Grey', 28589, 'CMK16GX5M1E6000Z36'),
      seen('MD Computers', 'https://mdcomputers.in/product/corsair-ram-vengeance-16gb-cmk16gx5m1e6000z36', 'Corsair Vengeance 16GB 6000MHz CL36 DDR5 RAM', 28999, 'CMK16GX5M1E6000Z36'),
      seen('PrimeABGB', 'https://www.primeabgb.com/online-price-reviews-india/corsair-vengeance-16gb-16gbx1-ddr5-6000mhz-cl36-desktp-memory-cmk16gx5m1e6000z36/', 'Corsair Vengeance 16GB (16GBX1) DDR5 6000MHz CL36 Desktp Memory CMK16GX5M1E6000Z36', 29140, 'CMK16GX5M1E6000Z36'),
    ],
    stats: { min: 28589, median: 28999, max: 29140 },
    rejected: [],
  },

  // ── Cases ──
  {
    status: 'verified', productId: 'nzxt-h5-flow-2024', variant: 'White, CC-H52FW-01',
    observations: [
      seen('Vedant Computers', 'https://www.vedantcomputers.com/nzxt-h5-flow-cc-h52fw-01', 'NZXT H5 Flow Mid Tower Cabinet - White', 7270, 'CC-H52FW-01'),
    ],
    stats: { min: 7270, median: 7270, max: 7270 },
    rejected: [
      { retailer: 'PrimeABGB', url: 'https://www.primeabgb.com/online-price-reviews-india/nzxt-h5-flow-compact-mid-tower-atx-cabinet-white-cc-h52fw-01/', listing: 'NZXT H5 Flow Compact Mid Tower ATX Cabinet White CC-H52FW-01', priceInr: 6879, availability: 'out-of-stock', reason: 'Out of stock' },
      { retailer: 'PrimeABGB', url: 'https://www.primeabgb.com/online-price-reviews-india/nzxt-h5-flow-2024-edition-e-atx-mid-tower-case-cabinet-cc-h52fb-01/', listing: 'Nzxt H5 Flow 2024 Edition E-ATX Mid Tower Case Cabinet CC-H52FB-01', priceInr: 6254, availability: 'out-of-stock', reason: 'Black variant CC-H52FB-01, a different variant; also out of stock' },
      { retailer: 'EliteHubs', url: 'https://elitehubs.com/products/nzxt-h5-flow-rgb-2024-edition-eatx-mid-tower-cabinet-white', listing: 'NZXT H5 Flow RGB 2024 Edition EATX Mid Tower Cabinet (White)', priceInr: 8648, availability: 'in-stock', reason: 'RGB variant, a different product from the H5 Flow' },
    ],
  },
  {
    status: 'unverified', productId: 'cooler-master-masterbox-q300l', reason: 'different-model',
    explanation: 'The approved retailers that sell this brand list only the Q300L V3, which is a different model. The original MasterBox Q300L has no usable priced listing at an approved retailer.',
    rejected: [
      { retailer: 'MD Computers', url: 'https://mdcomputers.in/product/cooler-master-q300l-v3-white-mini-tower-cabinet', listing: 'Cooler Master Q300L V3 White M-ATX Mini Tower Case', availability: 'in-stock', reason: 'Different model (V3)' },
      { retailer: 'Vedant Computers', url: 'https://www.vedantcomputers.com/cooler-master-q300lv3-wgnn-s00', listing: 'Cooler Master Q300L V3', availability: 'in-stock', reason: 'Different model (V3)' },
    ],
  },
  {
    status: 'unverified', productId: 'fractal-design-define-7', reason: 'out-of-stock-only',
    explanation: 'The catalogue entry is the Define 7 Black Solid (FD-C-DEF7A-01), and no current price was found for it at an approved retailer. The Dark Tint glass variant is a different product, so its price is not used.',
    rejected: [
      { retailer: 'PrimeABGB', url: 'https://www.primeabgb.com/online-price-reviews-india/fractal-design-define-7-atx-mid-tower-case-fd-c-def7a-01/', listing: 'Fractal Design Define 7 ATX Mid Tower Case FD-C-DEF7A-01', priceInr: 23490, availability: 'out-of-stock', reason: 'Out of stock' },
      { retailer: 'Computech Store', url: 'https://computechstore.in/product/fractal-design-define-7-e-atx-black/', listing: 'Fractal Design Define 7 (E-ATX) Mid Tower Cabinet Solid (Black)', priceInr: 20099, availability: 'out-of-stock', reason: 'Sold out' },
      { retailer: 'Computech Store', url: 'https://computechstore.in/product/fractal-design-define-7-dark-case/', listing: 'Fractal Design Define 7 TG Dark Tint ATX Mid Tower Case (Black)', priceInr: 22479, availability: 'in-stock', reason: 'Different variant (TG Dark Tint, FD-C-DEF7A-03)' },
    ],
  },
];
