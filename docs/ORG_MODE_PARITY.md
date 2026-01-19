# Org-Mode Parity Analysis

## Current Implementation Status

### ✅ Implemented

| Feature | Status | Location |
|---------|--------|----------|
| Headlines (`*` prefix) | ✅ Done | `common/org_parser/engine.ts` |
| Infinite nesting | ✅ Done | Tree builder handles any depth |
| TODO states | ✅ Done | TODO, DONE, NEXT, WAITING, CANCELLED |
| Tags (`:tag1:tag2:`) | ✅ Done | Parsed and indexed |
| Property drawers | ✅ Done | `:PROPERTIES:...:END:` |
| Logbook | ✅ Done | `:LOGBOOK:` with CLOCK entries |
| Folding (headlines) | ✅ Done | CodeMirror foldService |
| Folding (drawers) | ✅ Done | Property/logbook folding |
| Syntax highlighting | ✅ Done | `web/cm_plugins/org_mode.ts` |
| Headline indexing | ✅ Done | `plugs/index/org_headline.ts` |
| Headline queries | ✅ Done | `queryObjects("org-headline", ...)` |
| Transclusion | ✅ Done | `${transclude [[Page#Headline]]}` |
| `.org` as default | ✅ Done | `PAGE_EXTENSION = ".org"` |

---

## 🔶 Partially Implemented (Needs Work)

### 1. Inline Markup
**Gap:** No inline parsing yet (bold, italic, links, timestamps)

```org
# Org-mode inline syntax:
*bold*  /italic/  _underline_  +strikethrough+  ~code~  =verbatim=
[[link][description]]
<2024-01-15 Mon>  [2024-01-15 Mon 10:00]
```

**Required:**
- Add Phase 2 inline parser (`common/org_parser/inline.ts`)
- CodeMirror decorations for inline elements
- Timestamp parsing and highlighting

**Effort:** Medium (200-300 lines)

---

### 2. Lists
**Gap:** Lists parsed as plain text, not structured

```org
- Unordered item
  - Nested item
1. Ordered item
   1. Nested ordered
- [ ] Checkbox unchecked
- [X] Checkbox checked
```

**Required:**
- Add list parsing to line classifier
- Checkbox state tracking
- List manipulation commands (indent/outdent)

**Effort:** Medium (150-200 lines)

---

### 3. Blocks
**Gap:** No special block handling

```org
#+BEGIN_SRC python
def hello():
    print("world")
#+END_SRC

#+BEGIN_QUOTE
A quote block
#+END_QUOTE

#+BEGIN_EXAMPLE
Verbatim example
#+END_EXAMPLE
```

**Required:**
- Block delimiter parsing in engine
- Syntax highlighting for code blocks
- Language-specific highlighting inside blocks

**Effort:** Medium-High (300-400 lines)

---

## ❌ Not Implemented (Major Features)

### 4. Timestamps & Scheduling
**Gap:** Core org-mode feature for task management

```org
* TODO Task
SCHEDULED: <2024-01-20 Sat>
DEADLINE: <2024-01-25 Thu>

* Meeting <2024-01-15 Mon 10:00-11:00>
```

**Required:**
- Timestamp pattern recognition
- Date picker integration
- Scheduled/deadline as first-class properties
- Calendar/agenda view (future)

**Effort:** High (500+ lines)

---

### 5. Tables
**Gap:** Org tables are powerful spreadsheet-like structures

```org
| Name  | Age | City     |
|-------+-----+----------|
| Alice |  30 | New York |
| Bob   |  25 | London   |
#+TBLFM: @3$2=@2$2+5
```

**Required:**
- Table parsing
- Cell navigation
- Column alignment
- Formula evaluation (complex)

**Effort:** Very High (1000+ lines for full support)

---

### 6. Links
**Gap:** Org has a rich link system

```org
[[file:./other.org][Other file]]
[[file:image.png]]
[[https://example.com][Website]]
[[id:unique-id]]
[[*Headline][Internal link]]
[[#custom-id]]
```

