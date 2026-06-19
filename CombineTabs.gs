/**
 * ============================================================================
 *  Combine Google Docs Tabs  —  Google Apps Script
 * ============================================================================
 *
 *  Google Docs lets you organize a document into tabs (and nested subtabs),
 *  but printing or exporting only acts on one tab at a time. This script
 *  assembles every tab into a single "target" tab — one continuous flow you
 *  can print or export to PDF as a finished manuscript/book.
 *
 *  WHAT IT DOES
 *    • Walks all tabs in order (parents before children) and copies each
 *      tab's content into one target tab.
 *    • Inserts the tab's title as a heading before its content. Heading level
 *      follows nesting depth: top-level tabs = Heading 2, subtabs = Heading 3,
 *      deeper = Heading 4/5/6 (capped at 6).
 *    • Preserves paragraph styles, headings, lists, tables, inline images,
 *      character formatting (bold/italic/underline/strikethrough/links/font/
 *      size), and footnotes (anchor position + contents).
 *    • Optionally copies the first content tab's header/footer to the target.
 *    • Lets you mark tabs with emoji icons to either EXCLUDE them or turn them
 *      into a PAGE BREAK (see the CONFIG section below).
 *    • Trims trailing blank lines from each tab so spacing between sections is
 *      uniform regardless of how each tab ends.
 *    • Clears and rebuilds the target tab on every run, so it always reflects
 *      the current state of your other tabs.
 *
 *  ──────────────────────────────────────────────────────────────────────────
 *  INSTALLATION  (one time)
 *  ──────────────────────────────────────────────────────────────────────────
 *    1. Open your Google Doc. Create a top-level tab (at the bottom is tidy)
 *       to hold the assembled output. Name it exactly the value of
 *       TARGET_TAB_TITLE in the CONFIG section (default: "Combined Book").
 *       To show/add tabs: click the "Show tabs & outline" panel on the left,
 *       then the "+" at the bottom of it.
 *
 *    2. In the doc, go to:  Extensions > Apps Script.
 *       Delete any code in the default "Code.gs", paste this entire file in,
 *       and click Save (the disk icon).
 *
 *    3. Enable the Docs API advanced service (REQUIRED if ADD_FOOTNOTES is
 *       true, or if you use any emoji rules — both default to on):
 *         • In the Apps Script editor's left sidebar, next to "Services",
 *           click "+".
 *         • Select "Google Docs API".
 *         • Leave the identifier as the default "Docs" and click "Add".
 *       (If ADD_FOOTNOTES is false AND you clear the emoji lists, you can
 *        skip this step.)
 *
 *    4. Back in the Google Doc, reload the browser tab. A new menu named
 *       "Combine Tabs" appears next to Help after a few seconds.
 *
 *    5. Click  Combine Tabs > Rebuild <target tab>.  The first run asks you to
 *       authorize the script — review and allow. It only touches this document
 *       (and, for footnotes, calls the Docs API on this same document).
 *
 *  ──────────────────────────────────────────────────────────────────────────
 *  USAGE
 *  ──────────────────────────────────────────────────────────────────────────
 *    • Combine Tabs > Rebuild <target tab>
 *        Clears and rebuilds the target tab from all other tabs. Re-run any
 *        time after editing; it is always safe to run repeatedly.
 *    • Combine Tabs > Log tab emojis (debug)
 *        Prints each tab's title and its stored emoji (with exact code points)
 *        to the Apps Script log, so you can confirm your emoji rules match.
 *        View the output under "Executions" or View > Logs in the editor.
 *
 *    To print/export the result: open the target tab, then
 *    File > Print, or File > Download > PDF Document.
 *
 *  ──────────────────────────────────────────────────────────────────────────
 *  KNOWN LIMITATIONS
 *  ──────────────────────────────────────────────────────────────────────────
 *    • Comments are not carried over (no Apps Script API for them).
 *    • Per-tab headers/footers can't be preserved per-section in one tab; only
 *      the first content tab's header/footer is applied document-wide.
 *    • Footnote contents preserve bold/italic/underline/strikethrough/links,
 *      but not font family/size/color.
 *    • Footnotes inside table cells are unusual and may not convert cleanly.
 *    • Very large documents (hundreds of footnotes) may approach the Apps
 *      Script 6-minute execution limit.
 *
 *  License: MIT (see repository).
 * ============================================================================
 */


