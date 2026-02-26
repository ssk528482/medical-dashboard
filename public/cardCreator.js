// cardCreator.js — Medical Study OS
// Card creation form logic for create.html
// Handles: type switching, image uploads, tag chips,
//          cascading subject/unit/chapter dropdowns, edit mode.
//
// Depends on:
//   data.js      → studyData (subjects/units/chapters)
//   utils.js     → today()
//   cloudinary.js → uploadToCloudinary(), uploadWithProgress(),
//                   CLOUDINARY_FOLDERS
//   cardSync.js  → saveCard(), saveBatchCards()
//
// All state is module-private (underscore prefix).
// Public functions are listed at the bottom.
// ─────────────────────────────────────────────────────────────────

// ── Module state ──────────────────────────────────────────────────
let _ccType         = "basic";   // current card type
let _ccTags         = [];        // current tag list
let _ccFrontUrl     = null;      // uploaded front image URL
let _ccBackUrl      = null;      // uploaded back image URL
let _ccEditId       = null;      // null = new card, string = editing existing

// ─────────────────────────────────────────────────────────────────
// TYPE SWITCHER
// ─────────────────────────────────────────────────────────────────

/**
 * Switch the active card type (basic | cloze | image_occlusion).
 * Called by type-btn onclick in create.html.
 */
