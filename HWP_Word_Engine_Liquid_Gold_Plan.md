# HWP Word Engine --- Liquid Gold Plan

> **Goal:** Build a native desktop document editor with a Microsoft
> Word-style UI and first-class HWP/HWPX editing, using a clean internal
> document model rather than coupling the editor directly to HWP
> structures.

## 1. Product Vision

**Positioning**

> A modern Word-like desktop editor that can open, edit, render, and
> save Korean HWP/HWPX documents with high fidelity.

**Core principle**

``` text
HWP/HWPX/DOCX
      ↓
 Format Adapter
      ↓
 Internal Document Model
      ↓
 Editing Engine
      ↓
 Layout + Pagination
      ↓
 Rendering
      ↓
 Word-like UI
```

The UI must not depend directly on HWP internals.

------------------------------------------------------------------------

## 2. Recommended Technology Stack

  Layer                Technology
  -------------------- ----------------------------
  Language             C++20/23
  Desktop UI           Qt 6
  Text shaping         HarfBuzz
  Font rasterization   FreeType
  Unicode              ICU / Qt Unicode
  Build                CMake
  Testing              GoogleTest
  Primary formats      HWP5, HWPX
  Secondary format     DOCX
  PDF                  Qt / dedicated PDF backend

**Important:** Qt is the application/UI framework, not the document
engine.

------------------------------------------------------------------------

## 3. High-Level Architecture

``` text
┌─────────────────────────────────────────────────────────────┐
│                         APPLICATION                         │
│       MainWindow / Ribbon / Toolbar / Panels / StatusBar   │
│                            Qt 6                             │
└──────────────────────────────┬──────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                       EDITOR ENGINE                         │
│ Selection / Cursor / Commands / Undo / Redo / Clipboard    │
└──────────────────────────────┬──────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                       DOCUMENT MODEL                        │
│ Document / Section / Paragraph / Run / Table / Image        │
│ Shape / StyleSheet / MediaStore / Metadata                  │
└──────────────────────────────┬──────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                         LAYOUT ENGINE                       │
│ Text Shaping → Line Breaking → Paragraph → Table → Page    │
│ Layout → Pagination                                         │
└──────────────────────────────┬──────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────┐
│                       RENDERING ENGINE                      │
│             HarfBuzz + FreeType + Qt/PDF                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                        FORMAT ENGINE                        │
│ HWP5 Reader/Writer │ HWPX Reader/Writer │ DOCX Reader/Writer│
└─────────────────────────────────────────────────────────────┘
```

------------------------------------------------------------------------

## 4. Repository Structure