/* ============================================================================
 *  CONFIG  —  Edit the values in this section to suit your document.
 *            You should not need to change anything below the CONFIG section.
 * ==========================================================================*/

/**
 * The exact title of the tab that will receive the assembled output. You must
 * create this tab yourself (see INSTALLATION step 1). Its own content is
 * always overwritten on each run. Matching is case-sensitive.
 */
const TARGET_TAB_TITLE = 'Combined Book';

/**
 * Insert real footnotes for any footnotes found in your tabs.
 *   true  -> footnotes are recreated in the combined tab (requires the Docs
 *            API advanced service; see INSTALLATION step 3).
 *   false -> footnotes are ignored; no Docs API needed for footnotes.
 */
const ADD_FOOTNOTES = true;

/**
 * Copy the first INCLUDED content tab's header and footer onto the combined
 * tab as the document-wide header/footer.
 *   true  -> copy them.   false -> leave the target tab's header/footer alone.
 * Note: Google Docs cannot vary headers/footers per section within one tab,
 * so only a single (the first) header/footer can be represented.
 */
const COPY_HEADER_FOOTER = true;

/* ── Emoji rules ───────────────────────────────────────────────────────────
 * Tag a tab with an emoji icon (right-click a tab > "Add emoji", or use the
 * tab's options) to control how it is treated. The emoji icon can only be
 * read through the Docs API, so using ANY emoji rule requires the Docs API
 * advanced service (INSTALLATION step 3).
 *
 * Matching ignores emoji variation selectors, so e.g. a pause icon matches
 * whether or not Google stored the invisible U+FE0F suffix. If a rule isn't
 * matching, run "Combine Tabs > Log tab emojis (debug)" to see the exact
 * stored characters and paste them here.
 * ---------------------------------------------------------------------------*/

/**
 * Tabs whose icon is one of these are EXCLUDED from the compiled output.
 * Handy for research/notes tabs you keep alongside the manuscript.
 * Set to an empty array ([]) to disable. Example: ['📓', '🗑️'].
 */
const SKIP_EMOJIS = ['📓'];

/**
 * Tabs whose icon is one of these become a PAGE BREAK at their position, and
 * nothing else from the tab is included (title, heading, and content are all
 * ignored). Use a tab as a movable "insert a page break here" marker.
 * Set to an empty array ([]) to disable. Example: ['⏸️'].
 */
const PAGEBREAK_EMOJIS = ['⏸️'];

/**
 * If true, ANY tab that has an emoji icon is skipped (except tabs matched by
 * PAGEBREAK_EMOJIS, which still take precedence). Leave false if you use
 * emojis on tabs for other, decorative reasons.
 */
const SKIP_ANY_EMOJI = false;

/**
 * When a tab is skipped, should its subtabs be skipped too?
 *   true  -> skip the whole subtree.
 *   false -> skip only the marked tab; its subtabs are promoted up one level
 *            (they take the heading level the skipped parent would have had).
 */
const SKIP_EMOJI_INCLUDES_CHILDREN = true;

/* ── Spacing ───────────────────────────────────────────────────────────────
 * Spacing between sections, counted in empty paragraphs (blank lines). The
 * preceding tab's content already ends its own paragraph, so a value of 2
 * below yields two visible blank lines before the next heading.
 * ---------------------------------------------------------------------------*/

/** Blank lines inserted before each tab's heading (after previous content). */
const BLANKS_BEFORE_HEADING = 2;

/** Blank lines inserted after each tab's heading, before its content. */
const BLANKS_AFTER_HEADING = 1;


/* ============================================================================
 *  INTERNALS  —  No need to edit below this line.
 * ==========================================================================*/

/** Invisible private-use marker used to position footnotes; do not change. */
const SENTINEL = '\uE000';

// Module-level scratch state, reset at the start of each run.
let _pendingFootnotes = [];

function onOpen() {
  DocumentApp.getUi()
    .createMenu('Combine Tabs')
    .addItem('Rebuild ' + TARGET_TAB_TITLE, 'combineAllTabsIntoOne')
    .addItem('Log tab emojis (debug)', 'logTabEmojis')
    .addToUi();
}

