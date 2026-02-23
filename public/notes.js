// notes.js — Medical Study OS
// Full logic for notes.html
// Depends on: data.js, utils.js, supabase.js, cloudinary.js,
//             noteSync.js (fetchNote, saveNote, deleteNote, fetchUnitNotes,
//                          fetchAllNotesMeta, searchNotes)
// ─────────────────────────────────────────────────────────────────

// ── Module state ─────────────────────────────────────────────────
let _notesMeta       = [];        // lightweight array from fetchAllNotesMeta
let _currentNote     = null;      // full note object currently loaded in editor
let _currentSubject  = null;
let _currentUnit     = null;
let _currentChapter  = null;
let _noteTags        = [];        // tag array for current note
let _noteColor       = "default"; // color for current note
let _isDirty         = false;     // unsaved changes flag
let _autoSaveTimer   = null;      // debounce handle
let _previewMode     = false;     // markdown preview toggle
let _aiNoteResult    = "";        // last AI-generated markdown
let _sidebarOpen     = false;     // mobile sidebar state

// ─────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────

async function initNotes() {
  await _loadNotesMeta();
  renderSidebar();
}

async function _loadNotesMeta() {
  let { data } = await fetchAllNotesMeta();
  _notesMeta = data || [];
}

// ─────────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────────

function renderSidebar(metaOverride) {
  let meta    = metaOverride || _notesMeta;
  let tree    = document.getElementById("notes-tree");
  if (!tree) return;

  // Build coverage map from meta: "Subject||Unit||Chapter" → note obj
  let coverMap = {};
  meta.forEach(n => { coverMap[`${n.subject}||${n.unit}||${n.chapter}`] = n; });

  let subjects = studyData.subjects || {};
  let html = "";

  if (Object.keys(subjects).length === 0) {
    tree.innerHTML = `<div style="padding:20px 12px;font-size:12px;color:var(--text-dim);text-align:center;">No subjects yet.<br>Add subjects in Syllabus.</div>`;
    return;
  }

  Object.entries(subjects).forEach(([subjectName, subjectData]) => {
    let units = subjectData.units || [];
    // Count notes in this subject
    let noteCount = meta.filter(n => n.subject === subjectName).length;

    html += `<div class="notes-tree-subject" onclick="toggleSubjectInSidebar(this, '${_esc(subjectName)}')">
      <span>${_esc(subjectName)}</span>
      <span style="font-size:10px;color:var(--text-dim);">${noteCount > 0 ? noteCount + " 📝" : ""}</span>
    </div>`;

    html += `<div class="notes-subject-children" data-subject="${_esc(subjectName)}" style="display:block;">`;

    units.forEach((unit, ui) => {
      let unitNoteCount = meta.filter(n => n.subject === subjectName && n.unit === unit.name).length;
      html += `<div class="notes-tree-unit" onclick="toggleUnitInSidebar(this, '${_esc(subjectName)}', '${_esc(unit.name)}')">
        <span>▸ ${_esc(unit.name)}</span>
        <div style="display:flex;align-items:center;gap:6px;">
          ${unitNoteCount > 0 ? `<span style="font-size:10px;color:var(--text-dim);">${unitNoteCount} 📝</span>` : ""}
          <span onclick="event.stopPropagation();openUnitView('${_esc(subjectName)}','${_esc(unit.name)}')"
            style="font-size:10px;color:var(--blue);cursor:pointer;white-space:nowrap;">All</span>
        </div>
      </div>`;

      html += `<div class="notes-unit-children" data-subject="${_esc(subjectName)}" data-unit="${_esc(unit.name)}" style="display:block;">`;

      (unit.chapters || []).forEach((chapter, ci) => {
        let key  = `${subjectName}||${unit.name}||${chapter.name}`;
        let note = coverMap[key];
        let colorClass = note ? note.color || "default" : "";
        let isActive   = (_currentSubject === subjectName && _currentUnit === unit.name && _currentChapter === chapter.name);

        html += `<div class="notes-tree-chapter${isActive ? " active" : ""}"
          data-subject="${_esc(subjectName)}" data-unit="${_esc(unit.name)}" data-chapter="${_esc(chapter.name)}"
          onclick="openNote('${_esc(subjectName)}','${_esc(unit.name)}','${_esc(chapter.name)}')">
          <span class="note-color-dot ${colorClass}"></span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(chapter.name)}</span>
          ${note ? "📝" : ""}
        </div>`;
      });

      html += `</div>`; // /notes-unit-children
    });

    html += `</div>`; // /notes-subject-children
  });

  tree.innerHTML = html;
}

