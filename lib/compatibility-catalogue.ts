// Hardware catalogue for the rule-based compatibility checker.
// Data only: no logic lives here. It is deliberately separate from the generic teaching parts in components-data.ts.
//
// Data policy:
// - 'manufacturer' sources were read on the recorded date from an official manufacturer page or document.
// - 'demo' entries are illustrative, are not manufacturer-verified, and must be shown as demo data.
// - A specification that could not be confirmed is left undefined (never guessed), so the checker reports UNVERIFIED.

export type Socket = 'AM4' | 'AM5' | 'LGA1700';
export type MemoryType = 'DDR4' | 'DDR5';
export type FormFactor = 'E-ATX' | 'ATX' | 'Micro-ATX' | 'Mini-ITX';

export type Source =
  | { kind: 'manufacturer'; url: string; checked: string; note?: string } // checked = ISO date the source was read
  | { kind: 'demo'; note: string };

type Base = { id: string; brand: string; model: string; sources: Source[] };
export type Cpu = Base & { socket?: Socket };
// widthMm: board dimension from the rear I/O edge towards the front of the case (the second number of a vendor's "30.5 cm x 24.4 cm" pair).
export type Motherboard = Base & { socket?: Socket; memoryType?: MemoryType; formFactor?: FormFactor; widthMm?: number };
export type RamKit = Base & { memoryType?: MemoryType };
// maxBoardWidthMm: only widths the manufacturer documents, keyed by form factor, e.g. { 'E-ATX': 277 }.
export type PcCase = Base & { supportedFormFactors?: FormFactor[]; maxBoardWidthMm?: Partial<Record<FormFactor, number>> };

const CHECKED = '2026-10-28';

export const CPUS: Cpu[] = [
  {
    id: 'amd-ryzen-5-7600', brand: 'AMD', model: 'Ryzen™ 5 7600', socket: 'AM5',
    sources: [{ kind: 'manufacturer', url: 'https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html', checked: CHECKED, note: 'CPU Socket: AM5' }],
  },
  {
    id: 'amd-ryzen-5-5600x', brand: 'AMD', model: 'Ryzen™ 5 5600X', socket: 'AM4',
    sources: [{ kind: 'manufacturer', url: 'https://www.amd.com/en/products/processors/desktops/ryzen/5000-series/amd-ryzen-5-5600x.html', checked: CHECKED, note: 'CPU Socket: AM4' }],
  },
  {
    id: 'intel-core-i5-13400f', brand: 'Intel', model: 'Core™ i5-13400F', socket: 'LGA1700',
    sources: [{ kind: 'manufacturer', url: 'https://www.intel.com/content/www/us/en/products/sku/230501/intel-core-i513400f-processor-20m-cache-up-to-4-60-ghz/specifications.html', checked: CHECKED, note: 'Sockets Supported: FCLGA1700 (flip-chip package of LGA1700), entered as LGA1700. Read through a page-fetch tool; Intel returns 403 to plain HTTP requests.' }],
  },
];

