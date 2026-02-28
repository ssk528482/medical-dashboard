// notes.js — Medical Study OS
// Full logic for notes.html — DRILL-DOWN CARD NAVIGATION
// Depends on: data.js, utils.js, supabase.js, cloudinary.js,
//             noteSync.js, cardSync.js
// ─────────────────────────────────────────────────────────────────

// ── Module state ─────────────────────────────────────────────────
let _notesMeta       = [];
let _currentNote     = null;
let _currentSubject  = null;
let _currentUnit     = null;
let _currentChapter  = null;
let _currentNoteType = 'general';
let _noteTags        = [];
let _noteColor       = 'default';
let _isDirty         = false;
let _isSaving        = false;
let _autoSaveTimer   = null;
let _aiNoteResult    = '';
let _editMode        = false;    // read vs edit mode in note view
let _navStack        = [];       // track navigation level
let _focusMode       = false;    // fullscreen focus mode
let _activeTagFilter = null;     // tag filter in chapters view
let _findActive      = false;    // find-in-note overlay

// ─────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────

async function initNotes() {
  await _loadNotesMeta();

  // ── Restore view from URL params (permalink / refresh support) ──
  let p       = new URLSearchParams(window.location.search);
  let view    = p.get('view');
  let subject = p.get('subject');
  let unit    = p.get('unit');
  let chapter = p.get('chapter');
  let noteType = p.get('noteType') || 'general';

  let restored = false;
  if (view && view !== 'subjects') {
    try {
      switch (view) {
        case 'units':
          if (subject) { showUnitsView(subject, true); restored = true; }
          break;
        case 'chapters':
          if (subject && unit) { showChaptersView(subject, unit, true); restored = true; }
          break;
        case 'note-types':
          if (subject && unit && chapter) { await showNoteTypesView(subject, unit, chapter, true); restored = true; }
          break;
        case 'unit-note-types':
          if (subject && unit) { await showUnitNoteTypesView(subject, unit, true); restored = true; }
          break;
        case 'unit-notes-by-type':
          if (subject && unit) { await openUnitNotesByType(subject, unit, noteType, true); restored = true; }
          break;
        case 'unit-stack':
          if (subject && unit) { await openUnitView(subject, unit, true); restored = true; }
          break;
        case 'note':
          if (subject && unit && chapter) { await openNote(subject, unit, chapter, noteType, true); restored = true; }
          break;
        case 'search':
          // Can't restore a search — fall through to subjects
          break;
      }
    } catch (e) {
      console.warn('Notes: failed to restore view from URL', e);
    }
  }

  if (!restored) showSubjectsView(true);

  // ── Browser back / forward ──────────────────────────────────────
  window.addEventListener('popstate', async function(e) {
    let st = e.state;
    if (!st || !st.view) { showSubjectsView(true); return; }
    try {
      switch (st.view) {
        case 'subjects':           showSubjectsView(true); break;
        case 'units':              showUnitsView(st.subject, true); break;
        case 'chapters':           showChaptersView(st.subject, st.unit, true); break;
        case 'note-types':         await showNoteTypesView(st.subject, st.unit, st.chapter, true); break;
        case 'unit-note-types':    await showUnitNoteTypesView(st.subject, st.unit, true); break;
        case 'unit-notes-by-type': await openUnitNotesByType(st.subject, st.unit, st.noteType || 'general', true); break;
        case 'unit-stack':         await openUnitView(st.subject, st.unit, true); break;
        case 'note':               await openNote(st.subject, st.unit, st.chapter, st.noteType || 'general', true); break;
        default:                   showSubjectsView(true);
      }
    } catch (err) {
      console.warn('Notes popstate restore failed:', err);
      showSubjectsView(true);
    }
  });
}

async function _loadNotesMeta() {
  let { data } = await fetchAllNotesMeta();
  _notesMeta = data || [];
}

// ─────────────────────────────────────────────────────────────────
// NAVIGATION LAYER
// ─────────────────────────────────────────────────────────────────

// Helper: switch visible view
function _showView(id) {
  ["view-subjects","view-units","view-chapters","view-note-types","view-note","view-search","view-unit-stack"]
    .forEach(v => {
      let el = document.getElementById(v);
      if (el) el.style.display = v === id ? "" : "none";
    });
}

// Feature 11 — push URL state so browser back/forward works
function _pushState(view, subject, unit, chapter, noteType) {
  let p = new URLSearchParams();
  p.set('view', view);
  if (subject)  p.set('subject',  subject);
  if (unit)     p.set('unit',     unit);
  if (chapter)  p.set('chapter',  chapter);
  if (noteType) p.set('noteType', noteType); // always store, including 'general'
  history.pushState({ view, subject, unit, chapter, noteType }, '',
    'notes.html?' + p.toString());
}

// Helper: build breadcrumb bar
function _setBreadcrumb(crumbs, showBack) {
  let pathEl = document.getElementById("notes-bc-path");
  let backEl = document.getElementById("notes-bc-back");
  if (pathEl) {
    pathEl.innerHTML = crumbs.map((c, i) =>
      `<span class="notes-bc-crumb${i === crumbs.length-1 ? " current" : ""}">${_esc(c)}</span>` +
      (i < crumbs.length-1 ? `<span class="notes-bc-sep">›</span>` : "")
    ).join("");
  }
  if (backEl) backEl.style.display = showBack ? "" : "none";
}

// ── Level 1: Subjects ──────────────────────────────────────────
function showSubjectsView(skipPush) {
  _navStack = ["subjects"];
  _activeTagFilter = null;
  if (!skipPush) _pushState('subjects');
  _setBreadcrumb(["📝 Notes"], false);
  _showView("view-subjects");
  document.getElementById("notes-search-bar").style.display = "";
  document.getElementById("notes-progress-bar").style.display = "";

  let subjects = studyData.subjects || {};
  let grid = document.getElementById("subjects-grid");
  if (!grid) return;

  // Progress: count chapters that have at least one note
  let totalChapters = 0, notedChapters = 0;
  Object.entries(subjects).forEach(([subjectName, s]) => s.units.forEach(u => {
    totalChapters += u.chapters.length;
    notedChapters += u.chapters.filter(ch =>
      _notesMeta.some(n => n.subject === subjectName && n.unit === u.name && n.chapter === ch.name)
    ).length;
  }));
  let pct = totalChapters > 0 ? Math.round(notedChapters / totalChapters * 100) : 0;
  let fillEl = document.getElementById("notes-progress-fill");
  let pctEl  = document.getElementById("notes-progress-pct");
  if (fillEl) fillEl.style.width = pct + "%";
  if (pctEl)  pctEl.textContent  = pct + "%";

  if (Object.keys(subjects).length === 0) {
    grid.innerHTML = `<div class="notes-empty" style="grid-column:1/-1"><div class="notes-empty-icon">📚</div><div class="notes-empty-text">No subjects yet</div><div class="notes-empty-sub">Add subjects in Syllabus first</div></div>`;
    return;
  }

  if (_focusMode) toggleFocusMode();

  // Feature 5 — recently edited panel (top 5)
  let recentPanel = document.getElementById('notes-recent-panel');
  if (recentPanel) {
    let recent = [..._notesMeta]
      .filter(n => n.updated_at)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 5);
    if (recent.length > 0) {
      recentPanel.style.display = '';
      const TI = { general: '\ud83d\udcdd', mnemonic: '\ud83e\udde0', high_yield: '\u2b50', summary: '\ud83d\udccb' };
      recentPanel.innerHTML =
        '<div class="notes-recent-label">\ud83d\udd52 Recently Edited</div><div class="notes-recent-chips">' +
        recent.map(n => {
          let icon = TI[n.note_type || 'general'] || '\ud83d\udcdd';
          return `<button class="notes-recent-chip" onclick="openNote('${_jesc(n.subject)}','${_jesc(n.unit)}','${_jesc(n.chapter)}','${n.note_type||'general'}')">${icon} <span class="notes-recent-chip-name">${_esc(n.chapter)}</span><span class="notes-recent-chip-sub">${_esc(n.subject)}</span></button>`;
        }).join('') + '</div>';
    } else {
      recentPanel.style.display = 'none';
    }
  }

  // Accent colors cycle
  const ACCENTS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899","#84cc16"];

  grid.innerHTML = Object.entries(subjects).map(([subjectName, subjectData], idx) => {
    let noteCount    = _notesMeta.filter(n => n.subject === subjectName).length;
    let topicCount   = subjectData.units.reduce((s, u) => s + u.chapters.length, 0);
    let unitCount    = subjectData.units.length;
    let accent       = ACCENTS[idx % ACCENTS.length];
    return `<div class="notes-subj-card" onclick="showUnitsView('${_jesc(subjectName)}')">
      <div class="notes-subj-card-accent" style="background:${accent};"></div>
      <div class="notes-subj-card-name">${_esc(subjectName)}</div>
      <div class="notes-subj-card-meta">
        <span class="notes-subj-card-badge">📝 ${noteCount} notes</span>
        <span class="notes-subj-card-badge"># ${topicCount} topics</span>
      </div>
    </div>`;
  }).join("");
}