``` text
hwpword/
├── CMakeLists.txt
├── README.md
│
├── apps/
│   └── desktop/
│       ├── main.cpp
│       ├── MainWindow.h
│       ├── MainWindow.cpp
│       ├── ribbon/
│       ├── dialogs/
│       ├── panels/
│       └── commands/
│
├── engine/
│   ├── core/
│   │   ├── Document.h/.cpp
│   │   ├── Section.h/.cpp
│   │   ├── Paragraph.h/.cpp
│   │   ├── Run.h/.cpp
│   │   ├── Table.h/.cpp
│   │   ├── TableCell.h/.cpp
│   │   ├── Image.h/.cpp
│   │   ├── Shape.h/.cpp
│   │   ├── Hyperlink.h/.cpp
│   │   ├── StyleSheet.h/.cpp
│   │   ├── PageSettings.h/.cpp
│   │   └── Metadata.h/.cpp
│   │
│   ├── text/
│   │   ├── Font.h/.cpp
│   │   ├── TextStyle.h/.cpp
│   │   ├── TextShaper.h
│   │   ├── HarfBuzzTextShaper.h/.cpp
│   │   ├── GlyphRun.h/.cpp
│   │   └── LineBreaker.h/.cpp
│   │
│   ├── layout/
│   │   ├── LayoutEngine.h/.cpp
│   │   ├── ParagraphLayout.h/.cpp
│   │   ├── TableLayout.h/.cpp
│   │   ├── PageLayout.h/.cpp
│   │   ├── PaginationEngine.h/.cpp
│   │   ├── LayoutBox.h/.cpp
│   │   └── DocumentLayout.h/.cpp
│   │
│   ├── render/
│   │   ├── Renderer.h
│   │   ├── QtRenderer.h/.cpp
│   │   ├── PdfRenderer.h/.cpp
│   │   └── PaintContext.h/.cpp
│   │
│   ├── editing/
│   │   ├── Editor.h/.cpp
│   │   ├── Cursor.h/.cpp
│   │   ├── Position.h/.cpp
│   │   ├── Selection.h/.cpp
│   │   ├── Clipboard.h/.cpp
│   │   └── FindReplace.h/.cpp
│   │
│   ├── commands/
│   │   ├── Command.h
│   │   ├── InsertTextCommand.h/.cpp
│   │   ├── DeleteTextCommand.h/.cpp
│   │   ├── FormatTextCommand.h/.cpp
│   │   ├── InsertTableCommand.h/.cpp
│   │   └── UndoManager.h/.cpp
│   │
│   └── resources/
│       ├── FontManager.h/.cpp
│       └── ImageStore.h/.cpp
│
├── formats/
│   ├── common/
│   │   ├── FormatReader.h
│   │   ├── FormatWriter.h
│   │   └── FormatException.h
│   │
│   ├── hwp5/
│   │   ├── HwpReader.h/.cpp
│   │   ├── HwpWriter.h/.cpp
│   │   ├── compound/
│   │   ├── records/
│   │   └── mapping/
│   │       ├── HwpToDocument.h/.cpp
│   │       └── DocumentToHwp.h/.cpp
│   │
│   ├── hwpx/
│   │   ├── HwpxReader.h/.cpp
│   │   ├── HwpxWriter.h/.cpp
│   │   ├── XmlReader.h/.cpp
│   │   ├── XmlWriter.h/.cpp
│   │   └── mapping/
│   │
│   └── docx/
│       ├── DocxReader.h/.cpp
│       ├── DocxWriter.h/.cpp
│       └── mapping/
│
└── tests/
    ├── core/
    ├── text/
    ├── layout/
    ├── rendering/
    ├── hwp5/
    ├── hwpx/
    └── docx/
```

------------------------------------------------------------------------

## 5. Core Document Model

The internal model is the **single source of truth**.

``` cpp
class Document {
public:
    std::vector<Section> sections;
    StyleSheet styles;
    MediaStore media;
    Metadata metadata;
};
```

``` cpp
class Section {
public:
    PageSettings page;
    HeaderFooter headerFooter;
    std::vector<std::unique_ptr<Block>> blocks;
};
```

``` cpp
class Block {
public:
    virtual ~Block() = default;
};
```

``` cpp
class Paragraph : public Block {
public:
    std::vector<Run> runs;
    ParagraphStyle style;
};
```

``` cpp
class Run {
public:
    std::u32string text;
    CharacterStyle style;
};
```

``` cpp
class Table : public Block {
public:
    std::vector<TableRow> rows;
    TableProperties properties;
};
```

### Why Run matters

``` text
Paragraph
├── Run("Halo dunia, ")
│   └── normal
├── Run("ini")
│   └── bold
└── Run(" HWP.")
    └── normal
```

Do not store an entire paragraph as one string if formatting can differ
within it.

------------------------------------------------------------------------

## 6. Character and Paragraph Styles

``` cpp
class CharacterStyle {
public:
    Font font;
    float fontSize = 10.0f;
    bool bold = false;
    bool italic = false;
    bool underline = false;
    bool strike = false;
    Color textColor;
    Color backgroundColor;
};
```