function toggleSubjectInSidebar(el, subjectName) {
  let children = document.querySelector(`.notes-subject-children[data-subject="${subjectName}"]`);
  if (!children) return;
  let isOpen = children.style.display !== "none";
  children.style.display = isOpen ? "none" : "block";
  el.querySelector("span:first-child").textContent = (isOpen ? "▸ " : "▾ ") + subjectName;
}

function toggleUnitInSidebar(el, subjectName, unitName) {
  let children = document.querySelector(`.notes-unit-children[data-subject="${subjectName}"][data-unit="${unitName}"]`);
  if (!children) return;
  let isOpen = children.style.display !== "none";
  children.style.display = isOpen ? "none" : "block";
  let label = el.querySelector("span:first-child");
  if (label) label.textContent = (isOpen ? "▸ " : "▾ ") + unitName;
}

// ─────────────────────────────────────────────────────────────────
// OPEN NOTE (single chapter)
// ─────────────────────────────────────────────────────────────────

async function openNote(subject, unit, chapter) {
  // Guard dirty state
  if (_isDirty) {
    let ok = confirm("You have unsaved changes. Discard them?");
    if (!ok) return;
    _isDirty = false;
  }

  _currentSubject = subject;
  _currentUnit    = unit;
  _currentChapter = chapter;

  // Show editor, hide other views
  _showEditorWrap();

  // Update breadcrumb
  let bc = document.getElementById("notes-breadcrumb");
  if (bc) bc.textContent = `${subject} › ${unit} › ${chapter}`;

  // Highlight sidebar
  document.querySelectorAll(".notes-tree-chapter").forEach(el => {
    el.classList.toggle("active",
      el.dataset.subject === subject &&
      el.dataset.unit    === unit    &&
      el.dataset.chapter === chapter
    );
  });

  // Fetch note from Supabase
  setSaveStatus("Loading…");
  let { data: note } = await fetchNote(subject, unit, chapter);
  _currentNote = note || null;

  // Populate editor
  document.getElementById("note-title-input").value   = note?.title   || "";
  document.getElementById("note-content-editor").value = note?.content || "";
  _noteTags  = note?.tags  || [];
  _noteColor = note?.color || "default";

  _renderTagChips();
  _setColorSwatchActive(_noteColor);
  setSaveStatus(note ? "Saved" : "New note");
  _isDirty = false;

  // Close mobile sidebar after selection
  if (window.innerWidth <= 600) closeSidebar();
}

// ─────────────────────────────────────────────────────────────────
// SAVE NOTE
// ─────────────────────────────────────────────────────────────────

async function saveCurrentNote() {
  if (!_currentSubject) return;

  let title   = document.getElementById("note-title-input").value.trim();
  let content = document.getElementById("note-content-editor").value;

  setSaveStatus("Saving…");
  document.getElementById("btn-save-note").disabled = true;

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

  if (error) {
    setSaveStatus("Save failed ✗");
    console.error("saveCurrentNote:", error);
    return;
  }

  _currentNote = data;
  _isDirty     = false;
  setSaveStatus("Saved ✓");

  // Refresh meta cache + sidebar to update color dot / note icon
  await _loadNotesMeta();
  renderSidebar();
}

// Auto-save after 2 seconds of inactivity
function markDirty() {
  _isDirty = true;
  setSaveStatus("Unsaved…");
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => {
    if (_isDirty && _currentSubject) saveCurrentNote();
  }, 2000);
}

function setSaveStatus(msg) {
  let el = document.getElementById("notes-save-status");
  if (el) el.textContent = msg;
}

// ─────────────────────────────────────────────────────────────────
// MARKDOWN PREVIEW
// ─────────────────────────────────────────────────────────────────

function togglePreview() {
  _previewMode = !_previewMode;
  let editor   = document.getElementById("note-content-editor");
  let preview  = document.getElementById("notes-preview-pane");
  let btn      = document.getElementById("btn-preview-toggle");

  if (_previewMode) {
    // Render markdown
    let md = editor.value;
    if (typeof marked !== "undefined") {
      preview.innerHTML = marked.parse(md);
    } else {
      // Fallback: basic conversion if marked not loaded
      preview.innerHTML = md.replace(/\n/g, "<br>");
    }
    preview.classList.add("visible");
    editor.style.display  = "none";
    if (btn) { btn.textContent = "Edit"; btn.style.color = "var(--blue)"; }
  } else {
    preview.classList.remove("visible");
    editor.style.display = "";
    if (btn) { btn.textContent = "Preview"; btn.style.color = ""; }
  }
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
      // Reset to full tree
      await _loadNotesMeta();
      renderSidebar();
      return;
    }
    let { data } = await searchNotes(query);
    // Render a flat result list instead of the tree
    _renderSearchResults(data || [], query);
  }, 280);
}

