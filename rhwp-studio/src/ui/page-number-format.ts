/**
 * Page numbering values and preview — the parts with no DOM in them, so the suite can import them
 * (node:test resolves plain node modules only; the dialog itself imports Vite-aliased paths).
 *
 * The tables are HWP's own: position is spec table 150, format is table 134, and the decoration
 * characters are three WCHARs on the `pgnp` control.
 */

/** Position values are HWP's (spec table 150); the engine renders 1-3, 7 and 9 in the header band. */
export const POSITIONS: ReadonlyArray<{ value: number; label: string }> = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Top left' },
  { value: 2, label: 'Top center' },
  { value: 3, label: 'Top right' },
  { value: 4, label: 'Bottom left' },
  { value: 5, label: 'Bottom center' },
  { value: 6, label: 'Bottom right' },
  { value: 7, label: 'Top outside' },
  { value: 8, label: 'Bottom outside' },
  { value: 9, label: 'Top inside' },
  { value: 10, label: 'Bottom inside' },
];

/** Format values are HWP's (spec table 134), matching NumberFormat::from_hwp_format in the engine. */
export const FORMATS: ReadonlyArray<{ value: number; label: string; sample: (n: number) => string }> = [
  { value: 0, label: '1, 2, 3', sample: (n) => String(n) },
  { value: 1, label: '①, ②, ③', sample: (n) => (n >= 1 && n <= 20 ? String.fromCharCode(0x2460 + n - 1) : String(n)) },
  { value: 2, label: 'I, II, III', sample: (n) => roman(n).toUpperCase() },
  { value: 3, label: 'i, ii, iii', sample: (n) => roman(n) },
  { value: 4, label: 'A, B, C', sample: (n) => latin(n).toUpperCase() },
  { value: 5, label: 'a, b, c', sample: (n) => latin(n) },
  { value: 6, label: '가, 나, 다', sample: (n) => hangulAt(n, '가나다라마바사아자차카타파하') }, // hwpword-keep-korean: HWP numbering format, shown as its own sample
  { value: 7, label: '일, 이, 삼', sample: (n) => hangulAt(n, '일이삼사오육칠팔구십') }, // hwpword-keep-korean: HWP numbering format, shown as its own sample
  { value: 8, label: '一, 二, 三', sample: (n) => hangulAt(n, '一二三四五六七八九十') }, // hwpword-keep-korean: HWP numbering format, shown as its own sample
];

/** Decoration is stored as three WCHARs; these are the combinations HWP's own dialog offers. */
export const DECORATIONS: ReadonlyArray<{ id: string; label: string; prefix: string; suffix: string; dash: string }> = [
  { id: 'plain', label: 'None', prefix: '', suffix: '', dash: '' },
  { id: 'dash', label: '- 1 -', prefix: '', suffix: '', dash: '-' },
  { id: 'paren', label: '(1)', prefix: '(', suffix: ')', dash: '' },
  { id: 'bracket', label: '[1]', prefix: '[', suffix: ']', dash: '' },
  { id: 'angle', label: '<1>', prefix: '<', suffix: '>', dash: '' },
];

function roman(n: number): string {
  const table: ReadonlyArray<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'],
    [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let rest = n;
  let out = '';
  for (const [value, numeral] of table) {
    while (rest >= value) {
      out += numeral;
      rest -= value;
    }
  }
  return out || String(n);
}

function latin(n: number): string {
  if (n < 1) return String(n);
  let rest = n;
  let out = '';
  while (rest > 0) {
    const rem = (rest - 1) % 26;
    out = String.fromCharCode(97 + rem) + out;
    rest = Math.floor((rest - 1) / 26);
  }
  return out;
}

function hangulAt(n: number, table: string): string {
  return n >= 1 && n <= table.length ? table[n - 1] : String(n);
}

/** The same composition the engine's format_page_number does, for the preview line. */
export function previewPageNumber(
  pageNumber: number,
  format: number,
  prefix: string,
  suffix: string,
  dash: string,
): string {
  const body = (FORMATS.find((f) => f.value === format) ?? FORMATS[0]).sample(pageNumber);
  if (!prefix && !suffix && !dash) return body;
  if (!dash) return `${prefix}${body}${suffix}`;
  return `${dash} ${prefix}${body}${suffix} ${dash}`;
}