``` cpp
class ParagraphStyle {
public:
    Alignment alignment;
    float leftIndent;
    float rightIndent;
    float firstLineIndent;
    float spacingBefore;
    float spacingAfter;
    LineSpacing lineSpacing;
    bool keepWithNext;
    bool keepTogether;
    NumberingStyle numbering;
};
```

This layer should model both HWP and Word concepts without becoming
format-specific.

------------------------------------------------------------------------

## 7. Text Engine

Do not implement complex text shaping from scratch.

``` text
Unicode
   ↓
HarfBuzz
   ↓
Glyph sequence
   ↓
Font metrics
   ↓
Line breaking
   ↓
Layout
```

``` cpp
class TextShaper {
public:
    virtual GlyphRun shape(
        const std::u32string& text,
        const Font& font
    ) = 0;

    virtual ~TextShaper() = default;
};
```

``` cpp
class HarfBuzzTextShaper : public TextShaper {
public:
    GlyphRun shape(
        const std::u32string& text,
        const Font& font
    ) override;
};
```

Use FreeType for font loading/metrics/rasterization.

------------------------------------------------------------------------

## 8. Layout Engine

The layout engine turns the document model into physical pages.

``` text
Document
   ↓
Paragraph
   ↓
Text shaping
   ↓
Glyphs
   ↓
Line breaking
   ↓
Lines
   ↓
Paragraph box
   ↓
Page
```

``` cpp
class LayoutEngine {
public:
    DocumentLayout layout(
        const Document& document,
        const LayoutOptions& options
    );
};
```

Main subsystems:

``` text
LayoutEngine
├── ParagraphLayout
├── TableLayout
├── ImageLayout
├── ShapeLayout
└── PaginationEngine
```

------------------------------------------------------------------------

## 9. Layout Boxes

``` cpp
class LayoutBox {
public:
    Rect bounds;
    virtual void paint(PaintContext& context) = 0;
    virtual ~LayoutBox() = default;
};
```

Hierarchy:

``` text
LayoutBox
├── PageBox
├── ParagraphBox
├── LineBox
├── TextBox
├── ImageBox
├── TableBox
└── ShapeBox
```

A rendered document should be represented by a `DocumentLayout`
containing page-level layout results.

------------------------------------------------------------------------

## 10. Pagination

Pagination determines exactly where content lands on each page.

``` text
PAGE 1
────────────────────────
Paragraph 1
Paragraph 2
Paragraph 3
Paragraph 4
────────────────────────

PAGE 2
────────────────────────
Paragraph 5
Paragraph 6
...
────────────────────────
```

The engine must eventually support:

-   page size
-   margins
-   section breaks
-   keep-with-next
-   keep-together
-   widow/orphan control
-   headers/footers
-   footnotes
-   tables spanning pages

Start with basic pagination and expand incrementally.

------------------------------------------------------------------------

## 11. Editing Engine

Never let Qt widgets directly mutate the document.

Use:

``` text
Keyboard / Mouse
       ↓
DocumentView
       ↓
Editor
       ↓
Command
       ↓
Document
       ↓
Layout invalidation
       ↓
Layout Engine
       ↓
Renderer
```

Example:

``` cpp
class InsertTextCommand : public Command {
public:
    void execute() override;
    void undo() override;
};
```

This gives clean Undo/Redo architecture.

------------------------------------------------------------------------

## 12. Cursor and Selection

``` cpp
struct Position {
    size_t section;
    size_t block;
    size_t run;
    size_t offset;
};
```

``` cpp
class Selection {
public:
    Position start;
    Position end;

    bool isCollapsed() const;
};
```

This allows precise editing such as:

``` text
Section 0
 └── Paragraph 5
      └── Run 2
           └── character offset 13
```

------------------------------------------------------------------------

## 13. HWP5 Format Engine

Do not map binary HWP directly into UI classes.

Use an intermediate pipeline:

``` text
.HWP
 ↓
Compound Storage
 ↓
Streams
 ↓
HWP Records
 ↓
HWP Intermediate Representation
 ↓
Document Model
```

Core interfaces:

``` cpp
class HwpReader {
public:
    Document read(const std::filesystem::path& path);
};
```

``` cpp
class HwpWriter {
public:
    void write(
        const Document& document,
        const std::filesystem::path& path
    );
};
```

HWP-specific parsing belongs under:

``` text
formats/hwp5/
├── compound/
├── records/
└── mapping/
```

Example record abstraction:

``` cpp
class HwpRecord {
public:
    uint16_t tag;
    uint32_t level;
    uint32_t size;
    std::vector<std::byte> payload;
};
```

------------------------------------------------------------------------

## 14. HWP Mapping Layer

Keep HWP semantics isolated:

``` cpp
class HwpToDocument {
public:
    Document convert(const HwpFile& hwp);
};
```

``` cpp
class DocumentToHwp {
public:
    HwpFile convert(const Document& document);
};
```

Pipeline:

``` text
HWP binary
   ↓
HwpReader
   ↓
HWP records
   ↓
HwpToDocument
   ↓
Document
```

Saving:

``` text
Document
   ↓
DocumentToHwp
   ↓
HWP records
   ↓
HwpWriter
   ↓
.HWP
```

------------------------------------------------------------------------

## 15. HWPX

Treat HWPX as a separate adapter:

``` text
formats/hwpx/
├── HwpxReader
├── HwpxWriter
├── XmlReader
├── XmlWriter
└── mapping/
```

Pipeline:

``` text
.HWPX
 ↓
XML/package parser
 ↓
HWPX representation
 ↓
Document Model
```

HWPX is an especially useful early target because it is structurally
easier to inspect and process than legacy binary HWP.

------------------------------------------------------------------------

## 16. DOCX

DOCX should also map into the same model:

``` text
DOCX
 ↓
OOXML parser
 ↓
Document Model
```

Never create a separate editor engine for DOCX.

The editor always operates on:

``` text
Document
```

not:

``` text
HwpDocument
DocxDocument
HwpxDocument
```

------------------------------------------------------------------------

## 17. Rendering

``` cpp
class Renderer {
public:
    virtual void render(
        const DocumentLayout& layout,
        PaintContext& context
    ) = 0;

    virtual ~Renderer() = default;
};
```

Qt implementation:

``` cpp
class QtRenderer : public Renderer {
public:
    void render(
        const DocumentLayout& layout,
        PaintContext& context
    ) override;
};
```

The UI asks the renderer to paint a `DocumentLayout`; it does not know
HWP internals.

------------------------------------------------------------------------

## 18. Desktop UI

``` cpp
class DocumentView : public QWidget {
protected:
    void paintEvent(QPaintEvent*) override;
    void keyPressEvent(QKeyEvent*) override;
    void mousePressEvent(QMouseEvent*) override;
};
```

UI components:

``` text
MainWindow
├── Ribbon
│   ├── Home
│   ├── Insert
│   ├── Layout
│   ├── References
│   ├── Review
│   └── View
│
├── DocumentView
├── NavigationPanel
├── PropertiesPanel
├── StatusBar
└── Rulers
```

The visual language can be strongly inspired by modern Word without
coupling the engine to the UI.

------------------------------------------------------------------------

## 19. Module Dependencies

``` text
                    APPLICATION
                         ↓
                         UI
                         ↓
                      EDITOR
                         ↓
                      COMMANDS
                         ↓
                  DOCUMENT MODEL
                    ↙         ↘
                LAYOUT       FORMATS
                   ↓             ↓
                RENDER       HWP/HWPX/DOCX
                   ↓
             HarfBuzz/FreeType
```

Rules:

1.  `core` never depends on HWP.
2.  `core` never depends on Qt UI classes.
3.  `formats` depend on `core`, not the reverse.
4.  `layout` consumes the document model.
5.  `render` consumes layout results.
6.  UI communicates through editor APIs.
7.  Undo/Redo operates through commands.