/**
 * Diagnostic: logs each tab's title, its raw iconEmoji, the normalized form,
 * and the rule that would apply. Run from the editor and check Executions /
 * View > Logs. Useful for confirming emoji strings match your config.
 */
function logTabEmojis() {
  const docId = DocumentApp.getActiveDocument().getId();
  let doc;
  try {
    doc = Docs.Documents.get(docId, { includeTabsContent: true });
  } catch (e) {
    Logger.log('Docs API not reachable: ' + e.message +
      ' — enable the Google Docs API advanced service.');
    return;
  }
  const skipNorm = SKIP_EMOJIS.map(normalizeEmoji);
  const pbNorm = PAGEBREAK_EMOJIS.map(normalizeEmoji);
  const walk = function (tabs, indent) {
    if (!tabs) return;
    for (const t of tabs) {
      const p = t.tabProperties || {};
      const raw = p.iconEmoji || '';
      const norm = normalizeEmoji(raw);
      let rule = 'include';
      if (norm && pbNorm.indexOf(norm) !== -1) rule = 'PAGE BREAK';
      else if (norm && (skipNorm.indexOf(norm) !== -1 || SKIP_ANY_EMOJI)) rule = 'SKIP';
      const codepoints = raw ? Array.from(raw).map(function (c) {
        return 'U+' + c.codePointAt(0).toString(16).toUpperCase();
      }).join(' ') : '(none)';
      Logger.log(indent + '"' + (p.title || '') + '"  emoji=' + (raw || '∅') +
        '  [' + codepoints + ']  -> ' + rule);
      walk(t.childTabs, indent + '    ');
    }
  };
  walk(doc.tabs, '');
}

function combineAllTabsIntoOne() {
  const doc = DocumentApp.getActiveDocument();
  const docId = doc.getId();

  const targetTab = findTabByTitle(doc, TARGET_TAB_TITLE);
  if (!targetTab) {
    throw new Error(
      'Could not find a tab named "' + TARGET_TAB_TITLE + '". Create it ' +
      'manually first (a top-level tab at the bottom), then re-run.'
    );
  }
  const targetTabId = targetTab.getId();
  const targetBody = targetTab.asDocumentTab().getBody();

  // Reset scratch state.
  _pendingFootnotes = [];

  // Determine per-tab handling (skip / page break) from emoji icons.
  const tabMeta = buildTabMeta(docId);

  // Ordered list of sections, excluding the target tab/subtree.
  const sections = [];
  for (const tab of doc.getTabs()) {
    if (tab.getId() === targetTabId) continue;
    collectSections(tab, 0, sections, targetTabId, tabMeta);
  }

  clearBody(targetBody);

  // Optionally copy header/footer from the first real content tab.
  if (COPY_HEADER_FOOTER) {
    const firstContent = sections.find(function (s) { return s.type === 'content'; });
    if (firstContent) {
      try { copyHeaderFooter(firstContent.tab, targetTab); } catch (e) {}
    }
  }

  // needLeadingBlanks is false at the very start and right after a page break,
  // so a heading sits cleanly at the top of its page rather than pushed down.
  let needLeadingBlanks = false;

  for (const section of sections) {
    if (section.type === 'pagebreak') {
      targetBody.appendPageBreak();
      needLeadingBlanks = false;
      continue;
    }

    // content section
    if (needLeadingBlanks) {
      for (let i = 0; i < BLANKS_BEFORE_HEADING; i++) appendBlank(targetBody);
    }

    const heading = targetBody.appendParagraph(section.tab.getTitle());
    heading.setHeading(headingForDepth(section.depth));

    for (let i = 0; i < BLANKS_AFTER_HEADING; i++) appendBlank(targetBody);

    copyBodyContents(section.tab.asDocumentTab().getBody(), targetBody);
    needLeadingBlanks = true;
  }

  // Cosmetic; tolerate stale-state failures after heavy edits.
  try {
    doc.setActiveTab(targetTabId);
  } catch (e) {}

  // Footnotes require a persisted document for the Docs API to read,
  // so save first, then run the API pass.
  if (ADD_FOOTNOTES && _pendingFootnotes.length > 0) {
    const footnotes = _pendingFootnotes.slice(); // keep a copy across save
    doc.saveAndClose();
    try {
      addFootnotesViaApi(docId, targetTabId, footnotes);
    } catch (e) {
      // Best-effort cleanup so stray markers don't litter the tab.
      try { stripSentinelsViaApi(docId, targetTabId); } catch (e2) {}
      throw new Error(
        'Body assembled successfully, but footnote insertion failed: ' +
        e.message + '  (If this mentions "Docs is not defined", enable the ' +
        'Google Docs API advanced service — see setup step 3.)'
      );
    }
  }
}

