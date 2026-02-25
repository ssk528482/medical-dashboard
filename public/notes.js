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
let _noteTags        = [];
let _noteColor       = "default";
let _isDirty         = false;
let _isSaving        = false;
let _autoSaveTimer   = null;
let _aiNoteResult    = "";
let _editMode        = false;    // read vs edit mode in note view
let _navStack        = [];       // ["subjects"] → ["subjects","units","chapters","note"]

// ─────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────

async function initNotes() {
  await _loadNotesMeta();
  showSubjectsView();
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
  ["view-subjects","view-units","view-chapters","view-note","view-search","view-unit-stack"]
    .forEach(v => {
      let el = document.getElementById(v);
      if (el) el.style.display = v === id ? "" : "none";
    });
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
function showSubjectsView() {
  _navStack = ["subjects"];
  _setBreadcrumb(["📝 Notes"], false);
  _showView("view-subjects");
  document.getElementById("notes-search-bar").style.display = "";
  document.getElementById("notes-progress-bar").style.display = "";

  let subjects = studyData.subjects || {};
  let grid = document.getElementById("subjects-grid");
  if (!grid) return;

  // Progress: count notes vs total chapters
  let totalChapters = 0, notedChapters = 0;
  Object.values(subjects).forEach(s => s.units.forEach(u => {
    totalChapters += u.chapters.length;
    notedChapters += u.chapters.filter(ch =>
      _notesMeta.some(n => n.subject === s && n.unit === u.name && n.chapter === ch.name)
    ).length;
  }));
  // Fix: count by meta
  notedChapters = _notesMeta.length;
  let pct = totalChapters > 0 ? Math.round(notedChapters / totalChapters * 100) : 0;
  let fillEl = document.getElementById("notes-progress-fill");
  let pctEl  = document.getElementById("notes-progress-pct");
  if (fillEl) fillEl.style.width = pct + "%";
  if (pctEl)  pctEl.textContent  = pct + "%";

  if (Object.keys(subjects).length === 0) {
    grid.innerHTML = `<div class="notes-empty" style="grid-column:1/-1"><div class="notes-empty-icon">📚</div><div class="notes-empty-text">No subjects yet</div><div class="notes-empty-sub">Add subjects in Syllabus first</div></div>`;
    return;
  }

  // Accent colors cycle
  const ACCENTS = ["#3b82f6","#8b5cf6","#10b981","#f59e0b","#ef4444","#06b6d4","#ec4899","#84cc16"];

  grid.innerHTML = Object.entries(subjects).map(([subjectName, subjectData], idx) => {
    let noteCount    = _notesMeta.filter(n => n.subject === subjectName).length;
    let topicCount   = subjectData.units.reduce((s, u) => s + u.chapters.length, 0);
    let unitCount    = subjectData.units.length;
    let accent       = ACCENTS[idx % ACCENTS.length];
    return `<div class="notes-subj-card" onclick="showUnitsView('${_esc(subjectName)}')">
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
function showUnitsView(subject) {
  _currentSubject = subject;
  _navStack = ["subjects", "units"];
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
    return `<div class="notes-unit-grid-card" onclick="showChaptersView('${_esc(subject)}','${_esc(unit.name)}')">
      <div class="notes-subj-card-accent" style="background:${accent};border-radius:var(--radius) var(--radius) 0 0;"></div>
      <div class="notes-unit-grid-card-name">${_esc(unit.name)}</div>
      <div class="notes-unit-grid-card-badge">${noteCount} notes · ${chapCount} chapters</div>
      <span class="notes-unit-arrow">›</span>
    </div>`;
  }).join("");

  if (!subjectData.units.length) {
    grid.innerHTML = `<div class="notes-empty" style="grid-column:1/-1"><div class="notes-empty-icon">📂</div><div class="notes-empty-text">No units in ${_esc(subject)}</div></div>`;
  }
}

// ── Level 3: Chapters ──────────────────────────────────────────
function showChaptersView(subject, unit) {
  _currentSubject = subject;
  _currentUnit    = unit;
  _navStack = ["subjects","units","chapters"];
  _setBreadcrumb(["📝 Notes", subject, unit], true);
  _showView("view-chapters");
  document.getElementById("notes-progress-bar").style.display = "none";

  let subjectData = studyData.subjects[subject];
  let unitData    = subjectData?.units.find(u => u.name === unit);
  let chapters    = unitData?.chapters || [];
  let list        = document.getElementById("chapters-list");
  if (!list) return;

  // Build coverage map
  let coverMap = {};
  _notesMeta.filter(n => n.subject === subject && n.unit === unit)
    .forEach(n => { coverMap[n.chapter] = n; });

  if (!chapters.length) {
    list.innerHTML = `<div class="notes-empty"><div class="notes-empty-icon">📂</div><div class="notes-empty-text">No chapters in this unit</div></div>`;
    return;
  }

  list.innerHTML = chapters.map(ch => {
    let note      = coverMap[ch.name];
    let color     = note?.color || "default";
    let hasNote   = !!note;

    // Study status badge from studyData
    let statusCls = 'ns', statusTxt = 'New';
    if (ch.status === 'completed') {
      if (ch.revisionIndex >= 1) {
        statusCls = 'rv';
        statusTxt = 'R' + ch.revisionIndex;
      } else {
        statusCls = 'cp';
        statusTxt = '✓';
      }
    }

    return `<div class="notes-chap-card${hasNote ? " has-note" : ""}"
      onclick="openNote('${_esc(subject)}','${_esc(unit)}','${_esc(ch.name)}')">
      <span class="notes-chap-icon">${hasNote ? "📝" : "📄"}</span>
      <div style="flex:1;min-width:0;">
        <div class="notes-chap-name">${_esc(ch.name)}</div>
        ${note ? `<div class="notes-chap-meta">Updated ${_formatDate(note.updated_at)}</div>` : `<div class="notes-chap-meta" style="color:var(--text-dim)">No note yet</div>`}
      </div>
      <div class="notes-chap-right">
        <span class="notes-chap-status ${statusCls}">${statusTxt}</span>
        <span class="note-color-dot ${color}" style="margin-top:2px;"></span>
        ${note?.tags?.length ? `<span style="font-size:9px;color:var(--text-dim);text-align:right;">${note.tags.slice(0,2).map(_esc).join(", ")}</span>` : ""}
      </div>
    </div>`;
  }).join("");
}

// ── Back navigation ────────────────────────────────────────────
function notesBreadcrumbBack() {
  let cur = _navStack[_navStack.length - 1];
  if (cur === "units")    { showSubjectsView(); return; }
  if (cur === "chapters") { showUnitsView(_currentSubject); return; }
  if (cur === "note")     { showChaptersView(_currentSubject, _currentUnit); return; }
  if (cur === "search")   { showSubjectsView(); return; }
  showSubjectsView();
}

// ─────────────────────────────────────────────────────────────────
// OPEN NOTE
// ─────────────────────────────────────────────────────────────────

async function openNote(subject, unit, chapter) {
  if (_isDirty) {
    let ok = confirm("You have unsaved changes. Discard them?");
    if (!ok) return;
    _isDirty = false;
  }

  _currentSubject = subject;
  _currentUnit    = unit;
  _currentChapter = chapter;
  _editMode       = false;
  _navStack       = ["subjects","units","chapters","note"];

  _setBreadcrumb(["📝 Notes", subject, unit, chapter], true);
  _showView("view-note");
  document.getElementById("notes-progress-bar").style.display = "none";
  document.getElementById("notes-note-topbar-title").textContent = chapter;

  // Load from Supabase
  setSaveStatus("Loading…");
  let { data: note } = await fetchNote(subject, unit, chapter);
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

  // Show Note→Cards button only if note has content
  let n2cBtn = document.getElementById("btn-note-to-cards");
  if (n2cBtn) n2cBtn.style.display = (note && note.content && note.content.trim()) ? "" : "none";

  if (note && note.content) {
    let readEl = document.getElementById("notes-read-body");
    if (typeof marked !== "undefined") {
      readEl.innerHTML = marked.parse(note.content);
    } else {
      readEl.innerHTML = note.content.replace(/\\n/g, "<br>");
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
    let ok = confirm("Discard unsaved changes?");
    if (!ok) return;
    _isDirty = false;
    // Reload note content
    document.getElementById("note-content-editor").value = _currentNote?.content || "";
    document.getElementById("note-title-input").value    = _currentNote?.title   || "";
    _noteTags  = _currentNote?.tags  || [];
    _noteColor = _currentNote?.color || "default";
    _renderTagChips();
    _setColorSwatchActive(_noteColor);
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

async function saveCurrentNote() {
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
        .eq('chapter', _currentChapter);
    } else {
      await deleteNote(_currentNote.id);
    }
    document.getElementById("btn-save-note").disabled = false;
    _isSaving = false;
    _currentNote = null;
    _isDirty     = false;
    setSaveStatus("Note cleared ✓");
    await _loadNotesMeta();
    _enterReadMode();
    return;
  }

  // If content is empty and there's no existing note — nothing to save
  if (!contentTrimmed && !title && !_currentNote?.id) {
    document.getElementById("btn-save-note").disabled = false;
    _isSaving = false;
    setSaveStatus("");
    _enterReadMode();
    return;
  }

  let payload = {
    id:      _currentNote?.id || undefined,
    subject: _currentSubject,
    unit:    _currentUnit,
    chapter: _currentChapter,
    title:   title || _currentChapter,
    content,
    images:  _currentNote?.images || [],
    color:   _noteColor,
    tags:    _noteTags,
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
  _enterReadMode();
}

// Auto-save after 2 seconds of inactivity
function markDirty() {
  _isDirty = true;
  setSaveStatus("Unsaved…");
  _updateWordCount();
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    if (_isDirty && _currentSubject && !_isSaving) saveCurrentNote();
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
  let file = getImageFromClipboard(e);
  if (!file) return;
  e.preventDefault();
  await _uploadAndInsertImage(file);
});

async function _uploadAndInsertImage(file) {
  if (!_currentSubject) {
    alert("Open a note first before uploading images.");
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
      let preview = (n.content || "").substring(0, 80).replace(/[#*`\n]/g, " ");
      return `<div class="notes-search-result-item"
        onclick="openNote('${_esc(n.subject)}','${_esc(n.unit)}','${_esc(n.chapter)}')">
        <div class="notes-search-result-title">${_esc(n.chapter)}</div>
        <div class="notes-search-result-path">${_esc(n.subject)} › ${_esc(n.unit)}</div>
        ${preview ? `<div class="notes-search-result-preview">${_esc(preview)}…</div>` : ""}
      </div>`;
    }).join("");
}