**Required:**
- Link syntax parsing
- Link following/navigation
- ID property generation
- Custom ID support

**Effort:** Medium-High (300-400 lines)

---

### 7. Capture Templates
**Gap:** Quick capture is essential org workflow

```org
;; Capture to specific headline
* Inbox
** Captured item <timestamp>
   %?
```

**Required:**
- Capture command
- Template system
- Target selection (file, headline, date tree)
- Refile command

**Effort:** High (400-500 lines)

---

### 8. Agenda Views
**Gap:** The killer feature of org-mode

- Daily/weekly agenda
- TODO list across files
- Stuck projects
- Tag/property filtering
- Custom agenda commands

**Required:**
- Query engine for scheduled/deadline items
- Multi-file aggregation
- Custom view rendering
- Keybindings for agenda navigation

**Effort:** Very High (1500+ lines)

---

### 9. Clocking & Time Reports
**Gap:** Time tracking is working but reporting is missing

```org
* Task
:LOGBOOK:
CLOCK: [2024-01-15 Mon 10:00]--[2024-01-15 Mon 11:30] =>  1:30
:END:

;; Clock reports
#+BEGIN: clocktable :scope subtree :maxlevel 2
...
#+END:
```

**Required:**
- Clock in/out commands
- Clock table generation
- Time aggregation across headlines
- Report formatting

**Effort:** High (400-500 lines)

---

### 10. Export
**Gap:** Org's export system is comprehensive

- HTML export
- PDF (via LaTeX)
- Markdown
- Plain text
- Custom backends

**Required:**
- Export dispatcher
- HTML renderer
- Template system for exports

**Effort:** Very High (1000+ lines for HTML alone)

---

## Priority Roadmap

### Phase 1: Core Editing (Current)
1. ✅ Headlines & nesting
2. ✅ Property drawers
3. ✅ Logbook
4. ✅ Folding
5. ✅ Indexing & queries
6. ✅ Transclusion

### Phase 2: Rich Text
1. 🔶 Inline markup (bold, italic, etc.)
2. 🔶 Links (internal, external)
3. 🔶 Timestamps
4. 🔶 Lists with checkboxes

### Phase 3: Task Management
1. ❌ Scheduling (SCHEDULED/DEADLINE)
2. ❌ Date picker
3. ❌ Basic agenda view (today, week)
4. ❌ Clock in/out commands

### Phase 4: Advanced
1. ❌ Tables
2. ❌ Code blocks with syntax highlighting
3. ❌ Capture templates
4. ❌ Refile
5. ❌ Clock reports

### Phase 5: Full Parity
1. ❌ Full agenda system
2. ❌ Export backends
3. ❌ Advanced link types
4. ❌ Column view

---

## Architecture Decisions

### Why Line-Based Parsing Works

Org-mode's structure is determined by line prefixes:
- `*` = headline
- `-`, `+`, `1.` = list
- `|` = table
- `#+` = directive

This means:
- **No complex grammar needed** - just pattern matching
- **Incremental updates are cheap** - reparse only changed lines
- **Tree structure is derived** - from headline levels

### Integration Points

| Component | Purpose | Status |
|-----------|---------|--------|
| `OrgEngine` | Core parser | ✅ |
| `orgModePlugin` | CodeMirror integration | ✅ |
| `indexOrgHeadlines` | Query system | ✅ |
| `transcludeWidget` | Content embedding | ✅ |
| Inline parser | Phase 2 markup | 🔶 Planned |
| Agenda view | Task dashboard | ❌ Planned |

---

## Estimated Total Effort

| Phase | Lines of Code | Complexity |
|-------|---------------|------------|
| Phase 1 (done) | ~1000 | Medium |
| Phase 2 | ~500 | Medium |
| Phase 3 | ~800 | High |
| Phase 4 | ~1500 | High |
| Phase 5 | ~2500 | Very High |
| **Total** | **~6300** | - |

Full org-mode parity is a significant undertaking, but the foundation is solid and extensible.