/* ─────────────────────────── tab traversal ─────────────────────────── */

function collectSections(tab, depth, out, targetTabId, meta) {
  if (tab.getId() === targetTabId) return;

  const m = meta[tab.getId()] || {};

  // Page-break tab: contributes only a page break; title/content ignored.
  if (m.pagebreak) {
    out.push({ type: 'pagebreak', tab: tab, depth: depth });
    // A page-break tab normally has no children, but if it does, treat
    // them as ordinary sections at the same level.
    for (const child of tab.getChildTabs()) {
      collectSections(child, depth, out, targetTabId, meta);
    }
    return;
  }

  // Skipped tab: excluded entirely.
  if (m.skip) {
    if (SKIP_EMOJI_INCLUDES_CHILDREN) {
      return; // skip this tab and its entire subtree
    }
    // Skip just this tab; promote children into this tab's slot
    // (they keep the depth/heading level the parent would have had).
    for (const child of tab.getChildTabs()) {
      collectSections(child, depth, out, targetTabId, meta);
    }
    return;
  }

  out.push({ type: 'content', tab: tab, depth: depth });
  for (const child of tab.getChildTabs()) {
    collectSections(child, depth + 1, out, targetTabId, meta);
  }
}

/**
 * Returns a map { tabId: {skip:bool, pagebreak:bool} } derived from each
 * tab's emoji icon. The emoji is only available via the Docs API
 * (tabProperties.iconEmoji), so this requires the advanced Docs service.
 * Returns an empty map when no emoji rules are configured.
 */
function buildTabMeta(docId) {
  const meta = {};
  const enabled =
    SKIP_ANY_EMOJI ||
    (SKIP_EMOJIS && SKIP_EMOJIS.length > 0) ||
    (PAGEBREAK_EMOJIS && PAGEBREAK_EMOJIS.length > 0);
  if (!enabled) return meta;

  let doc;
  try {
    doc = Docs.Documents.get(docId, { includeTabsContent: true });
  } catch (e) {
    throw new Error(
      'Emoji-based tab rules are enabled, but the Docs API could not be ' +
      'reached (' + e.message + '). Enable the Google Docs API advanced ' +
      'service (Services > +, identifier "Docs"), or clear SKIP_EMOJIS / ' +
      'PAGEBREAK_EMOJIS and set SKIP_ANY_EMOJI = false.'
    );
  }
  walkApiTabsForMeta(doc.tabs, meta);
  return meta;
}

function walkApiTabsForMeta(tabs, meta) {
  if (!tabs) return;
  const skipNorm = SKIP_EMOJIS.map(normalizeEmoji);
  const pbNorm = PAGEBREAK_EMOJIS.map(normalizeEmoji);
  for (const t of tabs) {
    const props = t.tabProperties || {};
    const emoji = normalizeEmoji(props.iconEmoji || '');
    if (emoji) {
      // Page break takes precedence over skip.
      if (pbNorm.indexOf(emoji) !== -1) {
        meta[props.tabId] = { pagebreak: true };
      } else if (skipNorm.indexOf(emoji) !== -1 || SKIP_ANY_EMOJI) {
        meta[props.tabId] = { skip: true };
      }
    }
    walkApiTabsForMeta(t.childTabs, meta);
  }
}

/**
 * Normalizes an emoji string for comparison by removing variation selectors
 * (U+FE0E / U+FE0F) and surrounding whitespace, so matches don't depend on
 * whether Docs stored the trailing selector.
 */
function normalizeEmoji(s) {
  if (!s) return '';
  return s.replace(/[\uFE0E\uFE0F]/g, '').trim();
}

/** Appends a blank NORMAL-styled paragraph (so it never inherits a heading). */
function appendBlank(body) {
  const p = body.appendParagraph('');
  try { p.setHeading(DocumentApp.ParagraphHeading.NORMAL); } catch (e) {}
  return p;
}