// ─────────────────────────────────────────────────────────────────
// UNIT VIEW (stacked note cards)
// ─────────────────────────────────────────────────────────────────

async function openUnitView(subject, unit) {
  if (_isDirty) {
    let ok = confirm("You have unsaved changes. Discard them?");
    if (!ok) return;
    _isDirty = false;
  }

  _currentSubject = subject;
  _currentUnit    = unit;
  _currentChapter = null;
  _currentNote    = null;
  _navStack       = ["subjects","units","unit-stack"];

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
      let preview  = (note.content || "").substring(0, 120).replace(/[#*`_\[\]!\n]/g, " ").trim();
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

function exportUnitPdf() {
  // Use browser print with print-only CSS
  let container = document.getElementById("unit-cards-container");
  if (!container) return;

  let win = window.open("", "_blank");
  win.document.write(`
    <!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <title>${_esc(_currentSubject)} — ${_esc(_currentUnit)} Notes</title>
    <style>
      body { font-family: -apple-system, sans-serif; color: #111; margin: 32px; }
      h1   { font-size: 18px; margin-bottom: 20px; }
      .note-card { border: 1px solid #ccc; border-radius: 10px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid; }
      .note-title { font-size: 15px; font-weight: 700; margin-bottom: 6px; }
      .note-body  { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
      img { max-width: 100%; border-radius: 6px; margin-top: 8px; }
      @media print { body { margin: 16px; } }
    </style>
    </head><body>
    <h1>${_esc(_currentSubject)} › ${_esc(_currentUnit)}</h1>
  `);

  // Get chapters in order
  let subjectData = studyData.subjects[_currentSubject];
  let unitData    = subjectData?.units.find(u => u.name === _currentUnit);
  let chapters    = unitData?.chapters || [];
  let noteMap     = {};
  _notesMeta.filter(n => n.subject === _currentSubject && n.unit === _currentUnit)
    .forEach(n => { noteMap[n.chapter] = n; });

  chapters.forEach(ch => {
    let note = noteMap[ch.name];
    win.document.write(`
      <div class="note-card">
        <div class="note-title">${_esc(ch.name)}</div>
        <div class="note-body">${note?.content ? _esc(note.content) : "(No note)"}</div>
      </div>
    `);
  });

  win.document.write("</body></html>");
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ─────────────────────────────────────────────────────────────────
// AI NOTE GENERATOR
// ─────────────────────────────────────────────────────────────────

function openAiNoteModal() {
  if (!_currentSubject || !_editMode) {
    alert("Open a chapter note in edit mode first.");
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

function _formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    return new Date(isoStr).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
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
    alert("No note content to generate cards from. Write some notes first.");
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