// ── Level 2: Units ─────────────────────────────────────────────
function showUnitsView(subject, skipPush) {
  _currentSubject = subject;
  _navStack = ["subjects", "units"];
  if (!skipPush) _pushState('units', subject);
  _setBreadcrumb(["📝 Notes", subject], true);
  _showView("view-units");
  document.getElementById("notes-progress-bar").style.display = "none";

  let subjectData = studyData.subjects[subject];
  let grid = document.getElementById("units-grid");
  if (!grid || !subjectData) return;

  const ACCENTS = ["#3b82f6","#10b981","#f59e0b","#8b5cf6","#ef4444","#06b6d4","#ec4899","#84cc16"];

  grid.innerHTML = subjectData.units.map((unit, idx) => {
    let noteCount  = _notesMeta.filter(n => n.subject === subject && n.unit === unit.name).length;
    let chapCount  = unit.chapters.length;
    let accent     = ACCENTS[idx % ACCENTS.length];
    return `<div class="notes-unit-grid-card" onclick="showChaptersView('${_jesc(subject)}','${_jesc(unit.name)}')">
      <div class="notes-subj-card-accent" style="background:${accent};border-radius:var(--radius) var(--radius) 0 0;"></div>
      <div class="notes-unit-grid-card-name">${_esc(unit.name)}</div>
      <div class="notes-unit-grid-card-badge">${noteCount} notes · ${chapCount} chapters</div>
      <button class="notes-unit-bytype-btn" onclick="showUnitNoteTypesView('${_jesc(subject)}','${_jesc(unit.name)}');event.stopPropagation();" title="Browse all chapters by note type">📋 By Type</button>
      <span class="notes-unit-arrow">›</span>
    </div>`;
  }).join("");

  if (!subjectData.units.length) {
    grid.innerHTML = `<div class="notes-empty" style="grid-column:1/-1"><div class="notes-empty-icon">📂</div><div class="notes-empty-text">No units in ${_esc(subject)}</div></div>`;
  }
}

// ── Level 3: Chapters ──────────────────────────────────────────
function showChaptersView(subject, unit, skipPush) {
  _currentSubject = subject;
  _currentUnit    = unit;
  _navStack = ["subjects","units","chapters"];
  if (!skipPush) _pushState('chapters', subject, unit);
  _setBreadcrumb(["📝 Notes", subject, unit], true);
  _showView("view-chapters");
  document.getElementById("notes-progress-bar").style.display = "none";

  let subjectData = studyData.subjects[subject];
  let unitData    = subjectData?.units.find(u => u.name === unit);
  let chapters    = unitData?.chapters || [];
  let list        = document.getElementById("chapters-list");
  if (!list) return;

  // Feature 4 - tag filter bar
  _renderTagFilter(subject, unit);

  // Build note coverage map (first note per chapter for icon/meta)
  let coverMap = {};
  _notesMeta.filter(n => n.subject === subject && n.unit === unit)
    .forEach(n => { if (!coverMap[n.chapter]) coverMap[n.chapter] = n; });

  // Count distinct note entries per chapter (any type)
  let countMap = {};
  _notesMeta.filter(n => n.subject === subject && n.unit === unit)
    .forEach(n => { countMap[n.chapter] = (countMap[n.chapter] || 0) + 1; });

  if (!chapters.length) {
    list.innerHTML = '<div class="notes-empty"><div class="notes-empty-icon">📂</div><div class="notes-empty-text">No chapters in this unit</div></div>';
    return;
  }

  // Feature 4 - filter by active tag
  let displayChapters = _activeTagFilter
    ? chapters.filter(ch => coverMap[ch.name]?.tags?.includes(_activeTagFilter))
    : chapters;

  if (!displayChapters.length) {
    list.innerHTML = '<div class="notes-empty"><div class="notes-empty-icon">🏷️</div><div class="notes-empty-text">No chapters match tag "' + _esc(_activeTagFilter) + '"</div></div>';
    return;
  }

  let ui = subjectData?.units.findIndex(u => u.name === unit) ?? -1;

  list.innerHTML = displayChapters.map(ch => {
    let ci        = chapters.indexOf(ch);
    let note      = coverMap[ch.name];
    let color     = note?.color || 'default';
    let hasNote   = !!note;
    let noteCount = countMap[ch.name] || 0;

    // Study status
    let compActive = ch.status === 'completed';
    let r1Active   = ch.revisionIndex >= 1;
    let r2Active   = ch.revisionIndex >= 2;
    let r3Active   = ch.revisionIndex >= 3;

    // Feature 3 - revision date
    let revDateHtml = '';
    if (ch.nextRevision) {
      let isOverdue = ch.nextRevision < today();
      let d = new Date(ch.nextRevision + 'T12:00:00');
      let label = d.toLocaleDateString(undefined, { month:'short', day:'numeric' });
      let sty = isOverdue
        ? 'color:#ef4444;font-weight:700;background:rgba(239,68,68,0.1);padding:1px 5px;border-radius:4px;'
        : 'color:var(--text-dim);';
      revDateHtml = '<span style="font-size:10px;' + sty + 'margin-left:4px;">' + (isOverdue ? '⚠️' : '📅') + label + '</span>';
    }

    let noteCountBadge = noteCount > 0
      ? '<span style="font-size:9px;background:rgba(59,130,246,0.12);color:var(--blue);padding:1px 5px;border-radius:20px;margin-left:4px;">' + noteCount + '</span>'
      : '';

    // Feature 10 - status/revision action pills
    let pillsHtml = ui >= 0 ? (
      '<div class="notes-chap-pills">' +
      '<span class="notes-chap-pill comp' + (compActive ? ' active' : '') + '" title="Toggle complete" onclick="notesToggleChapterCompleted(\'' + _jesc(subject) + '\',' + ui + ',' + ci + ');event.stopPropagation();">✓</span>' +
      '<span class="notes-chap-pill r1' + (r1Active ? ' active' : '') + '" title="Mark R1" onclick="notesMarkChapterRevised(\'' + _jesc(subject) + '\',' + ui + ',' + ci + ',1);event.stopPropagation();">R1</span>' +
      '<span class="notes-chap-pill r2' + (r2Active ? ' active' : '') + '" title="Mark R2" onclick="notesMarkChapterRevised(\'' + _jesc(subject) + '\',' + ui + ',' + ci + ',2);event.stopPropagation();">R2</span>' +
      '<span class="notes-chap-pill r3' + (r3Active ? ' active' : '') + '" title="Mark R3" onclick="notesMarkChapterRevised(\'' + _jesc(subject) + '\',' + ui + ',' + ci + ',3);event.stopPropagation();">R3</span>' +
      '</div>'
    ) : '';

    return (
      '<div class="notes-chap-card' + (hasNote ? ' has-note' : '') + '" onclick="showNoteTypesView(\'' + _jesc(subject) + '\',\'' + _jesc(unit) + '\',\'' + _jesc(ch.name) + '\')">' +
      '<span class="notes-chap-icon">' + (hasNote ? '📝' : '📄') + '</span>' +
      '<div style="flex:1;min-width:0;">' +
        '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:2px;">' +
          '<span class="notes-chap-name">' + _esc(ch.name) + '</span>' + noteCountBadge + revDateHtml +
        '</div>' +
        (note
          ? '<div class="notes-chap-meta">Updated ' + _formatDate(note.updated_at) + '</div>'
          : '<div class="notes-chap-meta" style="color:var(--text-dim)">No note — tap to create</div>') +
      '</div>' +
      '<div class="notes-chap-right">' +
        pillsHtml +
        '<span class="note-color-dot ' + color + '"></span>' +
      '</div>' +
      '</div>'
    );
  }).join('');
}
function notesBreadcrumbBack() {
  history.back();
}

// ── Level 2b: Unit Note Types (browse all chapters by type) ───────
async function showUnitNoteTypesView(subject, unit, skipPush) {
  if (_isDirty) {
    showConfirm('Unsaved Changes', 'You have unsaved changes. Discard them?', () => {
      _isDirty = false;
      showUnitNoteTypesView(subject, unit, skipPush);
    }, 'Discard');
    return;
  }

  _currentSubject = subject;
  _currentUnit    = unit;
  _currentChapter = null;
  _navStack = ["subjects","units","unit-note-types"];
  if (!skipPush) _pushState('unit-note-types', subject, unit);
  _setBreadcrumb(["📝 Notes", subject, unit, "By Type"], true);
  _showView("view-note-types");
  document.getElementById("notes-progress-bar").style.display = "none";

  let heading = document.getElementById('note-types-heading');
  if (heading) heading.textContent = unit + ' — All Chapters';

  let grid = document.getElementById('note-types-grid');
  if (!grid) return;

  grid.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px 0;">Loading...</div>';

  let { data: unitNotes } = await fetchUnitNotes(subject, unit);

  const NOTE_TYPES = [
    { type: 'general',    icon: '📝', label: 'General Notes',  desc: 'Full study notes & explanations' },
    { type: 'mnemonic',   icon: '🧠', label: 'Mnemonics',       desc: 'Memory aids & tricks' },
    { type: 'high_yield', icon: '⭐', label: 'High Yield',      desc: 'Exam-critical key points' },
    { type: 'summary',    icon: '📋', label: 'Summary',         desc: 'Quick overview & recap' },
  ];

  grid.innerHTML = NOTE_TYPES.map(({ type, icon, label, desc }) => {
    let typeNotes = (unitNotes || []).filter(n => (n.note_type || 'general') === type);
    let noteCount = typeNotes.length;
    return `<div class="notes-type-card${noteCount > 0 ? ' has-note' : ''}" onclick="openUnitNotesByType('${_jesc(subject)}','${_jesc(unit)}','${type}')">
      <div class="notes-type-card-icon">${icon}</div>
      <div class="notes-type-card-body">
        <div class="notes-type-card-label">${label}</div>
        <div class="notes-type-card-desc">${noteCount > 0 ? noteCount + ' chapter' + (noteCount !== 1 ? 's' : '') + ' with notes' : desc}</div>
      </div>
      <span class="notes-type-card-action">${noteCount > 0 ? 'View ›' : 'Browse'}</span>
    </div>`;
  }).join('');
}