function headingForDepth(depth) {
  const level = Math.min(depth + 2, 6);
  switch (level) {
    case 2: return DocumentApp.ParagraphHeading.HEADING2;
    case 3: return DocumentApp.ParagraphHeading.HEADING3;
    case 4: return DocumentApp.ParagraphHeading.HEADING4;
    case 5: return DocumentApp.ParagraphHeading.HEADING5;
    default: return DocumentApp.ParagraphHeading.HEADING6;
  }
}

function findTabByTitle(doc, title) {
  for (const tab of doc.getTabs()) {
    const found = findTabByTitleRecursive(tab, title);
    if (found) return found;
  }
  return null;
}

function findTabByTitleRecursive(tab, title) {
  if (tab.getTitle() === title) return tab;
  for (const child of tab.getChildTabs()) {
    const found = findTabByTitleRecursive(child, title);
    if (found) return found;
  }
  return null;
}

/* ─────────────────────────── body clearing ─────────────────────────── */

function clearBody(body) {
  while (body.getNumChildren() > 1) {
    body.removeChild(body.getChild(0));
  }
  const last = body.getChild(0);
  if (last.getType() === DocumentApp.ElementType.PARAGRAPH) {
    const par = last.asParagraph();
    par.setHeading(DocumentApp.ParagraphHeading.NORMAL);
    par.editAsText().setText('');
  } else if (last.getType() === DocumentApp.ElementType.TABLE) {
    body.insertParagraph(0, '');
    body.removeChild(last);
  }
  body._placeholderToRemove = body.getChild(0);
}

/** Clears a header/footer section, leaving a single empty paragraph. */
function safeClearSection(section) {
  while (section.getNumChildren() > 1) {
    section.removeChild(section.getChild(0));
  }
  const last = section.getChild(0);
  if (last.getType() === DocumentApp.ElementType.PARAGRAPH) {
    last.asParagraph().editAsText().setText('');
  }
}

/* ─────────────────────────── content copying ───────────────────────── */

function copyBodyContents(sourceBody, targetBody) {
  // Determine the last child to copy, skipping any trailing blank paragraphs
  // so inter-tab spacing depends only on BLANKS_BEFORE_HEADING, not on how
  // many empty lines a tab happens to end with.
  let last = sourceBody.getNumChildren() - 1;
  while (last >= 0 && isBlankParagraph(sourceBody.getChild(last))) {
    last--;
  }
  for (let i = 0; i <= last; i++) {
    copyElementToBody(sourceBody.getChild(i), targetBody);
  }
  const placeholder = targetBody._placeholderToRemove;
  if (placeholder && targetBody.getNumChildren() > 1) {
    try { targetBody.removeChild(placeholder); } catch (e) {}
    targetBody._placeholderToRemove = null;
  }
}

/**
 * True if an element is a paragraph that renders as a blank line: empty or
 * whitespace-only text and no inline images, footnotes, or other non-text
 * content. List items and tables are never considered blank.
 */
function isBlankParagraph(element) {
  if (element.getType() !== DocumentApp.ElementType.PARAGRAPH) return false;
  const par = element.asParagraph();
  if (par.getText().trim() !== '') return false;
  const n = par.getNumChildren();
  for (let i = 0; i < n; i++) {
    if (par.getChild(i).getType() !== DocumentApp.ElementType.TEXT) return false;
  }
  return true;
}

/** Copies all children of a header/footer section into another section. */
function copyContainerContents(src, tgt) {
  const n = src.getNumChildren();
  for (let i = 0; i < n; i++) {
    copyElementToBody(src.getChild(i), tgt);
  }
  // Remove the leading empty paragraph left by safeClearSection.
  if (tgt.getNumChildren() > 1) {
    const first = tgt.getChild(0);
    if (first.getType() === DocumentApp.ElementType.PARAGRAPH &&
        first.asParagraph().getText() === '') {
      try { tgt.removeChild(first); } catch (e) {}
    }
  }
}

