/**
 * English display names for Korean font and style names. Only visible text changes; documents keep their real
 * names. Known names come from the tables below; anything else is romanized (Revised Romanization letters, no
 * sound-change rules).
 */
const HANGUL = /[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF]/;
const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const FINALS = ['', 'k', 'k', 'k', 'n', 'n', 'n', 't', 'l', 'k', 'm', 'l', 'l', 'l', 'p', 'l', 'm', 'p', 'p', 't', 't', 'ng', 't', 't', 'k', 't', 'p', 't'];
const JAMO: Record<string, string> = {
  'ㄱ': 'g', 'ㄲ': 'kk', 'ㄳ': 'ks', 'ㄴ': 'n', 'ㄵ': 'nj', 'ㄶ': 'nh', 'ㄷ': 'd', 'ㄸ': 'tt', // hwpword-keep-korean: jamo table data
  'ㄹ': 'r', 'ㄺ': 'lg', 'ㄻ': 'lm', 'ㄼ': 'lb', 'ㄽ': 'ls', 'ㄾ': 'lt', 'ㄿ': 'lp', 'ㅀ': 'lh', // hwpword-keep-korean: jamo table data
  'ㅁ': 'm', 'ㅂ': 'b', 'ㅃ': 'pp', 'ㅄ': 'bs', 'ㅅ': 's', 'ㅆ': 'ss', 'ㅇ': 'ng', 'ㅈ': 'j', // hwpword-keep-korean: jamo table data
  'ㅉ': 'jj', 'ㅊ': 'ch', 'ㅋ': 'k', 'ㅌ': 't', 'ㅍ': 'p', 'ㅎ': 'h', 'ㅏ': 'a', 'ㅐ': 'ae', // hwpword-keep-korean: jamo table data
  'ㅑ': 'ya', 'ㅒ': 'yae', 'ㅓ': 'eo', 'ㅔ': 'e', 'ㅕ': 'yeo', 'ㅖ': 'ye', 'ㅗ': 'o', 'ㅘ': 'wa', // hwpword-keep-korean: jamo table data
  'ㅙ': 'wae', 'ㅚ': 'oe', 'ㅛ': 'yo', 'ㅜ': 'u', 'ㅝ': 'wo', 'ㅞ': 'we', 'ㅟ': 'wi', 'ㅠ': 'yu', // hwpword-keep-korean: jamo table data
  'ㅡ': 'eu', 'ㅢ': 'ui', 'ㅣ': 'i', // hwpword-keep-korean: jamo table data
};

export function romanizeHangul(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0xac00 && code <= 0xd7a3) {
      const index = code - 0xac00;
      out += INITIALS[Math.floor(index / 588)] + MEDIALS[Math.floor(index / 28) % 21] + FINALS[index % 28];
    } else if (HANGUL.test(ch)) {
      out += JAMO[ch] ?? '';
    } else {
      out += ch;
    }
  }
  return out;
}

/** Romanizes each whitespace-separated word that contains Hangul and capitalizes it. */
export function romanizeName(name: string): string {
  return name
    .split(/(\s+)/)
    .map((word) => {
      if (!HANGUL.test(word)) return word;
      const latin = romanizeHangul(word);
      return latin.charAt(0).toUpperCase() + latin.slice(1);
    })
    .join('');
}

// Null-prototype tables: a document may name a font or style `constructor`, and a plain object
// literal would answer that lookup with a function.
const FONT_NAMES: Record<string, string> = Object.assign(Object.create(null), {
  '함초롬바탕': 'HCR Batang', '함초롬돋움': 'HCR Dotum', '한컴바탕': 'Hancom Batang', '한컴돋움': 'Hancom Dotum', // hwpword-keep-korean: font name data
  '맑은 고딕': 'Malgun Gothic', '나눔고딕': 'NanumGothic', '나눔명조': 'NanumMyeongjo', '나눔바른고딕': 'NanumBarunGothic', // hwpword-keep-korean: font name data
  '나눔스퀘어': 'NanumSquare', '바탕': 'Batang', '바탕체': 'BatangChe', '돋움': 'Dotum', '돋움체': 'DotumChe', '굴림': 'Gulim', // hwpword-keep-korean: font name data
  '굴림체': 'GulimChe', '궁서': 'Gungsuh', '궁서체': 'GungsuhChe', '새굴림': 'New Gulim', '휴먼명조': 'Human Myeongjo', // hwpword-keep-korean: font name data
  '휴먼고딕': 'Human Gothic', '신명조': 'Shin Myeongjo', '중고딕': 'Jung Gothic', '견고딕': 'Gyeon Gothic', // hwpword-keep-korean: font name data
  '한양신명조': 'Hanyang Shin Myeongjo', '한양중고딕': 'Hanyang Jung Gothic', 'HY헤드라인M': 'HY HeadLine M', // hwpword-keep-korean: font name data
  'HY견고딕': 'HY Gyeon Gothic', 'HY신명조': 'HY Shin Myeongjo', 'HY그래픽': 'HY Graphic', '본고딕': 'Source Han Sans', // hwpword-keep-korean: font name data
  '본명조': 'Source Han Serif', '노토 산스 KR': 'Noto Sans KR', '고운바탕': 'Gowun Batang', '고운돋움': 'Gowun Dodum', // hwpword-keep-korean: font name data
});

const STYLE_NAMES: Record<string, string> = Object.assign(Object.create(null), {
  '바탕글': 'Normal', '본문': 'Body', '쪽 번호': 'Page Number', '머리말': 'Header', '꼬리말': 'Footer', '각주': 'Footnote', // hwpword-keep-korean: style name data
  '미주': 'Endnote', '메모': 'Memo', '차례 제목': 'TOC Heading', '캡션': 'Caption', '개요': 'Outline', // hwpword-keep-korean: style name data
});

// A decomposed (NFD) name is Hangul jamo, which neither the tables nor the syllable romanizer
// recognize — composing first makes both work.
export function fontDisplayName(rawName: string): string {
  const name = rawName.normalize('NFC');
  return FONT_NAMES[name] ?? (HANGUL.test(name) ? romanizeName(name) : name);
}

export function styleDisplayName(rawName: string): string {
  const name = rawName.normalize('NFC');
  const numbered = /^(개요|차례)\s*(\d+)$/.exec(name); // hwpword-keep-korean: matches the built-in outline/TOC style name prefixes
  if (numbered) return `${numbered[1] === '개요' ? 'Outline' : 'TOC'} ${numbered[2]}`; // hwpword-keep-korean: outline style name literal
  return STYLE_NAMES[name] ?? (HANGUL.test(name) ? romanizeName(name) : name);
}
