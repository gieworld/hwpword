/**
 * `HwpDocument.getTextFileUnicode()` is a JSON string literal holding the whole document text: body paragraphs
 * plus table cells and text boxes (not headers, footers or footnotes). Unlike `getPageText`, it sees table text.
 */
export function documentText(textFileJson) {
  const text = JSON.parse(textFileJson);
  if (typeof text !== 'string') throw new Error('getTextFileUnicode did not return document text');
  return text;
}

/** Document text with whitespace removed, so line-break or spacing changes after a save don't count as a text change. */
export function normalizeText(text) {
  return text.replace(/\s+/g, '');
}

export function compareRoundTrip(before, after) {
  return {
    textEqual: normalizeText(before.text) === normalizeText(after.text),
    pagesEqual: before.pages === after.pages,
    sectionsEqual: before.sections === after.sections,
  };
}

/** `DocumentExport.contentLoss()` is JSON `{ count, losses }`; null when it can't be read. */
export function lossCount(contentLossJson) {
  try {
    const report = JSON.parse(contentLossJson);
    return typeof report.count === 'number' ? report.count : null;
  } catch {
    return null;
  }
}

const cell = (value) => String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const verdict = (ok) => (ok ? 'yes' : '**NO**');

function row(r) {
  if (r.error) return `| ${cell(r.file)} | — | — | — | — | — | — | — | — | ${cell(r.error)} |`;
  const renders = r.renderErrors === 0 ? 'yes' : `**${r.renderErrors} failed**`;
  const fonts = r.missingFonts.length > 0 ? cell(r.missingFonts.join(', ')) : '—';
  return `| ${cell(r.file)} | ${r.format} | ${r.pages} | ${renders} | ${verdict(r.textEqual)} | ${verdict(r.pagesEqual)} | ${verdict(r.sectionsEqual)} | ${r.lossCount ?? '—'} | ${fonts} |  |`;
}

export function toMarkdown(results, generatedAt) {
  const problems = results.filter((r) => r.error || r.renderErrors > 0 || !r.textEqual || !r.pagesEqual || !r.sectionsEqual || (r.lossCount ?? 0) > 0).length;
  return [
    '# Corpus round-trip report',
    '',
    `Generated ${generatedAt}. ${results.length} files, ${problems} with problems.`,
    '',
    'Each file is opened, every page rendered, saved in its own format, reopened and compared.',
    '',
    '| File | Format | Pages | Renders OK | Text same after save | Pages same after save | Sections same after save | Content-loss records | Missing fonts | Error |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...results.map(row),
    '',
  ].join('\n');
}