function copyElementToBody(element, target) {
  const type = element.getType();
  switch (type) {
    case DocumentApp.ElementType.PARAGRAPH: {
      const src = element.asParagraph();
      const np = target.appendParagraph('');
      copyParagraphStyle(src, np);
      copyParagraphContent(src, np);
      break;
    }
    case DocumentApp.ElementType.LIST_ITEM: {
      const src = element.asListItem();
      const ni = target.appendListItem('');
      copyListItemStyle(src, ni);
      copyParagraphContent(src, ni);
      break;
    }
    case DocumentApp.ElementType.TABLE: {
      copyTable(element.asTable(), target);
      break;
    }
    case DocumentApp.ElementType.INLINE_IMAGE: {
      target.appendImage(element.asInlineImage().getBlob());
      break;
    }
    case DocumentApp.ElementType.HORIZONTAL_RULE: {
      target.appendHorizontalRule();
      break;
    }
    case DocumentApp.ElementType.PAGE_BREAK: {
      break; // intentionally skipped
    }
    default: {
      try {
        const t = element.asText ? element.asText().getText() : '';
        if (t) target.appendParagraph(t);
      } catch (e) {}
    }
  }
}

function copyParagraphStyle(source, target) {
  try { target.setHeading(source.getHeading()); } catch (e) {}
  try { const a = source.getAlignment(); if (a) target.setAlignment(a); } catch (e) {}
  try { target.setLineSpacing(source.getLineSpacing()); } catch (e) {}
  try {
    target.setSpacingBefore(source.getSpacingBefore());
    target.setSpacingAfter(source.getSpacingAfter());
  } catch (e) {}
  try {
    target.setIndentStart(source.getIndentStart());
    target.setIndentEnd(source.getIndentEnd());
    target.setIndentFirstLine(source.getIndentFirstLine());
  } catch (e) {}
}

function copyListItemStyle(source, target) {
  copyParagraphStyle(source, target);
  try { target.setNestingLevel(source.getNestingLevel()); } catch (e) {}
  try { target.setGlyphType(source.getGlyphType()); } catch (e) {}
}

/**
 * Copies inline content of a paragraph/list item: text runs (with character
 * formatting), inline images, and footnote anchors. Footnote anchors are
 * replaced by an invisible sentinel; their contents are queued in
 * _pendingFootnotes (in reading order) for the later Docs-API pass.
 */
function copyParagraphContent(source, target) {
  const n = source.getNumChildren();
  const targetText = target.editAsText();
  let firstHandled = false;

  const appendStr = function (str) {
    if (!firstHandled) {
      targetText.setText(str);
      firstHandled = true;
      return 0;
    }
    const off = targetText.getText().length;
    targetText.insertText(off, str);
    return off;
  };

  for (let i = 0; i < n; i++) {
    const child = source.getChild(i);
    const ct = child.getType();

    if (ct === DocumentApp.ElementType.TEXT) {
      const st = child.asText();
      const str = st.getText();
      if (str.length === 0) continue;
      const off = appendStr(str);
      copyTextAttributes(st, targetText, off, str.length);

    } else if (ct === DocumentApp.ElementType.INLINE_IMAGE) {
      const blob = child.asInlineImage().getBlob();
      try {
        target.insertInlineImage(target.getNumChildren(), blob);
      } catch (e) {
        try { target.appendInlineImage(blob); } catch (e2) {}
      }

    } else if (ct === DocumentApp.ElementType.FOOTNOTE) {
      // Record contents now; drop a sentinel to be replaced later.
      try {
        _pendingFootnotes.push(extractFootnoteContent(child.asFootnote()));
        appendStr(SENTINEL);
      } catch (e) {
        // If a footnote can't be read, skip it rather than misalign.
      }
    }
  }

  if (!firstHandled) targetText.setText('');
}

function copyTextAttributes(sourceText, targetText, offset, length) {
  if (length === 0) return;
  const srcLen = sourceText.getText().length;
  let start = 0;
  while (start < srcLen) {
    let end = start;
    const attrs = sourceText.getAttributes(start);
    const link = sourceText.getLinkUrl(start);
    while (end + 1 < srcLen &&
           attributesEqual(sourceText.getAttributes(end + 1), attrs) &&
           sourceText.getLinkUrl(end + 1) === link) {
      end++;
    }
    const ts = offset + start;
    const te = offset + end;
    try { targetText.setAttributes(ts, te, attrs); } catch (e) {}
    if (link) { try { targetText.setLinkUrl(ts, te, link); } catch (e) {} }
    start = end + 1;
  }
}

