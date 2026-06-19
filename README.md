# Combine Google Docs Tabs

Google Docs has tab support that allows you to write chapters or longer-form content, and then drag to rearrange those as you like. This mimics other well known dedicated writing program like Scrivner and Obsidian Long Form, and is very helpful for working on documents where rearranging sections is helpful.
However, I find their export ability to be weird. They do not include the ability to simply save the entire document as one continuous document, all the tabs assembled together sequentially. The best you can do is export it as PDF, including all tabs, and it will do so - but it will also insert a badly formatted page with the name of the tab between each tab in the final output.
If you wanted to use Google Doc to write a long form book, with one tab per chapter, there's no way to simply export the entire thing into a form that you can print and hand to someone. You'd have to go through and manually move the content of each tab into one tab for printing.

This is a Google Apps Script that assembles all the tabs of a Google Doc — including nested subtabs — into a single tab you can print or export as one continuous document. This allows you to write with tabs to segment sections, arrange them however you like, and then nondestructively compile it into a single tab for printing, exporting, or sharing. 

Google Docs lets you split a document into tabs and subtabs, which is great for drafting a book or long manuscript section by section. The problem: printing and PDF export operate on one tab at a time, and there's no built-in way to merge tabs into a single flow without losing structure. This script does exactly that, rebuilding a dedicated "output" tab from all your other tabs on demand.

## Features

- **One continuous document.** Every tab is concatenated, in order, into a single target tab ready to print or export to PDF.
- **Automatic heading structure.** Each tab's title becomes a heading, with the level following nesting depth — top-level tabs become Heading 2, subtabs Heading 3, deeper levels Heading 4–6. The result has a clean, navigable outline.
- **Formatting preserved.** Paragraph styles, headings, lists, tables, inline images, and character formatting (bold, italic, underline, strikethrough, links, font, size) are carried over.
- **Footnotes.** Footnotes are recreated at the correct positions, renumbered sequentially for the combined document. Footnote text keeps bold/italic/underline/strikethrough and links.
- **Emoji tab rules.** Tag a tab with an emoji to control how it's treated:
  - 📓 (configurable) — **exclude** the tab, e.g. research or notes tabs kept alongside the manuscript.
  - ⏸️ (configurable) — turn the tab into a **page break** at its position; nothing else from the tab is included. A movable "insert page break here" marker.
- **Consistent spacing.** Trailing blank lines are trimmed from each tab, so the gap between sections is uniform no matter how each tab happens to end.
- **Safe to re-run.** The target tab is cleared and rebuilt from scratch each time, so it always reflects the current state of your other tabs.

## Requirements

- A Google Doc that uses tabs.
- The **Google Docs API** advanced service, enabled inside the Apps Script editor. This is required for footnotes and for any emoji rules (both on by default). If you turn footnotes off and clear the emoji lists, it isn't needed.

## Installation

1. **Create the output tab.** In your Google Doc, open the "Show tabs & outline" panel on the left and click **+** to add a top-level tab. Name it exactly **`Combined Book`** (or whatever you set `TARGET_TAB_TITLE` to). Putting it at the bottom keeps things tidy.

2. **Add the script.** Go to **Extensions → Apps Script**. Delete anything in the default `Code.gs`, paste in the contents of [`CombineTabs.gs`](CombineTabs.gs), and click **Save**.

3. **Enable the Docs API.** In the Apps Script editor's left sidebar, click the **+** next to **Services**, choose **Google Docs API**, leave the identifier as the default `Docs`, and click **Add**.

4. **Reload the doc.** Switch back to your Google Doc and reload the browser tab. A **Combine Tabs** menu appears after a few seconds.

5. **Run it.** Choose **Combine Tabs → Rebuild Combined Book**. The first run prompts for authorization — review and allow. The script only touches the current document.

## Usage

- **Combine Tabs → Rebuild Combined Book** — clears and rebuilds the output tab from all your other tabs. Run it again whenever you've made edits.
- **Combine Tabs → Log tab emojis (debug)** — prints each tab's title and its stored emoji (with exact code points) to the Apps Script log, so you can confirm your emoji rules are matching. View it under **Executions** or **View → Logs** in the editor.

To produce the final document, open the output tab and use **File → Print** or **File → Download → PDF Document**.

## Configuration

All adjustable settings live in the `CONFIG` section at the top of the script, each documented inline. The main ones:

| Setting | Default | Purpose |
| --- | --- | --- |
| `TARGET_TAB_TITLE` | `'Combined Book'` | Title of the tab that receives the assembled output. You create this tab yourself. |
| `ADD_FOOTNOTES` | `true` | Recreate footnotes in the combined tab. Requires the Docs API service. |
| `COPY_HEADER_FOOTER` | `true` | Copy the first included tab's header/footer to the output tab. |
| `SKIP_EMOJIS` | `['📓']` | Tabs with one of these icons are excluded. `[]` to disable. |
| `PAGEBREAK_EMOJIS` | `['⏸️']` | Tabs with one of these icons become a page break. `[]` to disable. |
| `SKIP_ANY_EMOJI` | `false` | If true, any emoji-tagged tab is skipped (page-break tabs still win). |
| `SKIP_EMOJI_INCLUDES_CHILDREN` | `true` | Whether skipping a tab also skips its subtabs. |
| `BLANKS_BEFORE_HEADING` | `2` | Blank lines before each tab's heading. |
| `BLANKS_AFTER_HEADING` | `1` | Blank lines after each tab's heading, before its content. |

Emoji matching ignores variation selectors, so a marker matches whether or not Google stored the invisible `U+FE0F` suffix. If a rule isn't matching, use the debug menu item to see the exact stored characters.

## How it works

The bulk of the assembly uses the standard Apps Script Document service, copying each tab's elements into the target tab. Two things require the more capable Docs API: reading a tab's emoji icon (not exposed by the Document service) and creating footnotes (which the Document service can't do). Footnotes are handled in a second pass — during assembly the script drops an invisible marker at each footnote anchor and records the footnote's contents, then after saving it finds each marker via the Docs API, replaces it with a real footnote, and fills in the text.

## Known limitations

- **Comments** are not carried over — Apps Script has no API for document comments.
- **Headers/footers** can't vary per section within a single tab, so only one (the first included tab's) is applied document-wide.
- **Footnote formatting** preserves bold/italic/underline/strikethrough/links, but not font family, size, or color.
- **Footnotes inside table cells** are unusual and may not convert cleanly.
- **Very large documents** with hundreds of footnotes may approach the Apps Script 6-minute execution limit.

## License

MIT.
