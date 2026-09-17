import test from 'node:test';
import assert from 'node:assert/strict';
import { toEnglishMessage } from '../src/core/engine-messages.ts';

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;

test('translates the brief example (no error code) and keeps "HWP 3.0"', () => {
  const raw = '유효하지 않은 파일: 지원하지 않는 포맷입니다: HWP 3.0. 다시 저장해주세요.'; // hwpword-keep-korean: fixture, real Rust engine text (src/error.rs / src/parser/mod.rs)
  const out = toEnglishMessage(raw);
  assert.match(out, /HWP 3\.0/);
  assert.equal(HANGUL.test(out), false);
});

test('translates the real UnsupportedFormat message and keeps the error code and version', () => {
  // Exact shape asserted by the Rust unit test in src/error.rs
  // (parse_error_to_hwp_error_uses_display_not_debug).
  const raw =
    '유효하지 않은 파일: 지원하지 않는 포맷입니다: HWP 3.0. 오류코드: UNSUPPORTED_HWP3. 다시 저장해주세요.'; // hwpword-keep-korean: fixture, real Rust engine text (src/error.rs:40, src/parser/mod.rs:275-280)
  const out = toEnglishMessage(raw);
  assert.match(out, /HWP 3\.0/);
  assert.match(out, /UNSUPPORTED_HWP3/);
  assert.equal(HANGUL.test(out), false);
});

test('translates the page-not-found message exactly', () => {
  const raw = '페이지 5을(를) 찾을 수 없습니다'; // hwpword-keep-korean: fixture, real Rust engine text (src/error.rs:41)
  assert.equal(toEnglishMessage(raw), 'Page 5 was not found');
});

test('translates the real "open a non-HWP file" message end to end', () => {
  // What `broken.hwp` (a plain text file) actually produces: FileFormat::Unknown ->
  // ParseError::UnsupportedFormat { format: "알 수 없는 파일 형식", hint: SUPPORTED_FORMATS_HINT }
  // wrapped by HwpError::InvalidFile.
  const raw =
    '유효하지 않은 파일: 지원하지 않는 포맷입니다: 알 수 없는 파일 형식. 오류코드: UNSUPPORTED_FILE_FORMAT. ' // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs:1607-1611)
    + '현재 rhwp는 HWP 5.0, HWPX, 일부 HWP 3.0, HWPML 2.9 문서를 지원합니다.'; // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs SUPPORTED_FORMATS_HINT)
  const out = toEnglishMessage(raw);
  assert.match(out, /UNSUPPORTED_FILE_FORMAT/);
  assert.match(out, /HWP 5\.0/);
  assert.equal(HANGUL.test(out), false);
});

test('an English sentence with a Korean file name passes through unchanged', () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    const samples = [
      'Could not save "연간보고서.hwp". It may be read-only or open in another program.', // hwpword-keep-korean: fixture, a Korean file name the user typed — app data, not engine text
      'Opened the recovered copy of "보고서 Recovered.hwp". The original file is not overwritten automatically.', // hwpword-keep-korean: fixture, a Korean file name — app data, not engine text
      "Error invoking remote method 'hwpword:read-file': Error: EBUSY: resource busy or locked, open 'D:\\문서\\보고서.hwp'", // hwpword-keep-korean: fixture, a Korean path inside an Electron/OS error
    ];
    for (const raw of samples) assert.equal(toEnglishMessage(raw), raw);
  } finally {
    console.warn = original;
  }
});

test('a fully Korean engine message still takes the generic path even with a Latin code', () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    // No two consecutive English words, so the "user data inside an English sentence" exception
    // must not fire: this is engine text we failed to translate.
    assert.equal(
      toEnglishMessage('렌더링 오류: 알 수 없는 렌더러 상태'), // hwpword-keep-korean: fixture, real Rust engine text shape (src/error.rs:42)
      'The document engine reported an error.',
    );
  } finally {
    console.warn = original;
  }
});

test('an unknown Korean message falls back to the generic sentence, no code', () => {
  const raw = '완전히 새로운 미지의 오류입니다'; // hwpword-keep-korean: fixture, deliberately unmapped Korean text
  assert.equal(toEnglishMessage(raw), 'The document engine reported an error.');
});

test('an unknown Korean message with an engine code keeps the code in the fallback', () => {
  const raw = '미지의 오류 (WEIRD_CODE_123)'; // hwpword-keep-korean: fixture, deliberately unmapped Korean text with a code
  assert.equal(toEnglishMessage(raw), 'The document engine reported an error. (WEIRD_CODE_123)');
});