function attributesEqual(a, b) {
  const keys = Object.keys(a).concat(Object.keys(b));
  for (const k of keys) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

function copyTable(sourceTable, target) {
  const rows = sourceTable.getNumRows();
  if (rows === 0) return;
  const cols = sourceTable.getRow(0).getNumCells();

  const init = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) row.push('');
    init.push(row);
  }
  const newTable = target.appendTable(init);

  for (let r = 0; r < rows; r++) {
    const sRow = sourceTable.getRow(r);
    const nRow = newTable.getRow(r);
    const cc = Math.min(sRow.getNumCells(), nRow.getNumCells());
    for (let c = 0; c < cc; c++) {
      const sCell = sRow.getCell(c);
      const nCell = nRow.getCell(c);
      nCell.clear();
      const cn = sCell.getNumChildren();
      for (let p = 0; p < cn; p++) {
        copyElementToBody(sCell.getChild(p), nCell);
      }
    }
  }
}

/* ─────────────────────────── header / footer ───────────────────────── */

function copyHeaderFooter(sourceTab, targetTab) {
  const src = sourceTab.asDocumentTab();
  const tgt = targetTab.asDocumentTab();

  const srcHeader = src.getHeader();
  if (srcHeader) {
    let tgtHeader = tgt.getHeader();
    if (!tgtHeader) tgtHeader = tgt.addHeader();
    safeClearSection(tgtHeader);
    copyContainerContents(srcHeader, tgtHeader);
  }

  const srcFooter = src.getFooter();
  if (srcFooter) {
    let tgtFooter = tgt.getFooter();
    if (!tgtFooter) tgtFooter = tgt.addFooter();
    safeClearSection(tgtFooter);
    copyContainerContents(srcFooter, tgtFooter);
  }
}

/* ───────────────────── footnote contents extraction ────────────────── */

/**
 * Reads a footnote's contents into { text, runs }, where runs describe
 * character formatting over the concatenated text (paragraphs joined by \n).
 */
function extractFootnoteContent(footnote) {
  const section = footnote.getFootnoteContents();
  if (!section) return { text: '', runs: [] };

  let text = '';
  const runs = [];
  const n = section.getNumChildren();

  for (let i = 0; i < n; i++) {
    const child = section.getChild(i);
    if (i > 0) text += '\n';
    const ct = child.getType();

    if (ct === DocumentApp.ElementType.PARAGRAPH ||
        ct === DocumentApp.ElementType.LIST_ITEM) {
      const para = (ct === DocumentApp.ElementType.PARAGRAPH)
        ? child.asParagraph() : child.asListItem();
      const t = para.editAsText();
      const s = t.getText();
      const base = text.length;
      let j = 0;
      while (j < s.length) {
        let k = j;
        const a = t.getAttributes(j);
        const link = t.getLinkUrl(j);
        while (k + 1 < s.length &&
               attributesEqual(t.getAttributes(k + 1), a) &&
               t.getLinkUrl(k + 1) === link) {
          k++;
        }
        runs.push({
          start: base + j,
          end: base + k + 1,
          bold: a[DocumentApp.Attribute.BOLD],
          italic: a[DocumentApp.Attribute.ITALIC],
          underline: a[DocumentApp.Attribute.UNDERLINE],
          strikethrough: a[DocumentApp.Attribute.STRIKETHROUGH],
          link: link || null
        });
        j = k + 1;
      }
      text += s;
    } else {
      try { text += child.asText().getText(); } catch (e) {}
    }
  }
  return { text: text, runs: runs };
}

/* ─────────────────── Docs API footnote insertion pass ──────────────── */

