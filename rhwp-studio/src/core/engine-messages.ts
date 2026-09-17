/**
 * Translates Korean text produced by the Rust/WASM document engine (`src/error.rs`,
 * `src/parser/**`, `src/wasm_api.rs`) into English before it reaches any visible sink
 * (toast, alert, status bar, dialog). See `.superpowers/sdd/2026-09-17-hwpword-pure-english/
 * task-3-report.md` for the source inventory this table was built from.
 *
 * No `@/` imports here on purpose: `node --test` loads this file directly (see
 * tests/hwpword-engine-messages.test.ts), and the alias only resolves under the vite/tsc build.
 */

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/; // hwpword-keep-korean: Unicode range boundaries for Hangul detection, not translated text

/** A Rust engine error code such as `UNSUPPORTED_HWP3`, kept verbatim when we fall back. */
const CODE_TOKEN = /[A-Z][A-Z0-9_]{2,}/;

type Rule = readonly [RegExp, string];

/**
 * Ordered [pattern, replacement] pairs, applied in sequence. Each pattern is Korean *engine*
 * text copied from the Rust source (data to match against, not translated UI copy), so every
 * line below carries the hwpword-keep-korean marker the source guard requires.
 *
 * Order matters in two ways: (1) a phrase that is a substring of a longer phrase must come
 * after the longer one, and (2) a `format`/`hint` value substituted into a wrapping sentence
 * (e.g. "지원하지 않는 포맷입니다: {format}. …") must be translated before the rule that
 * assembles that sentence, so the assembled English sentence doesn't re-embed leftover Korean.
 */
