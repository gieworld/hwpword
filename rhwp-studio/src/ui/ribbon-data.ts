/**
 * HWP Word ribbon layout. Every `cmd` is an existing rhwp-studio command ID;
 * tests/hwpword-ribbon-commands.test.ts fails if one disappears upstream.
 */
export interface RibbonButton {
  readonly cmd: string;
  readonly label: string;
  /** Existing sprite class from styles/toolbar.css, e.g. 'icon-paste'. */
  readonly icon?: string;
  /** Short text glyph for commands without a sprite. */
  readonly glyph?: string;
  /** Large buttons span the group height with the label under the icon. */
  readonly large?: boolean;
}

export interface RibbonGroup {
  readonly label: string;
  readonly buttons?: readonly RibbonButton[];
  /** Moves an existing element (by id) into this group, e.g. the formatting bar. */
  readonly mountId?: string;
  /** Icon-only buttons (the label stays as the tooltip), for groups Word also renders compactly. */
  readonly compact?: boolean;
}

export interface RibbonTab {
  readonly id: string;
  readonly label: string;
  readonly groups: readonly RibbonGroup[];
}

export const QUICK_ACCESS: readonly RibbonButton[] = [
  { cmd: 'file:save', label: 'Save', icon: 'icon-save' },
  { cmd: 'edit:undo', label: 'Undo', icon: 'icon-undo' },
  { cmd: 'edit:redo', label: 'Redo', icon: 'icon-redo' },
];

export const FILE_PAGE_COMMANDS: readonly RibbonButton[] = [
  { cmd: 'file:new-doc', label: 'New', icon: 'icon-new-doc' },
  { cmd: 'file:open', label: 'Open', glyph: '↥' },
  { cmd: 'file:save', label: 'Save', icon: 'icon-save' },
  { cmd: 'file:save-as', label: 'Save As', glyph: '⎘' },
  { cmd: 'file:save-as-hwp', label: 'Save as HWP', glyph: 'H' },
  { cmd: 'file:save-as-hwpx', label: 'Save as HWPX', glyph: 'X' },
  { cmd: 'file:print', label: 'Print', icon: 'icon-print' },
  { cmd: 'file:print-to-pdf', label: 'Save as PDF', icon: 'icon-pdf' },
  { cmd: 'file:export-doc', label: 'Export to Word (.doc)', glyph: 'W' },
  { cmd: 'file:export-html', label: 'Export to HTML', glyph: '<>' },
  { cmd: 'tool:options', label: 'Options', glyph: '⚙' },
  { cmd: 'file:about', label: 'About', icon: 'icon-help' },
];