test('an English message passes through unchanged', () => {
  assert.equal(toEnglishMessage('Something went wrong.'), 'Something went wrong.');
  assert.equal(toEnglishMessage('Network error: timeout'), 'Network error: timeout');
});

test('logs the raw text only when the fallback is used, not for a known translation', () => {
  const calls: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => { calls.push(args); };
  try {
    toEnglishMessage('페이지 5을(를) 찾을 수 없습니다'); // hwpword-keep-korean: fixture, real Rust engine text (src/error.rs:41)
    assert.deepEqual(calls, []);
    const raw = '완전히 새로운 미지의 오류입니다'; // hwpword-keep-korean: fixture, deliberately unmapped Korean text
    toEnglishMessage(raw);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], ['[engine-message]', raw]);
  } finally {
    console.warn = original;
  }
});

test('property: no real Rust engine message translates to text containing Hangul', () => {
  const original = console.warn;
  console.warn = () => {};
  try {
    const samples = [
      '유효하지 않은 파일: 지원하지 않는 포맷입니다: HWP 3.0. 오류코드: UNSUPPORTED_HWP3. 다시 저장해주세요.', // hwpword-keep-korean: fixture, real Rust engine text (src/error.rs, src/parser/mod.rs)
      '페이지 12을(를) 찾을 수 없습니다', // hwpword-keep-korean: fixture, real Rust engine text (src/error.rs:41)
      '렌더링 오류: 알 수 없는 렌더러 상태', // hwpword-keep-korean: fixture, real Rust engine text shape (src/error.rs:42)
      '필드 오류: 필드를 찾을 수 없습니다', // hwpword-keep-korean: fixture, real Rust engine text shape (src/error.rs:43)
      '유효하지 않은 파일: CFB 오류: 스트림 없음: BodyText', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs:263, src/parser/cfb_reader.rs:37)
      '유효하지 않은 파일: 헤더 오류: 지원하지 않는 HWP 버전: 7', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs:264, src/parser/header.rs:124)
      '유효하지 않은 파일: HWP 3.0 오류: 지원하지 않는 HWP 3.0 기능입니다: 표 중첩', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs:269, src/parser/hwp3/mod.rs:25)
      '유효하지 않은 파일: HWP 3.0 오류: HWP3 암호 오류: 지원하지 않는 HWP3 암호화 방식: 압축되지 않은 암호 본문', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/hwp3/mod.rs:35, src/parser/hwp3/crypto.rs:30)
      '유효하지 않은 파일: HWPX 오류: 지원하지 않는 HWPX 암호화 방식: unknown scheme', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs:268, src/parser/hwpx/mod.rs:192)
      '유효하지 않은 파일: HML 오류: 지원하지 않는 HWPML 버전입니다: 3.0', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs:270, src/parser/hml/error.rs:20)
      '유효하지 않은 파일: 암호 오류: 비밀번호가 일치하지 않거나 암호화 데이터가 손상되었습니다', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs:267, src/parser/crypto.rs:55)
      '유효하지 않은 파일: 암호 오류: 지원하지 않는 암호화 방식: EncryptVersion 9 (지원: 4)', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/crypto.rs:58-60)
      '유효하지 않은 파일: 지원하지 않는 포맷입니다: 빈 파일. 오류코드: EMPTY_FILE. 빈 파일(0 바이트)입니다.', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs EMPTY_FILE_*)
      '유효하지 않은 파일: 지원하지 않는 포맷입니다: DRM 보호 문서 (Fasoo). 오류코드: DRM_PROTECTED. DRM/보안 컨테이너로 보호된 문서입니다. 한컴오피스 등 DRM 클라이언트에서 보호를 해제한 뒤 저장해 열어주세요.', // hwpword-keep-korean: fixture, real Rust engine text (src/parser/mod.rs DRM_PROTECTED_*)
      '구역 인덱스 범위 초과', // hwpword-keep-korean: fixture, real Rust engine text (src/wasm_api.rs:1223)
      '완전히 처음 보는 오류 (SOME_NEW_CODE)', // hwpword-keep-korean: fixture, deliberately unmapped Korean text with a code
    ];
    for (const raw of samples) {
      const out = toEnglishMessage(raw);
      assert.equal(HANGUL.test(out), false, `translated "${raw}" still contains Hangul: "${out}"`);
    }
  } finally {
    console.warn = original;
  }
});