const TRANSLATIONS: readonly Rule[] = [
  // --- src/error.rs HwpError::Display ---
  [/유효하지 않은 파일: /g, 'Invalid file: '], // hwpword-keep-korean: Rust engine text, src/error.rs:40
  [/페이지 (\d+)을\(를\) 찾을 수 없습니다/g, 'Page $1 was not found'], // hwpword-keep-korean: Rust engine text, src/error.rs:41
  [/렌더링 오류: /g, 'Rendering error: '], // hwpword-keep-korean: Rust engine text, src/error.rs:42
  [/필드 오류: /g, 'Field error: '], // hwpword-keep-korean: Rust engine text, src/error.rs:43

  // --- src/parser/mod.rs: UnsupportedFormat `format`/`hint` values, translated before the
  // sentence-assembly rules further below so the assembled sentence stays English. ---
  [/빈 파일\(0 바이트\)입니다\.?/g, 'The file is empty (0 bytes).'], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs EMPTY_FILE_HINT
  [/빈 파일/g, 'an empty file'], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs EMPTY_FILE format value
  [/알 수 없는 파일 형식/g, 'an unrecognized file format'], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs Unknown format value
  [/DRM 보호 문서/g, 'DRM-protected document'], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs drm_format_name()
  [/DRM\/보안 컨테이너로 보호된 문서입니다\. 한컴오피스 등 DRM 클라이언트에서 보호를 해제한 뒤 저장해 열어주세요\.?/g, // hwpword-keep-korean: Rust engine text, src/parser/mod.rs DRM_PROTECTED_HINT
    'This document is protected by a DRM/security container. Remove the protection in a DRM client such as Hancom Office, then save and reopen it.'],
  [/현재 rhwp는 HWP 5\.0, HWPX, 일부 HWP 3\.0, HWPML 2\.9 문서를 지원합니다\.?/g, // hwpword-keep-korean: Rust engine text, src/parser/mod.rs SUPPORTED_FORMATS_HINT
    'rhwp currently supports HWP 5.0, HWPX, some HWP 3.0, and HWPML 2.9 documents.'],

  // --- src/parser/mod.rs ParseError::UnsupportedFormat sentence assembly ---
  [/지원하지 않는 포맷입니다: (.+?)\. 오류코드: ([A-Z][A-Z0-9_]+)\.\s*/g, 'Unsupported format: $1 (code: $2). '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs:275-280 (with code)
  [/지원하지 않는 포맷입니다: (.+?)\.(?:\s+|$)/g, 'Unsupported format: $1. '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs (no code)
  [/다시 저장해주세요\.?/g, 'Please save the document again in a supported format.'], // hwpword-keep-korean: Rust engine hint text, src/error.rs test fixture / src/parser hints

  // --- src/parser/mod.rs ParseError::Display prefixes (order: HWP3-specific before generic
  // "암호 오류" so "HWP3 encryption error:" reads cleanly rather than "HWP3 Encryption error:") ---
  [/CFB 오류: /g, 'CFB error: '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs:263
  [/헤더 오류: /g, 'Header error: '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs:264
  [/DocInfo 오류: /g, 'DocInfo error: '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs:265
  [/BodyText 오류: /g, 'BodyText error: '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs:266
  [/HWP3 암호 오류: /g, 'HWP3 encryption error: '], // hwpword-keep-korean: Rust engine text, src/parser/hwp3/mod.rs CryptoError variant
  [/암호 오류: /g, 'Encryption error: '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs:267
  [/HWPX 오류: /g, 'HWPX error: '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs:268
  [/HWP 3\.0 오류: /g, 'HWP 3.0 error: '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs:269
  [/HML 오류: /g, 'HML error: '], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs:270
  [/비밀번호가 필요한 암호 문서(?:입니다)?(?:\s*\([^)]*\))?\.?/g, 'This document requires a password.'], // hwpword-keep-korean: Rust engine text, src/parser/mod.rs EncryptedDocument / src/parser/hwp3/mod.rs PasswordRequired

  // --- src/parser/header.rs HeaderError::Display ---
  [/HWP 시그니처가 일치하지 않습니다/g, 'The HWP signature does not match.'], // hwpword-keep-korean: Rust engine text, src/parser/header.rs:123
  [/지원하지 않는 HWP 버전: /g, 'Unsupported HWP version: '], // hwpword-keep-korean: Rust engine text, src/parser/header.rs:124
  [/FileHeader 읽기 오류: /g, 'FileHeader read error: '], // hwpword-keep-korean: Rust engine text, src/parser/header.rs:125

  // --- src/parser/hml/error.rs and warnings.rs ---
  [/지원하지 않는 HML 문자 인코딩입니다/g, 'Unsupported HML character encoding.'], // hwpword-keep-korean: Rust engine text, src/parser/hml/error.rs:16
  [/잘못된 HML XML입니다: /g, 'Invalid HML XML: '], // hwpword-keep-korean: Rust engine text, src/parser/hml/error.rs:17
  [/HML 문서가 아닙니다/g, 'This is not an HML document.'], // hwpword-keep-korean: Rust engine text, src/parser/hml/error.rs:18
  [/지원하지 않는 HWPML 버전입니다: /g, 'Unsupported HWPML version: '], // hwpword-keep-korean: Rust engine text, src/parser/hml/error.rs:20
  [/HML HEAD 요소가 없습니다/g, 'Missing HML HEAD element.'], // hwpword-keep-korean: Rust engine text, src/parser/hml/error.rs:22
  [/HML BODY 요소가 없습니다/g, 'Missing HML BODY element.'], // hwpword-keep-korean: Rust engine text, src/parser/hml/error.rs:23
  [/잘못된 HML 참조입니다: /g, 'Invalid HML reference: '], // hwpword-keep-korean: Rust engine text, src/parser/hml/error.rs:24
  [/HML XML 제한을 초과했습니다: /g, 'HML XML limit exceeded: '], // hwpword-keep-korean: Rust engine text, src/parser/hml/error.rs:25
  [/지원하지 않는 HML 요소를 건너뛰었습니다: /g, 'Skipped unsupported HML element: '], // hwpword-keep-korean: Rust engine text, src/parser/hml/warnings.rs:27
  [/지원하지 않는 HML 속성을 건너뛰었습니다: /g, 'Skipped unsupported HML attribute: '], // hwpword-keep-korean: Rust engine text, src/parser/hml/warnings.rs:36

  // --- src/parser/hwp3/mod.rs Hwp3Error (snafu display) ---
  [/파일 크기가 너무 작습니다\.?/g, 'The file is too small.'], // hwpword-keep-korean: Rust engine text, src/parser/hwp3/mod.rs:23
  [/지원하지 않는 HWP 3\.0 기능입니다: /g, 'Unsupported HWP 3.0 feature: '], // hwpword-keep-korean: Rust engine text, src/parser/hwp3/mod.rs:25
  [/잘못된 파일 시그니처입니다\.?/g, 'Invalid file signature.'], // hwpword-keep-korean: Rust engine text, src/parser/hwp3/mod.rs:27
  [/입출력 오류가 발생했습니다: /g, 'I/O error: '], // hwpword-keep-korean: Rust engine text, src/parser/hwp3/mod.rs:29
  [/파싱 오류가 발생했습니다: /g, 'Parse error: '], // hwpword-keep-korean: Rust engine text, src/parser/hwp3/mod.rs:31
  [/특수 문자 파싱 오류가 발생했습니다: /g, 'Special character parsing error: '], // hwpword-keep-korean: Rust engine text, src/parser/hwp3/mod.rs:37

  // --- src/parser/hwp3/crypto.rs ---
  [/지원하지 않는 HWP3 암호화 방식: 압축되지 않은 암호 본문/g, 'Unsupported HWP3 encryption method: uncompressed encrypted body.'], // hwpword-keep-korean: Rust engine text, src/parser/hwp3/crypto.rs:30

  // --- src/parser/hwpx/mod.rs HwpxError::Display ---
  [/ZIP 오류: /g, 'ZIP error: '], // hwpword-keep-korean: Rust engine text, src/parser/hwpx/mod.rs:186
  [/XML 파싱 오류: /g, 'XML parsing error: '], // hwpword-keep-korean: Rust engine text, src/parser/hwpx/mod.rs:187
  [/필수 파일 누락: /g, 'Missing required file: '], // hwpword-keep-korean: Rust engine text, src/parser/hwpx/mod.rs:188
  [/변환 오류: /g, 'Conversion error: '], // hwpword-keep-korean: Rust engine text, src/parser/hwpx/mod.rs:189
  [/암호화된 문서: /g, 'Encrypted document: '], // hwpword-keep-korean: Rust engine text, src/parser/hwpx/mod.rs:190
  [/지원하지 않는 HWPX 암호화 방식: /g, 'Unsupported HWPX encryption method: '], // hwpword-keep-korean: Rust engine text, src/parser/hwpx/mod.rs:192

  // --- src/parser/cfb_reader.rs CfbError::Display ---
  [/CFB 열기 실패: /g, 'Failed to open the CFB container: '], // hwpword-keep-korean: Rust engine text, src/parser/cfb_reader.rs:35
  [/스트림 읽기 실패: /g, 'Failed to read the stream: '], // hwpword-keep-korean: Rust engine text, src/parser/cfb_reader.rs:36
  [/스트림 없음: /g, 'Stream not found: '], // hwpword-keep-korean: Rust engine text, src/parser/cfb_reader.rs:37
  [/스트림이 (\d+) 바이트 상한을 초과했습니다/g, 'Stream exceeded the $1-byte limit.'], // hwpword-keep-korean: Rust engine text, src/parser/cfb_reader.rs:40

  // --- src/parser/crypto.rs CryptoError::Display (HWP5 password / distribution stream) ---
  [/DISTRIBUTE_DOC_DATA 레코드 없음/g, 'Missing DISTRIBUTE_DOC_DATA record.'], // hwpword-keep-korean: Rust engine text, src/parser/crypto.rs:42
  [/DISTRIBUTE_DOC_DATA 크기 오류: (\d+)바이트 \(필요: (\d+)\)/g, 'DISTRIBUTE_DOC_DATA size error: $1 bytes (expected: $2).'], // hwpword-keep-korean: Rust engine text, src/parser/crypto.rs:44
  [/AES 키 추출 실패: /g, 'AES key extraction failed: '], // hwpword-keep-korean: Rust engine text, src/parser/crypto.rs:46
  [/복호화 실패: /g, 'Decryption failed: '], // hwpword-keep-korean: Rust engine text, src/parser/crypto.rs:47
  [/레코드 파싱 실패: /g, 'Record parsing failed: '], // hwpword-keep-korean: Rust engine text, src/parser/crypto.rs:48
  [/압축 해제 실패: /g, 'Decompression failed: '], // hwpword-keep-korean: Rust engine text, src/parser/crypto.rs:49 and src/parser/cfb_reader.rs:38
  [/암호화 스트림의 압축 해제 결과가 (\d+) 바이트 상한을 초과했습니다/g, 'Decompressed encrypted stream exceeded the $1-byte limit.'], // hwpword-keep-korean: Rust engine text, src/parser/crypto.rs:50-53
  [/비밀번호가 일치하지 않거나 암호화 데이터가 손상되었습니다/g, 'The password is incorrect, or the encrypted data is corrupted.'], // hwpword-keep-korean: Rust engine text, src/parser/crypto.rs:55; matches PASSWORD_REJECTED_MESSAGE in src/main.ts
  [/지원하지 않는 암호화 방식: EncryptVersion (\d+) \(지원: ([^)]+)\)/g, 'Unsupported encryption method: EncryptVersion $1 (supported: $2).'], // hwpword-keep-korean: Rust engine text, src/parser/crypto.rs:58-60

  // --- src/wasm_api.rs JsValue::from_str (order: specific index kinds before the generic one) ---
  [/이 내보내기 결과의 바이트를 이미 가져갔습니다/g, 'The bytes for this export result have already been taken.'], // hwpword-keep-korean: Rust engine text, src/wasm_api.rs:416
  [/구역 인덱스 범위 초과/g, 'Section index out of range.'], // hwpword-keep-korean: Rust engine text, src/wasm_api.rs:1223,2807
  [/문단 인덱스 범위 초과/g, 'Paragraph index out of range.'], // hwpword-keep-korean: Rust engine text, src/wasm_api.rs:2810
  [/셀 인덱스 범위 초과/g, 'Cell index out of range.'], // hwpword-keep-korean: Rust engine text, src/wasm_api.rs:2816
  [/인덱스 범위 초과/g, 'Index out of range.'], // hwpword-keep-korean: Rust engine text, src/wasm_api.rs:1330,1353,1372,1393
  [/행 인덱스 (\d+) 가 최대치\((\d+)\)를 넘습니다/g, 'Row index $1 exceeds the maximum ($2).'], // hwpword-keep-korean: Rust engine text, src/wasm_api.rs:58
];

/**
 * Translates a raw engine message into English. English input passes through unchanged.
 * If Korean text remains after applying the table (an unrecognized engine message), returns
 * a generic English sentence — with the engine's error code appended in parentheses when one
 * is present — and logs the original for diagnosis.
 */
export function toEnglishMessage(raw: string): string {
  if (!HANGUL.test(raw)) return raw;

  let text = raw;
  for (const [pattern, replacement] of TRANSLATIONS) {
    text = text.replace(pattern, replacement);
  }
  if (!HANGUL.test(text)) return text;

  console.warn('[engine-message]', raw);
  const code = raw.match(CODE_TOKEN);
  return code ? `The document engine reported an error. (${code[0]})` : 'The document engine reported an error.';
}