export const MOTHERBOARDS: Motherboard[] = [
  {
    id: 'asus-rog-strix-b650-a-gaming-wifi', brand: 'ASUS', model: 'ROG STRIX B650-A GAMING WIFI',
    socket: 'AM5', memoryType: 'DDR5', formFactor: 'ATX', widthMm: 244,
    sources: [{ kind: 'manufacturer', url: 'https://rog.asus.com/motherboards/rog-strix/rog-strix-b650-a-gaming-wifi-model/spec/', checked: CHECKED, note: 'AM5 Socket; DDR5; ATX Form Factor, 12 inch x 9.6 inch (30.5 cm x 24.4 cm) → widthMm 244' }],
  },
  {
    id: 'asus-rog-strix-b650e-i-gaming-wifi', brand: 'ASUS', model: 'ROG STRIX B650E-I GAMING WIFI',
    socket: 'AM5', memoryType: 'DDR5', formFactor: 'Mini-ITX', widthMm: 170,
    sources: [{ kind: 'manufacturer', url: 'https://rog.asus.com/motherboards/rog-strix/rog-strix-b650e-i-gaming-wifi-model/spec/', checked: CHECKED, note: 'AMD Socket AM5; DDR5; Mini-ITX Form Factor, 6.7 inch x 6.7 inch (17 cm x 17 cm) → widthMm 170' }],
  },
  {
    id: 'asus-rog-maximus-z790-extreme', brand: 'ASUS', model: 'ROG MAXIMUS Z790 EXTREME',
    socket: 'LGA1700', memoryType: 'DDR5', formFactor: 'E-ATX', widthMm: 277,
    sources: [{ kind: 'manufacturer', url: 'https://rog.asus.com/motherboards/rog-maximus/rog-maximus-z790-extreme-model/spec/', checked: CHECKED, note: 'Socket LGA1700; DDR5; E-ATX Form Factor, 12 inch x 10.9 inch (30.5 cm x 27.7 cm) → widthMm 277' }],
  },
  {
    id: 'msi-mag-b550-tomahawk', brand: 'MSI', model: 'MAG B550 TOMAHAWK',
    socket: 'AM4', memoryType: 'DDR4', formFactor: 'ATX', widthMm: 244,
    sources: [
      { kind: 'manufacturer', url: 'https://download-2.msi.com/archive/mnu_exe/mb/MAGB550TOMAHAWK.pdf', checked: CHECKED, note: 'User guide: AM4 socket; 4x DDR4 memory slots; ATX Form Factor, 12 in. x 9.6 in. (30.5 cm x 24.4 cm) → widthMm 244' },
      { kind: 'manufacturer', url: 'https://storage-asset.msi.com/datasheet/mb/global/MAG-B550-TOMAHAWK.pdf', checked: CHECKED, note: 'Datasheet: CPU Socket AMD Socket AM4; DDR4. The datasheet does not state a form factor.' },
    ],
  },
  {
    id: 'msi-pro-b760m-a-wifi-ddr4', brand: 'MSI', model: 'PRO B760M-A WIFI DDR4',
    socket: 'LGA1700', memoryType: 'DDR4', formFactor: 'Micro-ATX', widthMm: 244,
    sources: [
      { kind: 'manufacturer', url: 'https://download-2.msi.com/archive/mnu_exe/mb/PROB760M-AWIFIDDR4.pdf', checked: CHECKED, note: 'User guide (DDR4 variant): LGA1700; 4x DDR4 memory slots; Micro-ATX Form Factor, 9.6 in. x 9.6 in. (244 mm x 244 mm)' },
      { kind: 'manufacturer', url: 'https://storage-asset.msi.com/datasheet/mb/global/PRO-B760M-A-WIFI-DDR4.pdf', checked: CHECKED, note: 'Datasheet: CPU Socket LGA 1700; DDR4. The datasheet does not state a form factor.' },
    ],
  },
  {
    // Demo data: socket is deliberately missing so rule 1 reports UNVERIFIED.
    id: 'demo-motherboard-no-socket', brand: 'Demo', model: 'Demo motherboard (socket not listed)',
    memoryType: 'DDR5', formFactor: 'ATX', widthMm: 244,
    sources: [{ kind: 'demo', note: 'Illustrative demo data, not manufacturer-verified. The socket is intentionally not listed.' }],
  },
];