// ── Level 3b: All chapters of a unit for a given note type ────────
async function openUnitNotesByType(subject, unit, noteType, skipPush) {
  if (_isDirty) {
    showConfirm('Unsaved Changes', 'You have unsaved changes. Discard them?', () => {
      _isDirty = false;
      openUnitNotesByType(subject, unit, noteType, skipPush);
    }, 'Discard');
    return;
  }

  noteType = noteType || 'general';
  _currentSubject  = subject;
  _currentUnit     = unit;
  _currentChapter  = null;
  _currentNoteType = noteType;
  _navStack        = ["subjects","units","unit-note-types","unit-notes-by-type"];

  const TYPE_LABELS = { general: 'General Notes', mnemonic: 'Mnemonics', high_yield: 'High Yield', summary: 'Summary' };
  _setBreadcrumb(["📝 Notes", subject, unit, TYPE_LABELS[noteType] || noteType], true);
  _showUnitView();
  if (!skipPush) _pushState('unit-notes-by-type', subject, unit, null, noteType);

  document.getElementById("unit-view-title").textContent = unit + ' — ' + (TYPE_LABELS[noteType] || noteType);

  let { data: notes } = await fetchUnitNotes(subject, unit);

  let subjectData = studyData.subjects[subject];
  let unitData    = subjectData?.units.find(u => u.name === unit);
  let chapters    = unitData?.chapters || [];

  let container = document.getElementById("unit-cards-container");
  container.innerHTML = "";

  if (chapters.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:30px;font-size:13px;">No chapters in this unit.</div>`;
    return;
  }

  // Build note map for this type only
  let noteMap = {};
  (notes || []).filter(n => (n.note_type || 'general') === noteType)
    .forEach(n => { noteMap[n.chapter] = n; });

  const TI = { general: '📝', mnemonic: '🧠', high_yield: '⭐', summary: '📋' };
  let typeIcon = TI[noteType] || '📝';

  chapters.forEach(chapter => {
    let note  = noteMap[chapter.name];
    let color = note?.color || "default";

    let colorBorder = {
      default: "var(--border)",
      red:     "rgba(239,68,68,0.4)",
      yellow:  "rgba(245,158,11,0.4)",
      green:   "rgba(16,185,129,0.4)",
      blue:    "rgba(59,130,246,0.4)",
    }[color] || "var(--border)";

    let card = document.createElement("div");
    card.className = "notes-unit-card";
    card.style.borderColor = colorBorder;

    if (note && note.content) {
      let _ltxContent = (typeof latexToUnicode === 'function') ? latexToUnicode(note.content) : note.content;
      let rendered = typeof marked !== 'undefined' ? marked.parse(_ltxContent) : _ltxContent.replace(/\n/g, '<br>');
      card.innerHTML = `
        <div class="notes-unit-card-header" style="cursor:pointer;">
          <span class="note-color-dot ${color}"></span>
          <div class="notes-unit-card-title" style="flex:1;">${typeIcon} ${_esc(chapter.name)}</div>
          <button class="notes-collapse-btn" onclick="_toggleUnitCard(this,event)" title="Collapse/Expand">▾</button>
        </div>
        <div class="notes-unit-card-body">
          ${note.tags?.length ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">${note.tags.map(t => `<span style="background:rgba(59,130,246,0.12);color:var(--blue);border-radius:20px;padding:1px 8px;font-size:10px;font-weight:700;">${_esc(t)}</span>`).join("")}</div>` : ""}
          <div class="notes-read-body" style="margin-top:6px;">${rendered}</div>
          <div style="margin-top:8px;font-size:11px;color:var(--text-dim);">Updated: ${_formatDate(note.updated_at)}</div>
        </div>
      `;
    } else {
      card.innerHTML = `
        <div class="notes-unit-card-header">
          <span class="note-color-dot default"></span>
          <div class="notes-unit-card-title">${typeIcon} ${_esc(chapter.name)}</div>
          <span style="font-size:10px;color:var(--text-dim);">No note yet</span>
        </div>
        <div class="notes-unit-card-preview" style="color:var(--text-dim);">Click to create a ${_esc(TYPE_LABELS[noteType] || noteType)} note for this chapter.</div>
      `;
    }

    card.onclick = () => openNote(subject, unit, chapter.name, noteType);
    container.appendChild(card);
  });
}

function _toggleUnitCard(btn, event) {
  event.stopPropagation();
  let body = btn.closest('.notes-unit-card')?.querySelector('.notes-unit-card-body');
  if (!body) return;
  let collapsed = body.style.display === 'none';
  body.style.display = collapsed ? '' : 'none';
  btn.textContent = collapsed ? '▾' : '▸';
  btn.title = collapsed ? 'Collapse' : 'Expand';
}

// ─────────────────────────────────────────────────────────────────
// OPEN NOTE
// ─────────────────────────────────────────────────────────────────

async function openNote(subject, unit, chapter, noteType, skipPush) {
  noteType = noteType || 'general';
  if (_isDirty) {
    showConfirm('Unsaved Changes', 'You have unsaved changes. Discard them?', () => {
      _isDirty = false;
      openNote(subject, unit, chapter, noteType, skipPush);
    }, 'Discard');
    return;
  }

  _currentSubject  = subject;
  _currentUnit      = unit;
  _currentChapter   = chapter;
  _currentNoteType  = noteType;
  _editMode         = false;
  _navStack         = ["subjects","units","chapters","note-types","note"];

  const TYPE_LABELS = { general: 'General', mnemonic: 'Mnemonic', high_yield: 'High Yield', summary: 'Summary' };
  _setBreadcrumb(["Notes", subject, unit, chapter, TYPE_LABELS[noteType] || noteType], true);
  _showView("view-note");
  document.getElementById("notes-progress-bar").style.display = "none";
  document.getElementById("notes-note-topbar-title").textContent = chapter;

  // Note-type badge in topbar
  let typeLabel = document.getElementById('notes-note-type-label');
  if (typeLabel) {
    const TI = { general: '\ud83d\udcdd', mnemonic: '\ud83e\udde0', high_yield: '\u2b50', summary: '\ud83d\udccb' };
    typeLabel.textContent = TI[noteType] || '\ud83d\udcdd';
    typeLabel.style.display = '';
  }
  if (!skipPush) _pushState('note', subject, unit, chapter, noteType);

  // Load from Supabase
  setSaveStatus("Loading\u2026");
  let { data: note } = await fetchNote(subject, unit, chapter, noteType);
  _currentNote = note || null;

  // Populate fields
  document.getElementById("note-title-input").value    = note?.title   || "";
  document.getElementById("note-content-editor").value = note?.content || "";
  _noteTags  = note?.tags  || [];
  _noteColor = note?.color || "default";
  _renderTagChips();
  _setColorSwatchActive(_noteColor);
  setSaveStatus(note ? "Saved" : "");

  // Build font picker and apply font preference
  _buildFontPicker();
  // Start in read mode
  _enterReadMode();
}

// ── Read / Edit mode toggle ────────────────────────────────────
function _enterReadMode() {
  _editMode = false;
  let note = _currentNote;

  document.getElementById("notes-read-body").style.display   = "";
  document.getElementById("notes-edit-wrap").style.display   = "none";
  document.getElementById("notes-note-empty").style.display  = "none";
  document.getElementById("btn-save-note").style.display     = "none";
  document.getElementById("btn-cancel-edit").style.display   = "none";
  document.getElementById("btn-toggle-edit").style.display   = "";
  document.getElementById("btn-toggle-edit").classList.remove("active");
  let _delBtnR = document.getElementById("btn-delete-note");
  if (_delBtnR) _delBtnR.style.display = (note && note.id) ? "" : "none";

  // Show Note→Cards button only if note has content
  let n2cBtn = document.getElementById("btn-note-to-cards");
  if (n2cBtn) n2cBtn.style.display = (note && note.content && note.content.trim()) ? "" : "none";

  if (note && note.content) {
    let readEl  = document.getElementById("notes-read-body");
    let content = (typeof latexToUnicode === 'function')
      ? latexToUnicode(note.content)
      : note.content;
    if (typeof marked !== "undefined") {
      readEl.innerHTML = marked.parse(content);
    } else {
      readEl.innerHTML = content.replace(/\\n/g, "<br>");
    }
  } else {
    document.getElementById("notes-read-body").style.display  = "none";
    document.getElementById("notes-note-empty").style.display = "";
  }
}

function _enterEditMode() {
  _editMode = true;
  document.getElementById("notes-read-body").style.display   = "none";
  document.getElementById("notes-note-empty").style.display  = "none";
  document.getElementById("notes-edit-wrap").style.display   = "flex";
  document.getElementById("btn-save-note").style.display     = "";
  document.getElementById("btn-cancel-edit").style.display   = "";
  document.getElementById("btn-toggle-edit").classList.add("active");
  document.getElementById("btn-toggle-edit").textContent     = "✏️ Editing";
  let _delBtnE = document.getElementById("btn-delete-note");
  if (_delBtnE) _delBtnE.style.display = _currentNote?.id ? "" : "none";
  document.getElementById("note-content-editor").focus();
  _applyNotesFontToView(localStorage.getItem('_notesFont') || studyData.uiState?.notesFont || 'patrick-hand');
  _updateWordCount();
}

function toggleNoteEditMode() {
  if (_editMode) {
    _enterReadMode();
  } else {
    _enterEditMode();
  }
}

function cancelEdit() {
  if (_isDirty) {
    showConfirm('Discard Changes', 'Discard unsaved changes?', () => {
      _isDirty = false;
      document.getElementById("note-content-editor").value = _currentNote?.content || "";
      document.getElementById("note-title-input").value    = _currentNote?.title   || "";
      _noteTags  = _currentNote?.tags  || [];
      _noteColor = _currentNote?.color || "default";
      _renderTagChips();
      _setColorSwatchActive(_noteColor);
      _enterReadMode();
    }, 'Discard');
    return;
  }
  _enterReadMode();
}

// Legacy alias used by sidebar/unit-view paths
function _showEditorWrap() { _enterEditMode(); }
function _showUnitView() {
  _showView("view-unit-stack");
  document.getElementById("notes-progress-bar").style.display = "none";
}

// ─────────────────────────────────────────────────────────────────
// FONT PICKER
// ─────────────────────────────────────────────────────────────────

const _NOTE_FONTS = {
  'patrick-hand': "'Patrick Hand', cursive",
  schoolbell:     "'Schoolbell', cursive",
  system:         "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  serif:          "Georgia, Cambria, 'Times New Roman', serif",
  mono:           "'SF Mono', 'Fira Code', 'Courier New', monospace",
  verdana:        "Verdana, Geneva, Tahoma, sans-serif",
  dyslexic:       "Verdana, 'Comic Sans MS', Geneva, sans-serif",
};
const _NOTE_FONT_LABELS = {
  'patrick-hand': "Patrick Hand",
  schoolbell:     "Schoolbell",
  system:         "System",
  serif:          "Serif",
  mono:           "Monospace",
  verdana:        "Verdana",
  dyslexic:       "Dyslexia-friendly",
};

// Populate the font picker and apply the saved font preference
function _buildFontPicker() {
  let sel = document.getElementById('note-font-picker');
  if (!sel) return;
  // Local override (per device) takes priority; fall back to profile default, then 'patrick-hand'
  let current = localStorage.getItem('_notesFont') || studyData.uiState?.notesFont || 'patrick-hand';
  sel.innerHTML = Object.keys(_NOTE_FONTS).map(k =>
    `<option value="${k}"${k === current ? ' selected' : ''}>${_NOTE_FONT_LABELS[k]}</option>`
  ).join('');
  _applyNotesFontToView(current);
}

// Called by the <select> onchange — changes font locally (device-only, no cloud)
function applyNotesFont(font) {
  localStorage.setItem('_notesFont', font);
  _applyNotesFontToView(font);
}

function _applyNotesFontToView(font) {
  let family = _NOTE_FONTS[font] || _NOTE_FONTS.system;
  let readEl = document.getElementById('notes-read-body');
  let editEl = document.getElementById('note-content-editor');
  if (readEl) readEl.style.fontFamily = family;
  if (editEl) editEl.style.fontFamily = family;
}

// ─────────────────────────────────────────────────────────────────
// SAVE NOTE
// ─────────────────────────────────────────────────────────────────

async function deleteCurrentNote() {
  if (!_currentNote?.id) return;
  showConfirm('Delete Note', 'Delete this note permanently? This cannot be undone.', async () => {
    setSaveStatus("Deleting…");
    const userId = (await supabaseClient.auth.getUser()).data?.user?.id;
    if (userId) {
      await supabaseClient.from('notes').delete()
        .eq('user_id', userId)
        .eq('subject', _currentSubject)
        .eq('unit',    _currentUnit)
        .eq('chapter', _currentChapter)
        .eq('note_type', _currentNoteType || 'general');
    } else {
      await deleteNote(_currentNote.id);
    }
    _currentNote = null;
    _isDirty     = false;
    setSaveStatus("Note deleted ✓");
    await _loadNotesMeta();
    document.getElementById("note-content-editor").value = "";
    document.getElementById("note-title-input").value    = "";
    _noteTags  = [];
    _noteColor = "default";
    _renderTagChips();
    _setColorSwatchActive(_noteColor);
    _enterReadMode();
  }, 'Delete', true);
}

async function saveCurrentNote(fromAutosave = false) {
  if (!_currentSubject) return;
  if (_isSaving) return; // prevent concurrent saves
  _isSaving = true;

  let title   = document.getElementById("note-title-input").value.trim();
  let content = document.getElementById("note-content-editor").value;
  let contentTrimmed = content.trim();

  setSaveStatus("Saving…");
  document.getElementById("btn-save-note").disabled = true;

  // If both title and content are empty AND we have an existing note, delete it
  if (!contentTrimmed && !title && _currentNote?.id) {
    // Delete this note and any duplicates for the same chapter
    const userId = (await supabaseClient.auth.getUser()).data?.user?.id;
    if (userId) {
      await supabaseClient.from('notes').delete()
        .eq('user_id', userId)
        .eq('subject', _currentSubject)
        .eq('unit', _currentUnit)
        .eq('chapter', _currentChapter)
        .eq('note_type', _currentNoteType || 'general');
    } else {
      await deleteNote(_currentNote.id);
    }
    document.getElementById("btn-save-note").disabled = false;
    _isSaving = false;
    _currentNote = null;
    _isDirty     = false;
    setSaveStatus("Note cleared ✓");
    await _loadNotesMeta();
    if (!fromAutosave) _enterReadMode();
    return;
  }

  // If content is empty and there's no existing note — nothing to save
  if (!contentTrimmed && !title && !_currentNote?.id) {
    document.getElementById("btn-save-note").disabled = false;
    _isSaving = false;
    setSaveStatus("");
    if (!fromAutosave) _enterReadMode();
    return;
  }

  let payload = {
    id:        _currentNote?.id || undefined,
    subject:   _currentSubject,
    unit:      _currentUnit,
    chapter:   _currentChapter,
    note_type: _currentNoteType || 'general',
    title:     title || _currentChapter,
    content,
    images:    _currentNote?.images || [],
    color:     _noteColor,
    tags:      _noteTags,
  };

  let { data, error } = await saveNote(payload);

  document.getElementById("btn-save-note").disabled = false;
  _isSaving = false;

  if (error) {
    setSaveStatus("Save failed ✗");
    console.error("saveCurrentNote:", error);
    return;
  }

  _currentNote = data;
  _isDirty     = false;
  setSaveStatus("Saved ✓");

  await _loadNotesMeta();
  if (!fromAutosave) _enterReadMode();
}

// Auto-save after 2 seconds of inactivity
function markDirty() {
  _isDirty = true;
  setSaveStatus("Unsaved…");
  _updateWordCount();
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    if (_isDirty && _currentSubject && !_isSaving) saveCurrentNote(true);
  }, 2000);
}

function _updateWordCount() {
  let el = document.getElementById('note-word-count');
  if (!el) return;
  let text = (document.getElementById('note-content-editor')?.value || '').trim();
  if (!text) { el.textContent = ''; return; }
  let words = text.split(/\s+/).filter(Boolean).length;
  let chars = text.length;
  el.textContent = words + ' w · ' + chars + ' c';
}

function setSaveStatus(msg) {
  let el = document.getElementById('notes-save-status');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('saved-flash');
  if (msg === 'Saved \u2713') {
    void el.offsetWidth; // force reflow to restart animation
    el.classList.add('saved-flash');
  }
}

// ─────────────────────────────────────────────────────────────────
// MARKDOWN PREVIEW (legacy toggle — kept for AI note modal)
// ─────────────────────────────────────────────────────────────────

function togglePreview() {
  // In new layout, preview is always the read view
  // This is only called from AI note modal flow — no-op here
}

// ─────────────────────────────────────────────────────────────────
// COLOR LABELS
// ─────────────────────────────────────────────────────────────────

function setNoteColor(color, swatchEl) {
  _noteColor = color;
  _setColorSwatchActive(color);
  markDirty();
}

function _setColorSwatchActive(color) {
  document.querySelectorAll(".note-color-swatch").forEach(sw => {
    sw.classList.toggle("active", sw.dataset.color === color);
  });
}

// ─────────────────────────────────────────────────────────────────
// TAGS
// ─────────────────────────────────────────────────────────────────

function handleNoteTagInput(event) {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    let val = event.target.value.trim().replace(/,$/, "");
    if (val && !_noteTags.includes(val)) {
      _noteTags.push(val);
      _renderTagChips();
      markDirty();
    }
    event.target.value = "";
  } else if (event.key === "Backspace" && event.target.value === "" && _noteTags.length > 0) {
    _noteTags.pop();
    _renderTagChips();
    markDirty();
  }
}

function removeNoteTag(index) {
  _noteTags.splice(index, 1);
  _renderTagChips();
  markDirty();
}

function _renderTagChips() {
  let wrap  = document.getElementById("notes-tag-wrap");
  let input = document.getElementById("notes-tag-input");
  if (!wrap || !input) return;

  // Remove existing chips (keep the input)
  wrap.querySelectorAll(".notes-tag-chip").forEach(c => c.remove());

  _noteTags.forEach((tag, i) => {
    let chip = document.createElement("span");
    chip.className = "notes-tag-chip";
    chip.innerHTML = `${_esc(tag)}<span class="notes-tag-chip-x" onclick="removeNoteTag(${i})">✕</span>`;
    wrap.insertBefore(chip, input);
  });
}

// ─────────────────────────────────────────────────────────────────
// IMAGE UPLOAD (Ctrl+V paste + file picker)
// ─────────────────────────────────────────────────────────────────

function triggerImageUpload() {
  document.getElementById("note-img-file").click();
}

async function handleNoteImageUpload(inputEl) {
  let file = inputEl.files[0];
  if (!file) return;
  await _uploadAndInsertImage(file);
  inputEl.value = ""; // reset so same file can be re-selected
}

// Ctrl+V paste handler — attach on editor focus
document.addEventListener("paste", async function (e) {
  let editorActive = document.activeElement === document.getElementById("note-content-editor");
  if (!editorActive) return;

  // ── Image paste ──────────────────────────────────────────────
  let file = getImageFromClipboard(e);
  if (file) {
    e.preventDefault();
    await _uploadAndInsertImage(file);
    return;
  }

  // ── Text paste — strip LaTeX math into readable Unicode ──────
  let plain = e.clipboardData?.getData('text/plain');
  if (plain && typeof latexToUnicode === 'function') {
    let converted = latexToUnicode(plain);
    if (converted !== plain) {
      // Only intercept when something actually changed
      e.preventDefault();
      let editor = document.getElementById('note-content-editor');
      let start  = editor.selectionStart;
      let end    = editor.selectionEnd;
      let before = editor.value.substring(0, start);
      let after  = editor.value.substring(end);
      editor.value = before + converted + after;
      // Restore cursor after inserted text
      let pos = start + converted.length;
      editor.setSelectionRange(pos, pos);
      markDirty();
    }
  }
});

async function _uploadAndInsertImage(file) {
  if (!_currentSubject) {
    showToast("Open a note first before uploading images.", 'warn');
    return;
  }
  setSaveStatus("Uploading image…");
  try {
    let { url } = await uploadToCloudinary(file, CLOUDINARY_FOLDERS.NOTE_IMAGE);

    // Insert markdown image tag at cursor position in editor
    let editor = document.getElementById("note-content-editor");
    let pos    = editor.selectionStart;
    let before = editor.value.substring(0, pos);
    let after  = editor.value.substring(pos);
    let tag    = `\n![image](${url})\n`;
    editor.value = before + tag + after;

    // Track url in note images array
    if (_currentNote) {
      _currentNote.images = _currentNote.images || [];
      _currentNote.images.push(url);
    }

    setSaveStatus("Image inserted ✓");
    markDirty();
  } catch (err) {
    setSaveStatus("Image upload failed ✗");
    console.error("_uploadAndInsertImage:", err);
  }
}

// ─────────────────────────────────────────────────────────────────
// SEARCH
// ─────────────────────────────────────────────────────────────────

let _searchTimer = null;

async function handleNotesSearch(query) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    if (!query.trim()) {
      // Return to subjects view on clear
      showSubjectsView();
      return;
    }
    let { data } = await searchNotes(query);
    _renderSearchResults(data || [], query);
  }, 280);
}

function _renderSearchResults(results, query) {
  _navStack = ["search"];
  _setBreadcrumb(["📝 Notes", `Search: "${query}"`], true);
  _showView("view-search");
  document.getElementById("notes-progress-bar").style.display = "none";

  let container = document.getElementById("notes-search-results");
  if (!container) return;

  if (results.length === 0) {
    container.innerHTML = `<div class="notes-empty"><div class="notes-empty-icon">🔍</div><div class="notes-empty-text">No notes match "${_esc(query)}"</div></div>`;
    return;
  }

  container.innerHTML = `<div style="font-size:11px;color:var(--text-dim);padding:4px 0 10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;">${results.length} result${results.length !== 1 ? "s" : ""}</div>` +
    results.map(n => {
      let _rawContent = (typeof latexToUnicode === 'function') ? latexToUnicode(n.content || '') : (n.content || '');
      let preview = _rawContent.substring(0, 80).replace(/[#*`\n]/g, " ");
      return `<div class="notes-search-result-item"
        onclick="openNote('${_jesc(n.subject)}','${_jesc(n.unit)}','${_jesc(n.chapter)}')">
        <div class="notes-search-result-title">${_esc(n.chapter)}</div>
        <div class="notes-search-result-path">${_esc(n.subject)} › ${_esc(n.unit)}</div>
        ${preview ? `<div class="notes-search-result-preview">${_esc(preview)}…</div>` : ""}
      </div>`;
    }).join("");
}