export const RIBBON_TABS: readonly RibbonTab[] = [
  {
    id: 'home',
    label: 'Home',
    groups: [
      {
        label: 'Clipboard',
        buttons: [
          { cmd: 'edit:paste', label: 'Paste', icon: 'icon-paste', large: true },
          { cmd: 'edit:cut', label: 'Cut', icon: 'icon-cut' },
          { cmd: 'edit:copy', label: 'Copy', icon: 'icon-copy' },
          { cmd: 'edit:format-copy', label: 'Format Painter', icon: 'icon-format-copy' },
        ],
      },
      { label: 'Font & Paragraph', mountId: 'style-bar' },
      // Bold/italic/underline/strikethrough, the character effects, both colours, the size and
      // line-spacing steppers and the alignment buttons all live in the mounted formatting bar
      // above; repeating them here is what made Home twice as wide as the window.
      {
        label: 'Font',
        buttons: [
          { cmd: 'format:char-shape', label: 'Character…', icon: 'icon-char-shape', large: true },
          { cmd: 'format:font-size-increase', label: 'Grow Font', glyph: 'A+' },
          { cmd: 'format:font-size-decrease', label: 'Shrink Font', glyph: 'A−' },
        ],
      },
      {
        label: 'Paragraph',
        buttons: [
          { cmd: 'format:para-shape', label: 'Paragraph…', icon: 'icon-para-shape', large: true },
          { cmd: 'format:toggle-bullet', label: 'Bullets', glyph: '•' },
          { cmd: 'format:toggle-numbering', label: 'Numbering', glyph: '1.' },
          { cmd: 'format:level-increase', label: 'Increase Level', glyph: '⇤' },
          { cmd: 'format:level-decrease', label: 'Decrease Level', glyph: '⇥' },
          { cmd: 'view:para-mark', label: 'Paragraph Marks', icon: 'icon-para-mark' },
        ],
      },
      {
        label: 'Styles',
        buttons: [{ cmd: 'format:style-dialog', label: 'Styles…', glyph: 'Aa', large: true }],
      },
      {
        label: 'Editing',
        compact: true,
        buttons: [
          { cmd: 'edit:find', label: 'Find', icon: 'icon-find' },
          { cmd: 'edit:find-replace', label: 'Replace', icon: 'icon-find-replace' },
          { cmd: 'edit:goto', label: 'Go To', glyph: '→' },
          { cmd: 'edit:select-all', label: 'Select All', icon: 'icon-select-all' },
        ],
      },
    ],
  },
  {
    id: 'insert',
    label: 'Insert',
    groups: [
      { label: 'Tables', buttons: [{ cmd: 'table:create', label: 'Table', icon: 'icon-table', large: true }] },
      {
        label: 'Illustrations',
        buttons: [
          { cmd: 'insert:image', label: 'Picture', icon: 'icon-image', large: true },
          { cmd: 'insert:shape', label: 'Shapes', icon: 'icon-shape', large: true },
          { cmd: 'insert:textbox', label: 'Text Box', icon: 'icon-textbox', large: true },
        ],
      },
      {
        label: 'Header & Footer',
        buttons: [
          { cmd: 'page:header-create', label: 'Header', icon: 'icon-header', large: true },
          { cmd: 'page:footer-create', label: 'Footer', icon: 'icon-footer', large: true },
          { cmd: 'page:insert-field-pagenum', label: 'Page Number', glyph: '#' },
          { cmd: 'page:insert-field-totalpage', label: 'Total Pages', glyph: 'Σ' },
          { cmd: 'page:insert-field-filename', label: 'File Name', glyph: 'ƒ' },
        ],
      },
      {
        label: 'Notes',
        buttons: [
          { cmd: 'insert:footnote', label: 'Footnote', icon: 'icon-footnote', large: true },
          { cmd: 'insert:endnote', label: 'Endnote', icon: 'icon-endnote', large: true },
        ],
      },
      {
        label: 'Symbols',
        buttons: [
          { cmd: 'insert:equation', label: 'Equation', glyph: 'π', large: true },
          { cmd: 'insert:symbols', label: 'Symbol', icon: 'icon-symbols', large: true },
        ],
      },
      {
        label: 'Links',
        buttons: [
          { cmd: 'insert:bookmark', label: 'Bookmark', glyph: '⚑' },
          { cmd: 'insert:field', label: 'Field', glyph: '{ }' },
        ],
      },
      {
        label: 'Breaks',
        buttons: [
          { cmd: 'page:break', label: 'Page Break', glyph: '⤓' },
          { cmd: 'page:column-break', label: 'Column Break', glyph: '⫼' },
        ],
      },
    ],
  },
  {
    id: 'layout',
    label: 'Layout',
    groups: [
      {
        label: 'Page Setup',
        buttons: [
          { cmd: 'page:setup', label: 'Page Setup…', icon: 'icon-page-setup', large: true },
          { cmd: 'page:page-border', label: 'Page Borders…', glyph: '▢', large: true },
        ],
      },
      {
        label: 'Columns',
        buttons: [
          { cmd: 'page:col-1', label: 'One', glyph: '▮' },
          { cmd: 'page:col-2', label: 'Two', glyph: '▮▮' },
          { cmd: 'page:col-3', label: 'Three', glyph: '▮▮▮' },
          { cmd: 'page:col-left', label: 'Left', glyph: '▌▮' },
          { cmd: 'page:col-right', label: 'Right', glyph: '▮▐' },
          { cmd: 'page:col-settings', label: 'More Columns…', glyph: '⋯' },
        ],
      },
      {
        label: 'Section',
        buttons: [
          { cmd: 'page:section-settings', label: 'Section…', glyph: '§', large: true },
          { cmd: 'page:new-page-num', label: 'Restart Page Numbers…', glyph: '1' },
          { cmd: 'page:hide-current', label: 'Hide on This Page', glyph: '⊘' },
        ],
      },
      {
        label: 'Rows & Columns',
        buttons: [
          { cmd: 'table:insert-row-above', label: 'Insert Above', glyph: '⬆' },
          { cmd: 'table:insert-row-below', label: 'Insert Below', glyph: '⬇' },
          { cmd: 'table:insert-col-left', label: 'Insert Left', glyph: '⬅' },
          { cmd: 'table:insert-col-right', label: 'Insert Right', glyph: '➡' },
          { cmd: 'table:delete-row', label: 'Delete Row', glyph: '⊖' },
          { cmd: 'table:delete-col', label: 'Delete Column', glyph: '⊖' },
        ],
      },
      {
        label: 'Cells',
        buttons: [
          { cmd: 'table:cell-props', label: 'Table Properties…', icon: 'icon-table', large: true },
          { cmd: 'table:cell-merge', label: 'Merge Cells', glyph: '⊞' },
          { cmd: 'table:cell-split', label: 'Split Cells…', glyph: '⊟' },
        ],
      },
      {
        label: 'Arrange',
        buttons: [
          { cmd: 'format:object-properties', label: 'Object Properties…', icon: 'icon-obj-props', large: true },
          { cmd: 'insert:arrange-front', label: 'Bring to Front', glyph: '⇈' },
          { cmd: 'insert:arrange-back', label: 'Send to Back', glyph: '⇊' },
          { cmd: 'insert:rotate-cw', label: 'Rotate Right', glyph: '↷' },
          { cmd: 'insert:rotate-ccw', label: 'Rotate Left', glyph: '↶' },
          { cmd: 'insert:group-shapes', label: 'Group', glyph: '▣' },
        ],
      },
    ],
  },
  {
    id: 'references',
    label: 'References',
    groups: [
      {
        label: 'Footnotes',
        buttons: [
          { cmd: 'insert:footnote', label: 'Insert Footnote', icon: 'icon-footnote', large: true },
          { cmd: 'insert:endnote', label: 'Insert Endnote', icon: 'icon-endnote', large: true },
          { cmd: 'insert:endnote-shape', label: 'Note Settings…', glyph: '⚙' },
        ],
      },
      {
        label: 'Captions',
        buttons: [{ cmd: 'insert:caption-toggle', label: 'Insert Caption', glyph: 'Cap', large: true }],
      },
      { label: 'Links', buttons: [{ cmd: 'insert:bookmark', label: 'Bookmark', glyph: '⚑', large: true }] },
    ],
  },
  {
    id: 'review',
    label: 'Review',
    groups: [
      { label: 'Compare', buttons: [{ cmd: 'edit:compare-documents', label: 'Compare…', glyph: '⇆', large: true }] },
      { label: 'History', buttons: [{ cmd: 'edit:document-history', label: 'Version History…', glyph: '⟲', large: true }] },
      { label: 'Forms', buttons: [{ cmd: 'view:form-mode', label: 'Form Mode', glyph: '☐', large: true }] },
    ],
  },
  {
    id: 'view',
    label: 'View',
    groups: [
      {
        label: 'Show',
        buttons: [
          { cmd: 'view:para-mark', label: 'Paragraph Marks', icon: 'icon-para-mark' },
          { cmd: 'view:ctrl-mark', label: 'Control Codes', icon: 'icon-ctrl-mark' },
          { cmd: 'view:border-transparent', label: 'Table Gridlines', glyph: '┼' },
          { cmd: 'view:toggle-grid', label: 'Grid', icon: 'icon-grid' },
          { cmd: 'view:grid-settings', label: 'Grid Settings…', icon: 'icon-grid' },
          { cmd: 'view:toggle-clip', label: 'Show Clipping', glyph: '✂' },
        ],
      },
      {
        label: 'Zoom',
        buttons: [
          { cmd: 'view:zoom-dialog', label: 'Zoom…', icon: 'icon-zoom-menu-in', large: true },
          { cmd: 'view:zoom-100', label: '100%', glyph: '1:1', large: true },
          { cmd: 'view:zoom-fit-page', label: 'One Page', glyph: '▯' },
          { cmd: 'view:zoom-fit-width', label: 'Page Width', glyph: '↔' },
          { cmd: 'view:zoom-in', label: 'Zoom In', icon: 'icon-zoom-menu-in' },
          { cmd: 'view:zoom-out', label: 'Zoom Out', icon: 'icon-zoom-menu-out' },
        ],
      },
      {
        label: 'Theme',
        buttons: [
          { cmd: 'view:theme-light', label: 'Light', glyph: '☀' },
          { cmd: 'view:theme-dark', label: 'Dark', glyph: '☾' },
          { cmd: 'view:theme-system', label: 'System', glyph: '◐' },
        ],
      },
    ],
  },
];