------------------------------------------------------------------------

## 20. CMake Targets

Recommended libraries:

``` text
hwpword-core
hwpword-text
hwpword-layout
hwpword-render
hwpword-editor
hwpword-hwp5
hwpword-hwpx
hwpword-docx
hwpword-desktop
```

Conceptually:

``` text
core
 ↑
text
 ↑
layout
 ↑
render
 ↑
editor
 ↑
desktop
```

Format adapters:

``` text
hwp5 ──┐
hwpx ──┼──→ core
docx ──┘
```

------------------------------------------------------------------------

# 21. Development Roadmap

## Phase 0 --- Foundation

**Goal:** Compile and establish architecture.

Deliver:

-   CMake project
-   Qt application
-   module boundaries
-   GoogleTest
-   basic `Document`
-   basic `Paragraph`
-   basic `Run`

Success criteria:

``` text
App opens
Document object exists
Unit tests pass
```

------------------------------------------------------------------------

## Phase 1 --- Text Editor MVP

Implement:

-   text insertion
-   deletion
-   cursor
-   selection
-   keyboard navigation
-   bold
-   italic
-   underline
-   font size
-   paragraph alignment
-   Undo/Redo

Success:

> A usable basic word processor exists without HWP yet.

------------------------------------------------------------------------

## Phase 2 --- Layout Engine

Implement:

-   font metrics
-   HarfBuzz shaping
-   line breaking
-   paragraphs
-   page size
-   margins
-   pagination
-   scrolling
-   page rendering

Success:

> The editor behaves like a real page-based document editor.

------------------------------------------------------------------------

## Phase 3 --- HWPX Import/Export

Implement:

-   package reader
-   XML reader
-   text
-   character styles
-   paragraph styles
-   basic images
-   sections
-   save

Success:

> Basic HWPX documents survive an open/edit/save cycle.

------------------------------------------------------------------------

## Phase 4 --- HWP5 Reader

Implement progressively:

1.  file/container parsing
2.  document metadata
3.  paragraph records
4.  text
5.  character shapes
6.  paragraph shapes
7.  styles
8.  images
9.  tables
10. headers/footers
11. sections

Success:

> Common real-world HWP files open correctly.

------------------------------------------------------------------------

## Phase 5 --- HWP5 Writer

Implement:

-   document serialization
-   styles
-   text
-   paragraphs
-   images
-   tables
-   sections
-   metadata

Critical test:

``` text
Original HWP
      ↓
Open
      ↓
Internal Model
      ↓
Save
      ↓
Generated HWP
      ↓
Open in Hancom
```

The generated file must be accepted by Hancom.

------------------------------------------------------------------------

## Phase 6 --- Advanced Layout

Implement:

-   complex tables
-   merged cells
-   page-spanning tables
-   headers/footers
-   footnotes
-   numbering
-   bullets
-   section breaks
-   floating images
-   shapes
-   text boxes
-   advanced Korean typography

------------------------------------------------------------------------

## Phase 7 --- DOCX

Add:

-   DOCX import
-   DOCX export
-   styles
-   tables
-   images
-   headers/footers
-   basic OOXML compatibility

------------------------------------------------------------------------

# 22. Compatibility Strategy

Do **not** promise 100% HWP compatibility early.

Measure compatibility by feature classes:

``` text
Level 1
Text + basic formatting

Level 2
Paragraph + page layout + images

Level 3
Tables + styles + sections

Level 4
Headers + footnotes + numbering + shapes

Level 5
High-fidelity round-trip compatibility
```

Build a corpus of real documents and regression-test every release.

------------------------------------------------------------------------

# 23. Golden Test Strategy

Create:

``` text
tests/data/hwp/
├── basic_text.hwp
├── korean_typography.hwp
├── formatting.hwp
├── tables.hwp
├── images.hwp
├── headers.hwp
├── footnotes.hwp
├── sections.hwp
└── complex_real_world_*.hwp
```