export const RAM_KITS: RamKit[] = [
  {
    id: 'corsair-cmk16gx4m2b3200c16', brand: 'Corsair', model: 'VENGEANCE® LPX 16GB (2 x 8GB) DDR4 DRAM 3200MHz C16 Memory Kit - Black (CMK16GX4M2B3200C16)', memoryType: 'DDR4',
    sources: [{ kind: 'manufacturer', url: 'https://www.corsair.com/us/en/p/memory/cmk16gx4m2b3200c16/vengeancea-lpx-16gb-2-x-8gb-ddr4-dram-3200mhz-c16-memory-kit-black-cmk16gx4m2b3200c16', checked: CHECKED, note: 'Memory Type: DDR4' }],
  },
  {
    id: 'corsair-cmk32gx5m2b6000c30', brand: 'Corsair', model: 'VENGEANCE® 32GB (2x16GB) DDR5 DRAM Up To 6000MT/s CL30 Memory Kit — Black (CMK32GX5M2B6000C30)', memoryType: 'DDR5',
    sources: [{ kind: 'manufacturer', url: 'https://www.corsair.com/us/en/p/memory/cmk32gx5m2b6000c30/vengeance-32gb-2x16gb-ddr5-dram-6000mt-s-c30-memory-kit-black-cmk32gx5m2b6000c30', checked: CHECKED, note: 'Memory Type: DDR5' }],
  },
];

export const CASES: PcCase[] = [
  {
    id: 'nzxt-h5-flow-2024', brand: 'NZXT', model: 'H5 Flow (2024)',
    supportedFormFactors: ['E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX'], maxBoardWidthMm: { 'E-ATX': 277 },
    sources: [
      { kind: 'manufacturer', url: 'https://support.nzxt.com/hc/en-us/articles/40225168535451-H5-Flow-2024-Specs', checked: CHECKED, note: 'Motherboard Compatibility: E-ATX (Up to 277 mm wide), ATX, Micro-ATX, Mini-ITX. NZXT\'s older H5 Flow manual lists only ATX, Micro-ATX and Mini-ITX with different case dimensions, so the revision matters.' },
      { kind: 'manufacturer', url: 'https://nzxt.com/products/h5-flow', checked: CHECKED, note: 'Motherboard Support: E-ATX (Up to 277 mm), ATX, Micro-ATX, Mini-ITX' },
    ],
  },
  {
    // maxBoardWidthMm is undefined: the manufacturer states no width limit.
    id: 'cooler-master-masterbox-q300l', brand: 'Cooler Master', model: 'MasterBox Q300L Mini Tower PC Case',
    supportedFormFactors: ['Mini-ITX', 'Micro-ATX'],
    sources: [{ kind: 'manufacturer', url: 'https://www.coolermaster.com/en-global/products/masterbox-q300l.html', checked: CHECKED, note: 'Motherboard Support: Mini-ITX, Micro-ATX. No maximum board width is stated.' }],
  },
  {
    id: 'fractal-design-define-7', brand: 'Fractal Design', model: 'Define 7',
    supportedFormFactors: ['E-ATX', 'ATX', 'Micro-ATX', 'Mini-ITX'], maxBoardWidthMm: { 'E-ATX': 285 },
    sources: [
      { kind: 'manufacturer', url: 'https://www.fractal-design.com/products/cases/define/define-7/', checked: CHECKED, note: 'Motherboard compatibility: E-ATX, ATX, Micro ATX, Mini ITX (Define 7 Black product page)' },
      { kind: 'manufacturer', url: 'https://support.fractal-design.com/support/solutions/articles/4000158697-define-7-meshify-2-fitment-of-an-eatx-motherboard', checked: CHECKED, note: 'The Define 7 and Meshify 2 can support EATX motherboards up to 285mm wide. Boards wider than a standard ATX board (244mm) block part of the cable routing grommets.' },
    ],
  },
  {
    // Demo data: E-ATX is listed with no documented maximum width, so rule 3 reports UNVERIFIED for an E-ATX board.
    id: 'demo-case-no-width-limit', brand: 'Demo', model: 'Demo case (E-ATX listed, maximum width not stated)',
    supportedFormFactors: ['E-ATX', 'ATX'],
    sources: [{ kind: 'demo', note: 'Illustrative demo data, not manufacturer-verified. The maximum E-ATX board width is intentionally not stated.' }],
  },
];