// ─────────────────────────────────────────────────────────────────
// UNIT VIEW (stacked note cards)
// ─────────────────────────────────────────────────────────────────

async function openUnitView(subject, unit, skipPush) {
  if (_isDirty) {
    showConfirm('Unsaved Changes', 'You have unsaved changes. Discard them?', () => {
      _isDirty = false;
      openUnitView(subject, unit, skipPush);
    }, 'Discard');
    return;
  }

  _currentSubject = subject;
  _currentUnit    = unit;
  _currentChapter = null;
  _currentNote    = null;
  _navStack       = ["subjects","units","unit-stack"];
  if (!skipPush) _pushState('unit-stack', subject, unit);

  _setBreadcrumb(["📝 Notes", subject, unit, "All Notes"], true);
  _showUnitView();

  document.getElementById("unit-view-title").textContent = `${unit} — All Notes`;

  let { data: notes } = await fetchUnitNotes(subject, unit);

  let subjectData = studyData.subjects[subject];
  let unitData    = subjectData?.units.find(u => u.name === unit);
  let chapters    = unitData?.chapters || [];

  let container = document.getElementById("unit-cards-container");
  container.innerHTML = "";

  if (chapters.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:30px;font-size:13px;">No chapters in this unit.</div>`;
    return;
  }

  let noteMap = {};
  notes.forEach(n => { noteMap[n.chapter] = n; });

  chapters.forEach(chapter => {
    let note  = noteMap[chapter.name];
    let color = note?.color || "default";

    let colorBorder = {
      default: "var(--border)",
      red:     "rgba(239,68,68,0.4)",
      yellow:  "rgba(245,158,11,0.4)",
      green:   "rgba(16,185,129,0.4)",
      blue:    "rgba(59,130,246,0.4)",
    }[color] || "var(--border)";

    let colorLabel = {
      default: "", red: "🔴 High yield",
      yellow: "🟡 Needs review", green: "🟢 Confident", blue: "🔵 Extra"
    }[color] || "";

    let card = document.createElement("div");
    card.className = "notes-unit-card";
    card.style.borderColor = colorBorder;

    if (note) {
      let _ltxPreviewContent = (typeof latexToUnicode === 'function') ? latexToUnicode(note.content || '') : (note.content || '');
      let preview  = _ltxPreviewContent.substring(0, 120).replace(/[#*`_\[\]!\n]/g, " ").trim();
      let imgMatch = (note.content || "").match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
      let imgUrl   = imgMatch ? imgMatch[1] : null;

      card.innerHTML = `
        <div class="notes-unit-card-header">
          <span class="note-color-dot ${color}"></span>
          <div class="notes-unit-card-title">${_esc(chapter.name)}</div>
          ${colorLabel ? `<span style="font-size:10px;color:var(--text-dim);">${colorLabel}</span>` : ""}
        </div>
        ${note.tags?.length ? `<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:6px;">${note.tags.map(t => `<span style="background:rgba(59,130,246,0.12);color:var(--blue);border-radius:20px;padding:1px 8px;font-size:10px;font-weight:700;">${_esc(t)}</span>`).join("")}</div>` : ""}
        <div class="notes-unit-card-preview">${_esc(preview)}${preview.length >= 120 ? "…" : ""}</div>
        ${imgUrl ? `<img class="notes-unit-card-img" src="${imgUrl}" alt="note image" />` : ""}
        <div style="margin-top:8px;font-size:11px;color:var(--text-dim);">Last updated: ${_formatDate(note.updated_at)}</div>
      `;
    } else {
      card.innerHTML = `
        <div class="notes-unit-card-header">
          <span class="note-color-dot default"></span>
          <div class="notes-unit-card-title">${_esc(chapter.name)}</div>
          <span style="font-size:10px;color:var(--text-dim);">No note yet</span>
        </div>
        <div class="notes-unit-card-preview" style="color:var(--text-dim);">Click to create a note for this chapter.</div>
      `;
    }

    card.onclick = () => openNote(subject, unit, chapter.name);
    container.appendChild(card);
  });
}

// ─────────────────────────────────────────────────────────────────
// PDF EXPORT
// ─────────────────────────────────────────────────────────────────

async function exportUnitPdf() {
  let win = window.open("", "_blank");
  if (!win) { showToast('Allow pop-ups to export PDF.', 'warn'); return; }

  // Determine if we're exporting a single type or all types
  const TYPE_LABELS = { general: 'General Notes', mnemonic: 'Mnemonics', high_yield: 'High Yield', summary: 'Summary' };
  const TYPE_ICONS  = { general: '📝', mnemonic: '🧠', high_yield: '⭐', summary: '📋' };
  // _currentNoteType is set when coming from openUnitNotesByType; null/undefined = All Notes
  let filterType = (typeof _currentNoteType === 'string' && _currentNoteType &&
                    document.getElementById('unit-view-title')?.textContent?.includes('—') &&
                    !document.getElementById('unit-view-title')?.textContent?.includes('All Notes'))
    ? _currentNoteType : null;

  let pageTitle = filterType
    ? `${_currentSubject} › ${_currentUnit} — ${TYPE_LABELS[filterType] || filterType}`
    : `${_currentSubject} › ${_currentUnit} — All Notes`;

  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${_esc(pageTitle)}</title>
    <style>
      body { font-family: -apple-system, Georgia, serif; color: #111; margin: 36px auto; max-width: 740px; line-height: 1.7; }
      h1   { font-size: 20px; margin-bottom: 4px; border-bottom: 2px solid #333; padding-bottom: 8px; }
      .subtitle { font-size: 12px; color: #666; margin-bottom: 32px; }
      .chapter-card { border: 1px solid #ccc; border-radius: 10px; padding: 18px 20px; margin-bottom: 20px; page-break-inside: avoid; }
      .chapter-title { font-size: 16px; font-weight: 800; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; }
      .type-section { margin-top: 12px; }
      .type-label { font-size: 11px; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
      .type-divider { border: none; border-top: 1px dashed #ddd; margin: 12px 0; }
      h2 { font-size: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; margin-top: 18px; }
      h3 { font-size: 14px; margin-top: 14px; }
      code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 91%; }
      pre  { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow: auto; }
      blockquote { border-left: 3px solid #3b82f6; padding: 4px 14px; color: #444; margin: 12px 0; }
      img  { max-width: 100%; border-radius: 6px; margin: 8px 0; }
      ul, ol { padding-left: 20px; }
      .no-note { color: #999; font-style: italic; font-size: 13px; }
      @media print { body { margin: 18px; } }
    </style>
    </head><body>
    <h1>${_esc(pageTitle)}</h1>
    <div class="subtitle">Exported ${new Date().toLocaleDateString(undefined,{year:'numeric',month:'long',day:'numeric'})}</div>
  `);

  // Fetch real note content (not _notesMeta which has no content)
  let { data: allNotes } = await fetchUnitNotes(_currentSubject, _currentUnit);
  allNotes = allNotes || [];

  let subjectData = studyData.subjects[_currentSubject];
  let unitData    = subjectData?.units.find(u => u.name === _currentUnit);
  let chapters    = unitData?.chapters || [];

  const ALL_TYPES = ['general', 'mnemonic', 'high_yield', 'summary'];

  chapters.forEach(ch => {
    let chapterNotes = allNotes.filter(n => n.chapter === ch.name);
    if (filterType) {
      chapterNotes = chapterNotes.filter(n => (n.note_type || 'general') === filterType);
    }
    // Skip chapters with no notes at all
    if (chapterNotes.length === 0) return;

    win.document.write(`<div class="chapter-card"><div class="chapter-title">${_esc(ch.name)}</div>`);

    let typesToShow = filterType ? [filterType] : ALL_TYPES;
    let shownCount = 0;
    typesToShow.forEach(type => {
      let note = chapterNotes.find(n => (n.note_type || 'general') === type);
      if (!note || !note.content) return;
      let ltxContent = (typeof latexToUnicode === 'function') ? latexToUnicode(note.content) : note.content;
      let rendered   = (typeof marked !== 'undefined') ? marked.parse(ltxContent) : ltxContent.replace(/\n/g, '<br>');
      if (shownCount > 0) win.document.write(`<hr class="type-divider">`);
      if (!filterType) {
        win.document.write(`<div class="type-section"><div class="type-label">${TYPE_ICONS[type] || ''} ${TYPE_LABELS[type] || type}</div>${rendered}</div>`);
      } else {
        win.document.write(`<div class="type-section">${rendered}</div>`);
      }
      shownCount++;
    });

    win.document.write(`</div>`);
  });

  if (chapters.every(ch => allNotes.filter(n => n.chapter === ch.name && (!filterType || (n.note_type||'general') === filterType)).length === 0)) {
    win.document.write(`<p class="no-note">No notes found for this unit.</p>`);
  }

  win.document.write("</body></html>");
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 700);
}

// ─────────────────────────────────────────────────────────────────
// AI NOTE GENERATOR
// ─────────────────────────────────────────────────────────────────

function openAiNoteModal() {
  if (!_currentSubject || !_editMode) {
    showToast("Open a chapter note in edit mode first.", 'warn');
    return;
  }
  document.getElementById("ai-note-source").value  = "";
  document.getElementById("ai-note-status").textContent = "";
  document.getElementById("ai-note-preview").style.display  = "none";
  document.getElementById("ai-note-actions").style.display  = "none";
  _aiNoteResult = "";
  document.getElementById("ai-note-modal").classList.add("open");
}

function closeAiNoteModal() {
  document.getElementById("ai-note-modal").classList.remove("open");
}

function closeAiNoteModalOnBackdrop(e) {
  if (e.target === document.getElementById("ai-note-modal")) closeAiNoteModal();
}

async function runAiNote() {
  let sourceText = document.getElementById("ai-note-source").value.trim();
  if (!sourceText) {
    document.getElementById("ai-note-status").textContent = "Please paste some text first.";
    return;
  }

  let btn = document.getElementById("btn-run-ai-note");
  btn.disabled = true;
  btn.textContent = "Generating…";
  document.getElementById("ai-note-status").textContent = "Calling Claude…";
  document.getElementById("ai-note-preview").style.display = "none";
  document.getElementById("ai-note-actions").style.display = "none";

  let prompt = `You are a medical education expert. Create a structured, high-yield revision note in Markdown format from the following medical textbook excerpt.

Chapter context: ${_currentChapter} (${_currentSubject} › ${_currentUnit})

Include:
- ## Key Concepts (bullet list of core facts)
- ## Mnemonics (any useful memory aids)
- ## Clinical Correlations (bedside relevance)
- ## High-Yield Points (exam-critical facts, marked with ⭐)

Keep it concise and exam-focused. Use Markdown formatting throughout.

TEXT TO PROCESS:
${sourceText}`;

  try {
    let response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    let data = await response.json();

    if (!response.ok) {
      throw new Error(data?.error?.message || `API error ${response.status}`);
    }

    _aiNoteResult = (data.content || [])
      .filter(b => b.type === "text")
      .map(b => b.text)
      .join("\n");

    // Show preview
    let previewEl = document.getElementById("ai-note-preview");
    previewEl.style.display = "block";

    if (typeof marked !== "undefined") {
      previewEl.innerHTML = marked.parse(_aiNoteResult);
    } else {
      previewEl.textContent = _aiNoteResult;
    }

    document.getElementById("ai-note-status").textContent = "Note generated ✓ — review and apply.";
    document.getElementById("ai-note-actions").style.display = "flex";

  } catch (err) {
    document.getElementById("ai-note-status").textContent = "Error: " + err.message;
    console.error("runAiNote:", err);
  } finally {
    btn.disabled    = false;
    btn.textContent = "Generate Note";
  }
}

function applyAiNote() {
  if (!_aiNoteResult) return;

  let editor = document.getElementById("note-content-editor");
  // Append to existing content with a separator if content exists
  if (editor.value.trim()) {
    editor.value += "\n\n---\n\n" + _aiNoteResult;
  } else {
    editor.value = _aiNoteResult;
  }

  // Use chapter name as title if blank
  let titleEl = document.getElementById("note-title-input");
  if (!titleEl.value.trim()) {
    titleEl.value = _currentChapter + " — Notes";
  }

  markDirty();
  closeAiNoteModal();
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function _esc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
// _jesc: use when embedding a value inside a JS string literal in an onclick attribute.
// HTML entities like &#39; get decoded by the HTML parser before JS runs, breaking syntax.
// Backslash-escaping is the correct approach for JS string contexts.
function _jesc(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function _formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

// =================================================================
// ── FEATURE 9: Note Types View (level 4) ─────────────────────────
// =================================================================

async function showNoteTypesView(subject, unit, chapter, skipPush) {
  if (_isDirty) {
    showConfirm('Unsaved Changes', 'You have unsaved changes. Discard them?', () => {
      _isDirty = false;
      showNoteTypesView(subject, unit, chapter, skipPush);
    }, 'Discard');
    return;
  }

  _currentSubject = subject;
  _currentUnit    = unit;
  _currentChapter = chapter;
  _navStack = ["subjects","units","chapters","note-types"];
  if (!skipPush) _pushState('note-types', subject, unit, chapter);
  _setBreadcrumb(["Notes", subject, unit, chapter], true);
  _showView("view-note-types");
  document.getElementById("notes-progress-bar").style.display = "none";

  let heading = document.getElementById('note-types-heading');
  if (heading) heading.textContent = chapter;

  let grid = document.getElementById('note-types-grid');
  if (!grid) return;

  grid.innerHTML = '<div style="color:var(--text-dim);font-size:12px;padding:8px 0;">Loading...</div>';

  let { data: chapterNotes } = await fetchChapterNotes(subject, unit, chapter);
  let noteMap = {};
  (chapterNotes || []).forEach(n => { noteMap[n.note_type || 'general'] = n; });

  const NOTE_TYPES = [
    { type: 'general',    icon: '📝', label: 'General Notes',  desc: 'Full study notes & explanations' },
    { type: 'mnemonic',   icon: '🧠', label: 'Mnemonics',       desc: 'Memory aids & tricks' },
    { type: 'high_yield', icon: '⭐', label: 'High Yield',      desc: 'Exam-critical key points' },
    { type: 'summary',    icon: '📋', label: 'Summary',         desc: 'Quick overview & recap' },
  ];

  grid.innerHTML = NOTE_TYPES.map(({ type, icon, label, desc }) => {
    let note    = noteMap[type];
    let preview = note ? (note.content || '').substring(0, 70).replace(/[#*`\n]/g, ' ').trim() : '';
    return `<div class="notes-type-card${note ? ' has-note' : ''}" onclick="openNote('${_jesc(subject)}','${_jesc(unit)}','${_jesc(chapter)}','${type}')">
      <div class="notes-type-card-icon">${icon}</div>
      <div class="notes-type-card-body">
        <div class="notes-type-card-label">${label}</div>
        <div class="notes-type-card-desc">${note ? _esc(preview) + (preview.length >= 70 ? '&hellip;' : '') : desc}</div>
        ${note ? '<div class="notes-type-card-date">Updated ' + _formatDate(note.updated_at) + '</div>' : ''}
      </div>
      <span class="notes-type-card-action">${note ? 'Edit ›' : '+ New'}</span>
    </div>`;
  }).join('');
}

// =================================================================
// ── FEATURE 4: Tag Filter Bar ─────────────────────────────────────
// =================================================================

function _renderTagFilter(subject, unit) {
  let container = document.getElementById('chapters-tag-filter');
  if (!container) return;
  let tagSet = new Set();
  _notesMeta.filter(n => n.subject === subject && n.unit === unit)
    .forEach(n => (n.tags || []).forEach(t => tagSet.add(t)));
  if (tagSet.size === 0) { container.style.display = 'none'; return; }
  container.style.display = '';
  container.innerHTML =
    '<span class="notes-tag-filter-label">Filter:</span>' +
    ['__all__', ...[...tagSet]].map(t => {
      let isAll    = t === '__all__';
      let isActive = isAll ? _activeTagFilter === null : _activeTagFilter === t;
      let disp     = isAll ? 'All' : _esc(t);
      let val      = isAll ? 'null' : "'" + t.replace(/'/g, "\\'") + "'";
      return `<button class="notes-tag-pill${isActive ? ' active' : ''}" onclick="_setTagFilter(${val})">${disp}</button>`;
    }).join('');
}

function _setTagFilter(tag) {
  _activeTagFilter = tag;
  showChaptersView(_currentSubject, _currentUnit, true);
}

// =================================================================
// ── FEATURE 10: Chapter Status Marking ───────────────────────────
// =================================================================

function notesToggleChapterCompleted(subjectName, ui, ci) {
  let ch = studyData.subjects[subjectName]?.units[ui]?.chapters[ci];
  if (!ch) return;
  if (ch.status === 'completed') {
    ch.status        = 'not-started';
    ch.completedOn   = null;
    ch.revisionIndex = 0;
    ch.nextRevision  = null;
    ch.revisionDates = [];
  } else {
    ch.status        = 'completed';
    ch.completedOn   = today();
    ch.lastReviewedOn = today();
    let dates = [], cursor = today();
    for (let i = 0; i < BASE_INTERVALS.length; i++) {
      cursor = addDays(cursor, computeNextInterval(ch, i));
      dates.push(cursor);
    }
    ch.revisionDates = dates;
    ch.nextRevision  = dates[0];
    ch.revisionIndex = 0;
  }
  if (typeof fixPointer === 'function') fixPointer(subjectName);
  saveData();
  showChaptersView(_currentSubject, _currentUnit, true);
}

function notesMarkChapterRevised(subjectName, ui, ci, level) {
  let ch = studyData.subjects[subjectName]?.units[ui]?.chapters[ci];
  if (!ch) return;

  if (level === 1 && ch.status !== 'completed') {
    // Auto-complete first
    ch.status         = 'completed';
    ch.completedOn    = today();
    ch.lastReviewedOn = today();
    let dates = [], cursor = today();
    for (let i = 0; i < BASE_INTERVALS.length; i++) {
      cursor = addDays(cursor, computeNextInterval(ch, i));
      dates.push(cursor);
    }
    ch.revisionDates = dates;
    ch.nextRevision  = dates[0];
    ch.revisionIndex = 0;
    if (typeof fixPointer === 'function') fixPointer(subjectName);
  }
  if (level === 2 && ch.revisionIndex < 1) { showToast('Complete R1 first before marking R2.', 'warn'); return; }
  if (level === 3 && ch.revisionIndex < 2) { showToast('Complete R2 first before marking R3.', 'warn'); return; }

  // Toggle off if clicking same level
  if (ch.revisionIndex === level) {
    ch.revisionIndex = level - 1;
    ch.nextRevision  = (ch.revisionDates?.[level - 1]) || addDays(today(), computeNextInterval(ch, level - 1));
    saveData(); showChaptersView(_currentSubject, _currentUnit, true); return;
  }

  // Ensure revisionDates up to level
  if (!ch.revisionDates) ch.revisionDates = [];
  for (let i = 0; i <= level; i++) {
    if (!ch.revisionDates[i]) {
      let prev = i === 0 ? today() : (ch.revisionDates[i - 1] || today());
      ch.revisionDates[i] = addDays(prev, computeNextInterval(ch, i));
    }
  }
  ch.revisionIndex  = level;
  ch.lastReviewedOn = today();
  ch.nextRevision   = (level < BASE_INTERVALS.length - 1) ? (ch.revisionDates[level] || addDays(today(), computeNextInterval(ch, level))) : null;

  if (typeof fixPointer === 'function') fixPointer(subjectName);
  saveData();
  showChaptersView(_currentSubject, _currentUnit, true);
}

// =================================================================
// ── FEATURE 1: Markdown Toolbar Helpers ──────────────────────────
// =================================================================

function _mdInsert(prefix, suffix, placeholder) {
  let ta = document.getElementById('note-content-editor');
  if (!ta) return;
  let start = ta.selectionStart, end = ta.selectionEnd;
  let sel    = ta.value.substring(start, end) || placeholder || '';
  ta.value   = ta.value.substring(0, start) + prefix + sel + suffix + ta.value.substring(end);
  ta.selectionStart = start + prefix.length;
  ta.selectionEnd   = start + prefix.length + sel.length;
  ta.focus();
  markDirty();
}

function _mdInsertLine(prefix) {
  let ta = document.getElementById('note-content-editor');
  if (!ta) return;
  let pos    = ta.selectionStart;
  let before = ta.value.substring(0, pos);
  let after  = ta.value.substring(pos);
  // Find start of current line
  let lineStart = before.lastIndexOf('\n') + 1;
  ta.value = before.substring(0, lineStart) + prefix + before.substring(lineStart) + after;
  ta.selectionStart = ta.selectionEnd = lineStart + prefix.length + (pos - lineStart);
  ta.focus();
  markDirty();
}

function _handleEditorKeydown(event) {
  // Tab → insert 2 spaces instead of focusing next element
  if (event.key === 'Tab') {
    event.preventDefault();
    _mdInsert('  ', '', '');
  }
  // Ctrl/Cmd+B → bold
  if ((event.ctrlKey || event.metaKey) && event.key === 'b') { event.preventDefault(); _mdInsert('**', '**', 'bold'); }
  // Ctrl/Cmd+I → italic
  if ((event.ctrlKey || event.metaKey) && event.key === 'i') { event.preventDefault(); _mdInsert('*', '*', 'italic'); }
}

// =================================================================
// ── FEATURE 2: Note Templates ────────────────────────────────────
// =================================================================

function _applyTemplate(type) {
  let ta = document.getElementById('note-content-editor');
  if (!ta) return;
  const TEMPLATES = {
    high_yield: '## ⭐ High-Yield Points\n- \n- \n\n## 🔑 Key Facts\n- \n- \n\n## ⚠️ Don\'t Miss\n- \n\n## 🔗 Clinical Correlation\n- ',
    summary:    '## Summary\n\n### Pathophysiology\n\n### Clinical Features\n- Symptoms:\n- Signs:\n\n### Diagnosis\n- Gold standard:\n- Investigations:\n\n### Management\n- First line:\n- Second line:\n\n### Prognosis\n',
    mnemonic:   '## 🧠 Mnemonic\n\n**Mnemonic:** \n\n**Breakdown:**\n- **Letter** = \n- **Letter** = \n\n**Memory Story / Image:**\n\n**Example / Clinical Use:**\n',
    quick:      '## Quick Notes\n\n- \n- \n- \n- \n\n> Key: \n',
  };
  function _doApplyTmpl() { ta.value = TEMPLATES[type] || ''; markDirty(); ta.focus(); }
  if (ta.value.trim()) {
    showConfirm('Replace Content', 'Replace existing content with this template?', _doApplyTmpl, 'Replace');
    return;
  }
  _doApplyTmpl();
}

// =================================================================
// ── FEATURE 6: Focus / Fullscreen Mode ───────────────────────────
// =================================================================

function toggleFocusMode() {
  _focusMode = !_focusMode;
  document.body.classList.toggle('notes-focus-mode', _focusMode);
  let btn = document.getElementById('btn-focus-mode');
  if (btn) btn.textContent = _focusMode ? '✕ Exit Focus' : '⛶ Focus';
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && _focusMode) toggleFocusMode();
});

// =================================================================
// ── FEATURE 7: Find in Note ───────────────────────────────────────
// =================================================================

function toggleFindInNote() {
  let bar = document.getElementById('notes-find-bar');
  if (!bar) return;
  let isVisible = bar.style.display === 'flex';
  if (!isVisible) {
    bar.style.display = 'flex';
    let inp = document.getElementById('notes-find-input');
    if (inp) { inp.value = ''; inp.focus(); }
    _findActive = true;
  } else {
    _clearFind();
    bar.style.display = 'none';
    let inp = document.getElementById('notes-find-input');
    if (inp) inp.value = '';
    _findActive = false;
  }
}

function _findInNote(query) {
  let readEl = document.getElementById('notes-read-body');
  if (!readEl) return;
  if (!query || !query.trim()) { _clearFind(); return; }

  let content = _currentNote?.content || '';
  let rendered = typeof marked !== 'undefined' ? marked.parse(content) : content.replace(/\n/g, '<br>');
  // Highlight all occurrences
  let escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let regex   = new RegExp('(' + escaped + ')', 'gi');
  let highlighted = rendered.replace(regex, '<mark class="notes-find-highlight">$1</mark>');
  readEl.innerHTML = highlighted;

  let matches = readEl.querySelectorAll('.notes-find-highlight');
  let countEl = document.getElementById('notes-find-count');
  if (countEl) countEl.textContent = matches.length ? matches.length + ' match' + (matches.length > 1 ? 'es' : '') : 'No matches';
  if (matches.length) matches[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function _clearFind() {
  let countEl = document.getElementById('notes-find-count');
  if (countEl) countEl.textContent = '';
  // Re-render without highlights
  if (_currentNote?.content) {
    let readEl = document.getElementById('notes-read-body');
    if (readEl) {
      if (typeof marked !== 'undefined') {
        readEl.innerHTML = marked.parse(_currentNote.content);
      } else {
        readEl.innerHTML = _currentNote.content.replace(/\n/g, '<br>');
      }
    }
  }
}

// =================================================================
// ── NOTES RIGHT SIDEBAR — Quick chapter/unit switcher ──────────
// =================================================================

function toggleNotesRightNav() {
  let nav = document.getElementById('notes-right-nav');
  if (!nav) return;
  nav.classList.contains('open') ? closeNotesRightNav() : openNotesRightNav();
}

function openNotesRightNav() {
  _buildNotesTree();
  let nav     = document.getElementById('notes-right-nav');
  let overlay = document.getElementById('nav-overlay');
  let btn     = document.getElementById('notes-rn-toggle');
  if (nav)     nav.classList.add('open');
  if (btn)     { btn.classList.add('open'); btn.innerHTML = '<span class="nrn-arrow">&#10095;</span><span class="nrn-label">INDEX</span>'; }
  if (overlay) {
    overlay.classList.add('open');
    overlay.addEventListener('click', closeNotesRightNav, { once: true });
  }
}

function closeNotesRightNav() {
  let nav     = document.getElementById('notes-right-nav');
  let overlay = document.getElementById('nav-overlay');
  let btn     = document.getElementById('notes-rn-toggle');
  if (nav)     nav.classList.remove('open');
  if (btn)     { btn.classList.remove('open'); btn.innerHTML = '<span class="nrn-arrow">&#10094;</span><span class="nrn-label">INDEX</span>'; }
  if (overlay) overlay.classList.remove('open');
}

// Navigate to subjects list from the sidebar header button
function _rnGoSubjects() {
  closeNotesRightNav();
  showSubjectsView();
}

function _buildNotesTree() {
  let body    = document.getElementById('notes-rn-body');
  let subBtn  = document.getElementById('notes-rn-subject-btn');
  if (!body) return;

  // No subject selected → show all subjects
  if (!_currentSubject) {
    if (subBtn) { subBtn.textContent = '📚 All Subjects'; }
    let subjects = Object.keys(studyData?.subjects || {});
    if (!subjects.length) {
      body.innerHTML = '<div style="padding:20px 16px;font-size:12px;color:var(--text-dim);">No subjects yet. Add via Syllabus.</div>';
      return;
    }
    body.innerHTML = subjects.map(s => {
      let isActive = s === _currentSubject;
      return (
        '<div class="notes-rn-subject-row' + (isActive ? ' active' : '') + '" onclick="closeNotesRightNav();showUnitsView(\'' + _jesc(s) + '\');">' +
        '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h5l1.5 2H14v8H2z"/></svg>' +
        '<span>' + _esc(s) + '</span>' +
        '</div>'
      );
    }).join('');
    return;
  }

  if (subBtn) { subBtn.textContent = '📚 ' + _currentSubject; }

  let subjectData = studyData?.subjects?.[_currentSubject];
  let units = subjectData?.units || [];

  if (!units.length) {
    body.innerHTML = '<div style="padding:20px 16px;font-size:12px;color:var(--text-dim);">No units in this subject.</div>';
    return;
  }

  body.innerHTML = units.map((unit) => {
    let isCurrentUnit = unit.name === _currentUnit;
    let chapters      = unit.chapters || [];
    let noteCount     = _notesMeta.filter(n => n.subject === _currentSubject && n.unit === unit.name).length;

    let chapHtml = chapters.map(ch => {
      let isCurrent = ch.name === _currentChapter && isCurrentUnit;
      let hasNote   = _notesMeta.some(n =>
        n.subject === _currentSubject && n.unit === unit.name && n.chapter === ch.name
      );
      return (
        '<div class="notes-rn-chapter' + (isCurrent ? ' active' : '') + (hasNote ? ' has-note' : '') + '"' +
        ' onclick="closeNotesRightNav();showNoteTypesView(\'' + _jesc(_currentSubject) + '\',\'' + _jesc(unit.name) + '\',\'' + _jesc(ch.name) + '\');">' +
        '<span class="notes-rn-chapter-dot"></span>' +
        '<span class="notes-rn-chapter-name">' + _esc(ch.name) + '</span>' +
        '</div>'
      );
    }).join('');

    return (
      '<div class="notes-rn-unit">' +
        '<div class="notes-rn-unit-head' + (isCurrentUnit ? ' active' : '') + '" onclick="_rnToggleUnit(this)">' +
          '<span class="notes-rn-unit-arrow' + (isCurrentUnit ? ' open' : '') + '">▶</span>' +
          '<span class="notes-rn-unit-name">' + _esc(unit.name) + '</span>' +
          (noteCount > 0 ? '<span class="notes-rn-unit-count">' + noteCount + '</span>' : '') +
        '</div>' +
        '<div class="notes-rn-chapters" style="' + (isCurrentUnit ? '' : 'display:none;') + '">' +
          chapHtml +
        '</div>' +
      '</div>'
    );
  }).join('');
}

function _rnToggleUnit(head) {
  let chapters = head.nextElementSibling;
  let arrow    = head.querySelector('.notes-rn-unit-arrow');
  let isOpen   = chapters.style.display !== 'none';
  chapters.style.display = isOpen ? 'none' : '';
  if (arrow) arrow.classList.toggle('open', !isOpen);
}

// =================================================================
// ── FEATURE 8: Single-Note PDF Export ────────────────────────────
// =================================================================

function exportCurrentNotePdf() {
  if (!_currentNote && !(document.getElementById('note-content-editor')?.value)) {
    showToast('Open a note first.', 'warn'); return;
  }
  let content   = _currentNote?.content || document.getElementById('note-content-editor')?.value || '';
  let title     = _currentNote?.title   || document.getElementById('note-title-input')?.value     || _currentChapter;
  let ltxContent = (typeof latexToUnicode === 'function') ? latexToUnicode(content) : content;
  let rendered  = typeof marked !== 'undefined' ? marked.parse(ltxContent) : ltxContent.replace(/\n/g, '<br>');
  let noteTypeLabel = { general: 'General Notes', mnemonic: 'Mnemonics', high_yield: 'High Yield', summary: 'Summary' }[_currentNoteType] || '';

  let win = window.open('', '_blank');
  if (!win) { showToast('Allow pop-ups to export PDF.', 'warn'); return; }
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${_esc(title)}</title>
    <style>
      body { font-family: -apple-system, Georgia, serif; color: #111; margin: 36px auto; max-width: 680px; line-height: 1.7; }
      h1 { font-size: 22px; margin-bottom: 2px; border-bottom: 2px solid #333; padding-bottom: 6px; }
      .subtitle { font-size: 12px; color: #666; margin-bottom: 28px; }
      h2 { font-size: 17px; border-bottom: 1px solid #ddd; padding-bottom: 3px; margin-top: 24px; }
      h3 { font-size: 15px; margin-top: 18px; }
      code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 91%; }
      pre  { background: #f4f4f4; padding: 12px; border-radius: 6px; overflow: auto; }
      blockquote { border-left: 3px solid #3b82f6; padding: 4px 14px; color: #444; margin: 12px 0; }
      img  { max-width: 100%; border-radius: 6px; margin: 8px 0; }
      mark { background: #fef08a; padding: 0 2px; border-radius: 2px; }
      @media print { body { margin: 18px; } }
    </style></head><body>
    <h1>${_esc(title)}</h1>
    <div class="subtitle">${_esc(_currentSubject)} › ${_esc(_currentUnit)} › ${_esc(_currentChapter)}${noteTypeLabel ? ' · ' + noteTypeLabel : ''}</div>
    ${rendered}
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 700);
}

// ─────────────────────────────────────────────────────────────────
// GLOBALS exposed to notes.html inline handlers and URL boot
// ─────────────────────────────────────────────────────────────────
//   initNotes()
//   openNote(subject, unit, chapter)
//   openUnitView(subject, unit)
//   saveCurrentNote()
//   markDirty()
//   togglePreview()
//   setNoteColor(color, swatchEl)
//   handleNoteTagInput(event)
//   removeNoteTag(index)
//   triggerImageUpload()
//   handleNoteImageUpload(inputEl)
//   handleNotesSearch(query)
//   openAiNoteModal()
//   closeAiNoteModal()
//   closeAiNoteModalOnBackdrop(event)
//   runAiNote()
//   applyAiNote()
//   exportUnitPdf()
//   toggleSidebar()
//   toggleSubjectInSidebar(el, subject)
//   toggleUnitInSidebar(el, subject, unit)

// ─────────────────────────────────────────────────────────────────
// NOTE → CARDS BRIDGE
// ─────────────────────────────────────────────────────────────────

function openNoteToCardsModal() {
  let note    = _currentNote;
  let content = note?.content || document.getElementById("note-content-editor")?.value || "";
  if (!content.trim()) {
    showToast("No note content to generate cards from. Write some notes first.", 'warn');
    return;
  }
  let preview = document.getElementById("n2c-preview");
  if (preview) preview.textContent = content.slice(0, 300) + (content.length > 300 ? "…" : "");
  document.getElementById("n2c-modal").classList.add("open");
}

function closeN2CModal() {
  document.getElementById("n2c-modal").classList.remove("open");
}
function closeN2CModalOnBackdrop(e) {
  if (e.target === document.getElementById("n2c-modal")) closeN2CModal();
}

function goToCardsWithNote() {
  let note    = _currentNote;
  let content = note?.content || document.getElementById("note-content-editor")?.value || "";
  let subject = _currentSubject || "";
  let unit    = _currentUnit    || "";
  let chapter = _currentChapter || "";

  // Store in sessionStorage for the flashcards page to pick up
  try {
    sessionStorage.setItem("n2c_content", content);
    sessionStorage.setItem("n2c_subject", subject);
    sessionStorage.setItem("n2c_unit",    unit);
    sessionStorage.setItem("n2c_chapter", chapter);
  } catch(e) {}

  closeN2CModal();
  window.location.href = "create.html?n2c=1&subject=" +
    encodeURIComponent(subject) + "&unit=" + encodeURIComponent(unit) +
    "&chapter=" + encodeURIComponent(chapter);
}
