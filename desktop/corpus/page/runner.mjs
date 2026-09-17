import init, { HwpDocument } from '/core/rhwp.js';
import { compareRoundTrip, documentText, lossCount } from '/lib/report.mjs';

const ready = init();

function snapshot(doc) {
  const pages = doc.pageCount();
  let renderErrors = 0;
  for (let i = 0; i < pages; i += 1) {
    try {
      doc.renderPageSvg(i);
    } catch {
      renderErrors += 1;
    }
  }
  return { pages, sections: doc.getSectionCount(), text: documentText(doc.getTextFileUnicode()), renderErrors };
}

/** Installed if text measured with the font differs from a generic fallback (same resolution rhwp's canvas uses). */
function isFontInstalled(name) {
  const ctx = document.createElement('canvas').getContext('2d');
  const sample = '한글 HWP 가나다라 0123';
  return ['monospace', 'serif'].some((generic) => {
    ctx.font = `32px ${generic}`;
    const fallback = ctx.measureText(sample).width;
    ctx.font = `32px "${name}", ${generic}`;
    return ctx.measureText(sample).width !== fallback;
  });
}

async function checkFile(name) {
  const result = { file: name };
  let stage = 'read';
  let doc;
  try {
    const response = await fetch(`/files/${encodeURIComponent(name)}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());

    stage = 'open';
    doc = new HwpDocument(bytes);
    result.format = doc.getSourceFormat();
    const info = JSON.parse(doc.getDocumentInfo());
    result.missingFonts = (info.fontsUsed ?? []).filter((font) => !isFontInstalled(font));

    stage = 'render';
    const before = snapshot(doc);
    result.pages = before.pages;
    result.renderErrors = before.renderErrors;

    stage = 'save';
    const exported = result.format === 'hwpx' ? doc.exportHwpxWithReport() : doc.exportHwpWithReport();
    let saved;
    try {
      result.lossCount = lossCount(exported.contentLoss());
      saved = exported.takeBytes();
    } finally {
      exported.free();
    }

    stage = 'reopen';
    const reopened = new HwpDocument(saved);
    try {
      Object.assign(result, compareRoundTrip(before, snapshot(reopened)));
    } finally {
      reopened.free();
    }
  } catch (error) {
    result.error = `${stage}: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    doc?.free();
  }
  return result;
}

window.runCorpus = async (names) => {
  await ready;
  const results = [];
  for (const name of names) {
    results.push(await checkFile(name));
    console.log(`[corpus] ${results.length}/${names.length} ${name}`);
  }
  return results;
};