function setCardType(type) {
  _ccType = type;

  // Highlight active button
  document.querySelectorAll(".type-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });

  // Show / hide sections
  _el("back-group")      && (_el("back-group").style.display     = type === "image_occlusion" ? "none"  : "block");
  _el("cloze-hint")      && (_el("cloze-hint").style.display     = type === "cloze"           ? "block" : "none");
  _el("occlusion-area")  && (_el("occlusion-area").style.display = type === "image_occlusion" ? "block" : "none");
  _el("front-upload-box") && (_el("front-upload-box").style.display = type === "image_occlusion" ? "none" : "block");

  // Relabel back field depending on type
  let backLabel = _el("back-group")?.querySelector(".form-label");
  let backArea  = _el("back");
  if (backLabel) backLabel.textContent = type === "cloze" ? "Details (optional)" : "Back";
  if (backArea)  backArea.placeholder  = type === "cloze"
    ? "Extra notes, mnemonics or tips shown after the answer is revealed…"
    : "Answer or explanation…";

  // Reset occlusion canvas if switching away
  if (type !== "image_occlusion" && typeof resetOcclusionCanvas === "function") {
    resetOcclusionCanvas();
  }
}

// ─────────────────────────────────────────────────────────────────
// SUBJECT / UNIT / CHAPTER CASCADE DROPDOWNS
// ─────────────────────────────────────────────────────────────────

/**
 * Populate all subject selects from studyData.
 * Called once on page boot by flashcards.js.
 */
function populateSubjectSelects() {
  ["create-subject", "filter-subject"].forEach(id => {
    let sel = _el(id);
    if (!sel) return;
    // Keep first placeholder option, replace the rest
    while (sel.options.length > 1) sel.remove(1);
    Object.keys(studyData.subjects || {}).sort().forEach(s => {
      let opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      sel.appendChild(opt);
    });
  });
}

/**
 * Called when create-subject changes.
 * Repopulates create-unit and clears create-chapter.
 */
function populateUnitSelect() {
  let subj    = _val("create-subject");
  let unitSel = _el("create-unit");
  if (!unitSel) return;

  unitSel.innerHTML = `<option value="">Unit</option>`;

  if (subj && studyData.subjects[subj]) {
    studyData.subjects[subj].units.forEach(u => {
      let opt = document.createElement("option");
      opt.value = u.name; opt.textContent = u.name;
      unitSel.appendChild(opt);
    });
  }
  populateChapterSelect(); // cascade
}

/**
 * Called when create-unit changes.
 * Repopulates create-chapter.
 */
function populateChapterSelect() {
  let subj    = _val("create-subject");
  let unit    = _val("create-unit");
  let chapSel = _el("create-chapter");
  if (!chapSel) return;

  chapSel.innerHTML = `<option value="">Chapter</option>`;

  if (subj && unit && studyData.subjects[subj]) {
    let unitObj = studyData.subjects[subj].units.find(u => u.name === unit);
    if (unitObj) {
      unitObj.chapters.forEach(ch => {
        let opt = document.createElement("option");
        opt.value = ch.name; opt.textContent = ch.name;
        chapSel.appendChild(opt);
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// IMAGE UPLOADS
// ─────────────────────────────────────────────────────────────────

/**
 * Called by onchange on front-file-input / back-file-input.
 * @param {"front"|"back"} side
 * @param {HTMLInputElement} inputEl
 */
async function handleImageSelect(side, inputEl) {
  let file = inputEl.files[0];
  if (!file) return;

  let progressEl = _el(`${side}-upload-progress`);
  if (progressEl) { progressEl.style.display = "block"; progressEl.textContent = "Uploading…"; }

  try {
    let folder = side === "front"
      ? CLOUDINARY_FOLDERS.FLASHCARD_FRONT
      : CLOUDINARY_FOLDERS.FLASHCARD_BACK;

    let { url } = await uploadWithProgress(file, folder, progressEl);

    if (side === "front") _ccFrontUrl = url;
    else                  _ccBackUrl  = url;

    _showImagePreview(side, url);
    if (progressEl) progressEl.style.display = "none";

  } catch (err) {
    if (progressEl) { progressEl.style.display = "block"; progressEl.textContent = "Upload failed: " + err.message; }
    console.error("handleImageSelect:", err);
  }
  inputEl.value = ""; // allow re-selecting same file
}

/**
 * Remove a front or back image.
 * Called by the ✕ button on image previews.
 */
function removeImage(side) {
  if (side === "front") _ccFrontUrl = null;
  else                  _ccBackUrl  = null;

  let wrap = _el(`${side}-preview-wrap`);
  let img  = _el(`${side}-preview-img`);
  if (wrap) wrap.style.display = "none";
  if (img)  img.src = "";
}

function _showImagePreview(side, url) {
  let wrap = _el(`${side}-preview-wrap`);
  let img  = _el(`${side}-preview-img`);
  if (wrap) wrap.style.display = "block";
  if (img)  img.src = url;
}

// ─────────────────────────────────────────────────────────────────
// TAG CHIPS
// ─────────────────────────────────────────────────────────────────

/**
 * Keydown handler on the tag text input.
 * Enter or comma → add tag.  Backspace on empty → remove last tag.
 */
function handleTagInput(event) {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    let val = event.target.value.trim().replace(/,$/, "");
    if (val && !_ccTags.includes(val)) {
      _ccTags.push(val);
      _renderTagChips();
    }
    event.target.value = "";
  } else if (event.key === "Backspace" && event.target.value === "" && _ccTags.length > 0) {
    _ccTags.pop();
    _renderTagChips();
  }
}

/**
 * Remove a single tag by index.
 * Called by the ✕ on each chip.
 */
function removeCreateTag(index) {
  _ccTags.splice(index, 1);
  _renderTagChips();
}

function _renderTagChips() {
  let wrap  = _el("tag-input-wrap");
  let input = _el("tag-text-input");
  if (!wrap || !input) return;

  wrap.querySelectorAll(".tag-chip").forEach(c => c.remove());

  _ccTags.forEach((tag, i) => {
    let chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.innerHTML = `${_ccEsc(tag)}<span class="tag-chip-remove" onclick="removeCreateTag(${i})">✕</span>`;
    wrap.insertBefore(chip, input);
  });
}

// ─────────────────────────────────────────────────────────────────
// CLOZE PREVIEW (live)
// ─────────────────────────────────────────────────────────────────

/**
 * Called oninput on the front textarea when card type = cloze.
 * Provides a subtle visual hint that {{tokens}} are detected.
 */
function updateClozePreview() {
  if (_ccType !== "cloze") return;
  let val  = _val("create-front") || "";
  let hint = _el("cloze-hint");
  if (!hint) return;

  let count = (val.match(/\{\{.+?\}\}/g) || []).length;
  let msg   = count > 0
    ? `💡 <strong>${count}</strong> blank${count !== 1 ? "s" : ""} detected. Back face will auto-reveal them.`
    : `💡 Wrap words to hide with <strong>{{double braces}}</strong>. Example: <em>The {{mitochondria}} is the powerhouse of the cell.</em>`;

  hint.querySelector("div").innerHTML = msg;
}

// ─────────────────────────────────────────────────────────────────
// SAVE / EDIT
// ─────────────────────────────────────────────────────────────────

/**
 * Submit the create form — saves a new card or updates an existing one.
 * Named submitCard to avoid colliding with cardSync.saveCard().
 */
async function submitCard() {
  let front   = (_val("create-front") || "").trim();
  let back    = (_val("create-back")  || "").trim();
  let subject = _val("create-subject") || "";
  let unit    = _val("create-unit")    || "";
  let chapter = _val("create-chapter") || "";
  let statusEl = _el("create-status");

  // ── Validation ──────────────────────────────────────────────
  if (!front) {
    _setStatus("Front text is required.", true);
    return;
  }
  // Cloze cards: back text is optional (front_text contains the {{blanks}})
  // Basic cards: need back text OR an image
  if (_ccType === "basic" && !back && !_ccFrontUrl && !_ccBackUrl) {
    _setStatus("Add back text or an image.", true);
    return;
  }
  // Cloze cards must have at least one {{blank}}
  if (_ccType === "cloze" && !(front.match(/\{\{.+?\}\}/))) {
    _setStatus("Cloze cards need at least one {{blank}}. Wrap the answer word with double braces.", true);
    return;
  }
  if (!subject) {
    _setStatus("Please link to a subject.", true);
    return;
  }

  // ── For image_occlusion, collect boxes from canvas ───────────
  let occlusionData = null;
  if (_ccType === "image_occlusion" && typeof getOcclusionBoxes === "function") {
    occlusionData = getOcclusionBoxes();
    if (!occlusionData || !occlusionData.imageUrl) {
      _setStatus("Upload a diagram image first.", true);
      return;
    }
    if (occlusionData.boxes.length === 0) {
      _setStatus("Draw at least one occlusion box.", true);
      return;
    }
  }

  let btn = _el("btn-save-card");
  if (btn) btn.disabled = true;
  _setStatus("Saving…");

  let cardObj = {
    id:              _ccEditId || undefined,
    subject,
    unit:            unit    || "",
    chapter:         chapter || "",
    card_type:       _ccType,
    front_text:      _ccType === "image_occlusion"
                       ? JSON.stringify(occlusionData)   // store full occlusion JSON in front_text
                       : front,
    back_text:       _ccType === "image_occlusion" ? null : (back || null),
    front_image_url: _ccType === "image_occlusion" ? (occlusionData?.imageUrl || null) : _ccFrontUrl,
    back_image_url:  _ccBackUrl,
    tags:            _ccTags,
  };

  // saveCard is from cardSync.js
  let { error } = await saveCard(cardObj);

  if (btn) btn.disabled = false;

  if (error) {
    _setStatus("Save failed: " + (error.message || JSON.stringify(error)), true);
    console.error("submitCard:", error);
    return;
  }

  _setStatus(_ccEditId ? "Card updated ✓" : "Card saved ✓ — form cleared for next card.");
  if (!_ccEditId) {
    _resetForm();
  } else {
    _ccEditId = null;
    _setStatus("Card updated ✓");
  }

  // Tell flashcards.js to refresh browse list
  if (typeof _loadBrowseCards === "function") _loadBrowseCards();
}

/**
 * Load an existing card into the create form for editing.
 * Called by flashcards.js editCard().
 * @param {Object} card - full card object from cardSync
 */
function loadCardForEdit(card) {
  _ccEditId   = card.id;
  _ccType     = card.card_type  || "basic";
  _ccTags     = card.tags       || [];
  _ccFrontUrl = card.front_image_url || null;
  _ccBackUrl  = card.back_image_url  || null;

  setCardType(_ccType);

  let frontTA = _el("create-front");
  let backTA  = _el("create-back");

  // For occlusion cards, the front_text holds JSON — don't show raw JSON
  if (_ccType === "image_occlusion" && typeof loadOcclusionData === "function") {
    try {
      let data = JSON.parse(card.front_text || "{}");
      loadOcclusionData(data);
    } catch (_) {}
    if (frontTA) frontTA.value = "";
  } else {
    if (frontTA) frontTA.value = card.front_text || "";
  }
  if (backTA) backTA.value = card.back_text || "";

  // Cascading dropdowns
  let subjSel = _el("create-subject");
  if (subjSel) {
    subjSel.value = card.subject || "";
    populateUnitSelect();
    // Defer until DOM cascade settles
    requestAnimationFrame(() => {
      let uSel = _el("create-unit");
      if (uSel) { uSel.value = card.unit || ""; populateChapterSelect(); }
      requestAnimationFrame(() => {
        let cSel = _el("create-chapter");
        if (cSel) cSel.value = card.chapter || "";
      });
    });
  }

  // Image previews
  if (_ccFrontUrl) _showImagePreview("front", _ccFrontUrl);
  if (_ccBackUrl)  _showImagePreview("back",  _ccBackUrl);

  _renderTagChips();
  _setStatus("Editing card — make changes then save.");

  // Scroll to top of form
  _el("panel-create")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/**
 * Reset the create form to blank/defaults.
 */
function resetCreateForm() {
  _resetForm();
}

function _resetForm() {
  _el("create-front") && (_el("create-front").value = "");
  _el("create-back")  && (_el("create-back").value  = "");
  _ccTags    = [];
  _ccFrontUrl = null;
  _ccBackUrl  = null;
  _ccEditId  = null;
  removeImage("front");
  removeImage("back");
  _renderTagChips();
  setCardType("basic");
  if (typeof resetOcclusionCanvas === "function") resetOcclusionCanvas();
  _setStatus("");
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────

function _el(id)    { return document.getElementById(id); }
function _val(id)   { return _el(id)?.value || ""; }

function _setStatus(msg, isError = false) {
  let el = _el("create-status");
  if (!el) return;
  el.textContent  = msg;
  el.style.color  = isError ? "var(--red, #ef4444)" : "var(--blue, #3b82f6)";
}

function _ccEsc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC API (globals for create.html + review.html)
// ─────────────────────────────────────────────────────────────────
//   setCardType(type)               — type-btn onclick
//   populateSubjectSelects()        — called once on boot
//   populateUnitSelect()            — create-subject onchange
//   populateChapterSelect()         — create-unit onchange
//   handleImageSelect(side, input)  — file input onchange
//   removeImage(side)               — remove-image-btn onclick
//   handleTagInput(event)           — tag-text-input onkeydown
//   removeCreateTag(index)          — chip ✕ onclick
//   updateClozePreview()            — create-front oninput
//   submitCard()                    — btn-save-card onclick
//   loadCardForEdit(card)           — called by flashcards.js editCard()
//   resetCreateForm()               — called by flashcards.js _resetCreateForm()