For every file:

``` text
HWP
 ↓
Reader
 ↓
Document Model
 ↓
Layout
 ↓
Render
 ↓
Compare
```

And for round-trip:

``` text
HWP
 ↓
Read
 ↓
Write
 ↓
HWP
 ↓
Read again
 ↓
Compare semantic model
```

This becomes the core quality system.

------------------------------------------------------------------------

# 24. Performance Rules

Design for large documents from day one.

Use:

-   lazy layout
-   incremental layout
-   dirty regions
-   dirty paragraphs
-   cached glyph runs
-   cached font metrics
-   page-level layout cache
-   immutable/shared resources where useful

Avoid recalculating the entire document after every keystroke.

Preferred:

``` text
User types
 ↓
Dirty Paragraph
 ↓
Relayout affected region
 ↓
Recalculate affected pages
 ↓
Repaint affected region
```

Not:

``` text
User types
 ↓
Relayout entire 500-page document
```

------------------------------------------------------------------------

# 25. Ownership Strategy

Prefer simple ownership:

``` text
Document
 └── owns Sections
      └── owns Blocks
           └── owns Runs
```

Use:

``` cpp
std::unique_ptr<T>
```

for tree ownership.

Use `shared_ptr` only where shared lifetime is genuinely required, such
as selected immutable resources or cached assets.

Avoid making the entire document a graph of `shared_ptr`.

------------------------------------------------------------------------

# 26. Most Important Architectural Decision

The application should be:

``` text
                WORD-LIKE EDITOR
                       │
                 Document Model
                       │
       ┌───────────────┼────────────────┐
       ↓               ↓                ↓
      HWP             HWPX             DOCX
    Adapter          Adapter          Adapter
```

Not:

``` text
                 HWP EDITOR
                     │
                  HWP Model
                     │
             Everything depends
                  on HWP
```

The first architecture gives the product room to evolve.

------------------------------------------------------------------------

# 27. MVP Definition

The first genuinely useful release should target:

``` text
✓ Windows desktop
✓ Word-like page UI
✓ Open HWPX
✓ Edit text
✓ Korean fonts
✓ Bold / italic / underline
✓ Paragraph alignment
✓ Font size
✓ Images
✓ Basic tables
✓ Page layout
✓ Save HWPX
✓ Undo / Redo
✓ Copy / Paste
✓ Print / PDF
```

Then:

``` text
HWP5 compatibility
        ↓
Advanced HWP features
        ↓
DOCX compatibility
```

------------------------------------------------------------------------

# 28. First Coding Milestone

Do **not** start by writing the HWP parser.

Start here:

``` text
Milestone 1
───────────
CMake
Qt
Document
Section
Paragraph
Run
CharacterStyle
ParagraphStyle
Cursor
Selection
Editor
Command
UndoManager
DocumentView
```

Then prove:

``` text
Type Korean
      ↓
Apply bold
      ↓
Move cursor
      ↓
Select text
      ↓
Undo
      ↓
Redo
      ↓
Render on page
```

Only after this works should HWP parsing become the next major
subsystem.

------------------------------------------------------------------------

# 29. Target End-State

``` text
                         HWPWORD
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       Word UI         Document Engine     Format Engine
          │                 │                 │
       Qt 6           ┌─────┴─────┐      ┌────┼────┐
                      │           │      │    │    │
                   Editing      Layout  HWP  HWPX DOCX
                      │           │
                  Commands    Pagination
                  Undo/Redo    Tables
                  Selection    Text
                               Shaping
                                  │
                           HarfBuzz + FreeType
```

**North-star architecture:**

> **One internal document model. Multiple format adapters. One editing
> engine. One layout engine. Multiple renderers.**

That is the foundation that makes a serious HWP-compatible Word-like
editor maintainable and extensible.