function addFootnotesViaApi(docId, tabId, footnotes) {
  const doc = Docs.Documents.get(docId, { includeTabsContent: true });
  const apiTab = findApiTab(doc.tabs, tabId);
  if (!apiTab || !apiTab.documentTab || !apiTab.documentTab.body) {
    throw new Error('Target tab not found via Docs API.');
  }

  const positions = [];
  collectSentinelPositions(apiTab.documentTab.body.content, positions);
  positions.sort(function (a, b) { return a - b; });

  // kth sentinel (in document order) maps to footnotes[k].
  const mapped = [];
  for (let i = 0; i < positions.length; i++) {
    mapped.push({ pos: positions[i], content: footnotes[i] || { text: '', runs: [] } });
  }
  // Edit back-to-front so earlier indices stay valid.
  mapped.sort(function (a, b) { return b.pos - a.pos; });

  // Phase 1: delete each sentinel and create a footnote there.
  const footnoteIds = [];          // parallel to `mapped`
  const CHUNK = 100;               // footnotes per batch
  for (let i = 0; i < mapped.length; i += CHUNK) {
    const slice = mapped.slice(i, i + CHUNK);
    const requests = [];
    for (const m of slice) {
      requests.push({
        deleteContentRange: {
          range: { tabId: tabId, startIndex: m.pos, endIndex: m.pos + 1 }
        }
      });
      requests.push({
        createFootnote: { location: { tabId: tabId, index: m.pos } }
      });
    }
    const resp = Docs.Documents.batchUpdate({ requests: requests }, docId);
    const replies = resp.replies || [];
    for (const r of replies) {
      if (r && r.createFootnote && r.createFootnote.footnoteId) {
        footnoteIds.push(r.createFootnote.footnoteId);
      }
    }
  }

  // Phase 2: fill footnote contents (separate segments; index-independent).
  const fill = [];
  for (let i = 0; i < footnoteIds.length; i++) {
    const fid = footnoteIds[i];
    const c = mapped[i].content;
    if (!c || !c.text) continue;
    fill.push({
      insertText: {
        location: { tabId: tabId, segmentId: fid, index: 1 },
        text: c.text
      }
    });
    for (const run of (c.runs || [])) {
      const ts = buildTextStyle(run);
      if (ts.fields) {
        fill.push({
          updateTextStyle: {
            range: {
              tabId: tabId, segmentId: fid,
              startIndex: 1 + run.start, endIndex: 1 + run.end
            },
            textStyle: ts.style,
            fields: ts.fields
          }
        });
      }
    }
  }
  for (let i = 0; i < fill.length; i += 200) {
    Docs.Documents.batchUpdate({ requests: fill.slice(i, i + 200) }, docId);
  }
}

function buildTextStyle(run) {
  const style = {};
  const fields = [];
  if (run.bold != null) { style.bold = !!run.bold; fields.push('bold'); }
  if (run.italic != null) { style.italic = !!run.italic; fields.push('italic'); }
  if (run.underline != null) { style.underline = !!run.underline; fields.push('underline'); }
  if (run.strikethrough != null) { style.strikethrough = !!run.strikethrough; fields.push('strikethrough'); }
  if (run.link) { style.link = { url: run.link }; fields.push('link'); }
  return { style: style, fields: fields.join(',') };
}

function collectSentinelPositions(elements, out) {
  if (!elements) return;
  for (const el of elements) {
    if (el.paragraph && el.paragraph.elements) {
      for (const pe of el.paragraph.elements) {
        if (pe.textRun && pe.textRun.content) {
          const base = pe.startIndex;
          const str = pe.textRun.content;
          for (let i = 0; i < str.length; i++) {
            if (str.charAt(i) === SENTINEL) out.push(base + i);
          }
        }
      }
    } else if (el.table && el.table.tableRows) {
      for (const row of el.table.tableRows) {
        for (const cell of row.tableCells) {
          collectSentinelPositions(cell.content, out);
        }
      }
    }
  }
}

function findApiTab(tabs, tabId) {
  if (!tabs) return null;
  for (const t of tabs) {
    if (t.tabProperties && t.tabProperties.tabId === tabId) return t;
    const c = findApiTab(t.childTabs, tabId);
    if (c) return c;
  }
  return null;
}

/** Best-effort removal of any leftover sentinels (used on error). */
function stripSentinelsViaApi(docId, tabId) {
  const doc = Docs.Documents.get(docId, { includeTabsContent: true });
  const apiTab = findApiTab(doc.tabs, tabId);
  if (!apiTab || !apiTab.documentTab || !apiTab.documentTab.body) return;
  const positions = [];
  collectSentinelPositions(apiTab.documentTab.body.content, positions);
  positions.sort(function (a, b) { return b - a; });
  const requests = positions.map(function (p) {
    return { deleteContentRange: { range: { tabId: tabId, startIndex: p, endIndex: p + 1 } } };
  });
  for (let i = 0; i < requests.length; i += 200) {
    Docs.Documents.batchUpdate({ requests: requests.slice(i, i + 200) }, docId);
  }
}