function _renderSearchResults(results, query) {
  let tree = document.getElementById("notes-tree");
  if (!tree) return;

  if (results.length === 0) {
    tree.innerHTML = `<div style="padding:20px 12px;font-size:12px;color:var(--text-dim);text-align:center;">No notes match "${_esc(query)}"</div>`;
    return;
  }

  let html = `<div style="padding:6px 12px;font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.07em;">${results.length} result${results.length > 1 ? "s" : ""}</div>`;

  results.forEach(n => {
    let isActive = _currentSubject === n.subject && _currentUnit === n.unit && _currentChapter === n.chapter;
    let preview  = (n.content || "").substring(0, 60).replace(/[#*`\n]/g, " ");

    html += `<div class="notes-tree-chapter${isActive ? " active" : ""}"
      onclick="openNote('${_esc(n.subject)}','${_esc(n.unit)}','${_esc(n.chapter)}')"
      style="padding:8px 12px;flex-direction:column;align-items:flex-start;gap:2px;">
      <div style="display:flex;align-items:center;gap:6px;width:100%;">
        <span class="note-color-dot ${n.color || "default"}"></span>
        <strong style="font-size:12px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(n.chapter)}</strong>
      </div>
      <div style="font-size:10px;color:var(--text-muted);padding-left:13px;">${_esc(n.subject)} › ${_esc(n.unit)}</div>
      ${preview ? `<div style="font-size:11px;color:var(--text-dim);padding-left:13px;margin-top:2px;">${_esc(preview)}…</div>` : ""}
    </div>`;
  });

  tree.innerHTML = html;
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

  let bc = document.getElementById("notes-breadcrumb");
  if (bc) bc.textContent = `${subject} › ${unit}`;

  // Show unit view, hide others
  _showUnitView();

  document.getElementById("unit-view-title").textContent = `${unit} — All Notes`;

  // Fetch all chapter notes for this unit
  let { data: notes } = await fetchUnitNotes(subject, unit);

  // Get chapter order from studyData
  let subjectData = studyData.subjects[subject];
  let unitData    = subjectData?.units.find(u => u.name === unit);
  let chapters    = unitData?.chapters || [];

  let container = document.getElementById("unit-cards-container");
  container.innerHTML = "";

  if (chapters.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:30px;font-size:13px;">No chapters in this unit.</div>`;
    return;
  }

  // Build note lookup by chapter name
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
      // Preview first 120 chars of content, strip markdown
      let preview = (note.content || "").substring(0, 120).replace(/[#*`_\[\]!\n]/g, " ").trim();
      // Find first image in content
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

  if (window.innerWidth <= 600) closeSidebar();
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
  if (!_currentSubject) {
    alert("Open a chapter note first.");
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
// MOBILE SIDEBAR TOGGLE
// ─────────────────────────────────────────────────────────────────

function toggleSidebar() {
  _sidebarOpen ? closeSidebar() : openSidebar();
}

function openSidebar() {
  _sidebarOpen = true;
  document.getElementById("notes-sidebar").classList.add("open");
}

function closeSidebar() {
  _sidebarOpen = false;
  document.getElementById("notes-sidebar").classList.remove("open");
}

// ─────────────────────────────────────────────────────────────────
// VIEW SWITCHING (editor / unit view / empty)
// ─────────────────────────────────────────────────────────────────

function _showEditorWrap() {
  document.getElementById("notes-empty-state").style.display = "none";
  document.getElementById("notes-unit-view").style.display   = "none";
  let wrap = document.getElementById("notes-editor-wrap");
  wrap.style.display       = "flex";
  wrap.style.flexDirection = "column";
  wrap.style.flex          = "1";
  wrap.style.overflow      = "hidden";

  // Show save/preview buttons
  document.getElementById("btn-save-note").style.display    = "";
  document.getElementById("btn-preview-toggle").style.display = "";
}

function _showUnitView() {
  document.getElementById("notes-empty-state").style.display = "none";
  document.getElementById("notes-editor-wrap").style.display = "none";
  document.getElementById("notes-unit-view").style.display   = "flex";

  // Hide note-specific buttons
  document.getElementById("btn-save-note").style.display    = "none";
  document.getElementById("btn-preview-toggle").style.display = "none";
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
