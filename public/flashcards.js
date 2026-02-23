// flashcards.js — Medical Study OS
// Full logic for flashcards.html
// Depends on: data.js, utils.js, supabase.js, cloudinary.js,
//             cardSync.js (all CRUD + SM-2), cardCreator.js,
//             imageOcclusion.js
// ─────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
// MODULE STATE
// ══════════════════════════════════════════════════════════════════

// ── Review session ────────────────────────────────────────────────
let _reviewQueue     = [];     // cards to review this session
let _reviewIndex     = 0;      // current position in queue
let _reviewFlipped   = false;  // has the current card been flipped
let _reviewStartedAt = null;   // Date.now() when session started
let _reviewTimerInt  = null;   // setInterval handle for session clock
let _reviewRatings   = { 1: 0, 2: 0, 3: 0, 4: 0 };  // tally per rating
let _sessionActive   = false;

// ── Browse tab ────────────────────────────────────────────────────
let _browseAll       = [];     // full fetched card list
let _browseFiltered  = [];     // after filters + search

// ── Create tab ────────────────────────────────────────────────────
let _createType      = "basic";
let _createTags      = [];
let _frontImageUrl   = null;
let _backImageUrl    = null;
let _editingCardId   = null;   // null = new card, string = editing existing

// ── AI generate ───────────────────────────────────────────────────
let _aiCards         = [];     // parsed array from Claude response


// ══════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async function () {
  // Populate create-tab selectors from studyData
  _populateSubjectSelects();

  // Check URL params — ?tab=review|browse|create&subject=&unit=&chapter=
  let params  = new URLSearchParams(window.location.search);
  let tabParam = params.get("tab") || "review";
  switchTab(tabParam);

  // Pre-fill create tab if deep-linked from editor
  let subj = params.get("subject");
  let unit = params.get("unit");
  let chap = params.get("chapter");
  if (subj) {
    let sel = document.getElementById("create-subject");
    if (sel) { sel.value = subj; populateUnitSelect(); }
    setTimeout(() => {
      let usel = document.getElementById("create-unit");
      if (usel && unit) { usel.value = unit; populateChapterSelect(); }
      setTimeout(() => {
        let csel = document.getElementById("create-chapter");
        if (csel && chap) csel.value = chap;
      }, 50);
    }, 50);
  }

  // Load due count for start screen
  await _loadReviewStartScreen();

  // Load browse cards in background
  _loadBrowseCards();

  // Nav badge
  let count = await getDueCardCount();
  let badge = document.getElementById("nav-cards-badge");
  if (badge && count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "inline-block";
  }
});


// ══════════════════════════════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════════════════════════════

function switchTab(tabName) {
  document.querySelectorAll(".fc-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tabName);
  });
  document.querySelectorAll(".fc-panel").forEach(p => {
    p.classList.toggle("active", p.id === `panel-${tabName}`);
  });

  if (tabName === "browse" && _browseAll.length === 0) _loadBrowseCards();
}

// Wire tab clicks from HTML data-tab attributes
document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".fc-tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
});


// ══════════════════════════════════════════════════════════════════
// REVIEW TAB — START SCREEN
// ══════════════════════════════════════════════════════════════════

async function _loadReviewStartScreen() {
  let { data: dueCards } = await fetchDueCards(today());
  let count = dueCards?.length || 0;

  let countLabel = document.getElementById("due-count-label");
  let subLabel   = document.getElementById("due-sub-label");
  let startBtn   = document.getElementById("btn-start-review");

  if (count === 0) {
    // Show empty state
    document.getElementById("review-start-screen").style.display = "none";
    document.getElementById("review-empty-state").style.display  = "flex";
    return;
  }

  if (countLabel) countLabel.textContent = `${count} card${count === 1 ? "" : "s"} due`;

  // Estimate time: ~1.5 mins per card on average
  let estMins = Math.round(count * 1.5);
  let estStr  = estMins >= 60
    ? `${Math.floor(estMins / 60)}h ${estMins % 60}m`
    : `~${estMins} min${estMins !== 1 ? "s" : ""}`;
  if (subLabel) subLabel.textContent = `Estimated time: ${estStr}`;

  if (startBtn) startBtn.onclick = () => startReviewSession(dueCards);
}


// ══════════════════════════════════════════════════════════════════
// REVIEW TAB — SESSION ENGINE
// ══════════════════════════════════════════════════════════════════

function startReviewSession(cards) {
  if (!cards || cards.length === 0) return;

  _reviewQueue     = _sortReviewQueue(cards);
  _reviewIndex     = 0;
  _reviewFlipped   = false;
  _reviewRatings   = { 1: 0, 2: 0, 3: 0, 4: 0 };
  _reviewStartedAt = Date.now();
  _sessionActive   = true;

  // Hide start screen, show session
  document.getElementById("review-start-screen").style.display = "none";
  document.getElementById("review-empty-state").style.display  = "none";
  document.getElementById("review-session").style.display      = "block";

  // Start timer
  clearInterval(_reviewTimerInt);
  _reviewTimerInt = setInterval(_tickReviewTimer, 1000);

  _renderCurrentCard();
}

// Sort: most overdue first, new cards last
function _sortReviewQueue(cards) {
  let todayStr = today();
  return [...cards].sort((a, b) => {
    let aNew = a.interval_days === 0;
    let bNew = b.interval_days === 0;
    if (aNew && !bNew) return 1;
    if (!aNew && bNew) return -1;
    return a.next_review_date < b.next_review_date ? -1 : 1;
  });
}

function _renderCurrentCard() {
  if (_reviewIndex >= _reviewQueue.length) {
    _endSession();
    return;
  }

  let card = _reviewQueue[_reviewIndex];
  _reviewFlipped = false;

  // Reset flip
  let cardEl = document.getElementById("review-card");
  if (cardEl) cardEl.classList.remove("flipped");

  // Hide rating buttons
  let ratBtns = document.getElementById("review-rating-buttons");
  if (ratBtns) ratBtns.classList.remove("visible");

  // Populate front — handle image_occlusion separately
  if (card.card_type === "image_occlusion") {
    _setOcclusionFaces(card);
  } else {
    _setFace("front", card.front_text, card.front_image_url);
    _setFace("back",  _renderCardBack(card), card.back_image_url);
  }

  // Counter
  let counter = document.getElementById("review-card-counter");
  if (counter) counter.textContent = `Card ${_reviewIndex + 1} of ${_reviewQueue.length}`;

  // Progress bar
  let pct = (_reviewIndex / _reviewQueue.length) * 100;
  let fill  = document.getElementById("review-progress-fill");
  let label = document.getElementById("review-progress-label");
  if (fill)  fill.style.width = `${pct}%`;
  if (label) label.textContent = `${_reviewIndex} / ${_reviewQueue.length}`;
}

function _setFace(side, text, imgUrl) {
  let textEl = document.getElementById(`card-${side}-text`);
  let imgEl  = document.getElementById(`card-${side}-img`);

  if (textEl) textEl.innerHTML = text ? _renderCardText(text) : "";
  if (imgEl) {
    if (imgUrl) {
      imgEl.src = imgUrl;
      imgEl.style.display = "block";
    } else {
      imgEl.style.display = "none";
    }
  }
}

// Render image occlusion faces using imageOcclusion.js canvas painters
function _setOcclusionFaces(card) {
  // Clear text
  let frontText = document.getElementById("card-front-text");
  let backText  = document.getElementById("card-back-text");
  if (frontText) frontText.innerHTML = "";
  if (backText)  backText.innerHTML  = "";

  // Hide standard img elements
  let fi = document.getElementById("card-front-img");
  let bi = document.getElementById("card-back-img");
  if (fi) fi.style.display = "none";
  if (bi) bi.style.display = "none";

  // Parse stored occlusion JSON
  let data = null;
  try { data = JSON.parse(card.front_text || "{}"); } catch (_) {}
  if (!data || !data.imageUrl) {
    if (frontText) frontText.innerHTML = "⚠ Occlusion data missing";
    return;
  }

  // Inject canvases into both faces
  ["front", "back"].forEach(side => {
    let face    = document.getElementById(`card-${side}`);
    if (!face) return;
    let canvasId = `occ-canvas-${side}`;
    let existing = document.getElementById(canvasId);
    if (existing) existing.remove();
    let canvas = document.createElement("canvas");
    canvas.id = canvasId;
    canvas.style.cssText = "max-width:100%;border-radius:8px;margin-top:8px;";
    face.appendChild(canvas);
    if (side === "front" && typeof renderOcclusionFront === "function") {
      renderOcclusionFront(canvas, data);
    } else if (side === "back" && typeof renderOcclusionBack === "function") {
      renderOcclusionBack(canvas, data);
    }
  });
}

// Render cloze cards: hide {{tokens}} on front, reveal on back
function _renderCardText(text) {
  if (!text) return "";
  // Escape HTML first, then convert cloze markers
  let escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  // Replace {{word}} with a styled blank on front (handled per-side by caller)
  return escaped.replace(/\{\{(.+?)\}\}/g,
    `<span style="background:var(--blue);color:var(--blue);border-radius:3px;padding:0 4px;min-width:40px;display:inline-block;">$1</span>`
  );
}

// For cloze back face, reveal the hidden tokens
function _renderCardBack(card) {
  if (card.card_type === "cloze") {
    // Escape HTML first (same as _renderCardText), then highlight revealed tokens
    let escaped = (card.front_text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped.replace(/\{\{(.+?)\}\}/g,
      `<span style="background:rgba(16,185,129,0.25);color:#6ee7b7;border-radius:3px;padding:0 4px;font-weight:700;">$1</span>`
    );
  }
  return card.back_text || "";
}

// Flip card — clicking front flips to back, clicking back flips to front
function flipCard() {
  if (!_sessionActive) return;

  let cardEl  = document.getElementById("review-card");
  let ratBtns = document.getElementById("review-rating-buttons");

  if (!_reviewFlipped) {
    // Flip to back — show answer + rating buttons
    _reviewFlipped = true;
    if (cardEl)  cardEl.classList.add("flipped");
    if (ratBtns) ratBtns.classList.add("visible");
  } else {
    // Flip back to front — hide rating buttons
    _reviewFlipped = false;
    if (cardEl)  cardEl.classList.remove("flipped");
    if (ratBtns) ratBtns.classList.remove("visible");
  }
}

// Rate card — called by rating buttons
async function rateCard(rating) {
  if (!_sessionActive || !_reviewFlipped) return;

  let card = _reviewQueue[_reviewIndex];
  _reviewRatings[rating] = (_reviewRatings[rating] || 0) + 1;

  // Disable buttons briefly to prevent double-tap
  let ratBtns = document.getElementById("review-rating-buttons");
  if (ratBtns) ratBtns.classList.remove("visible");

  // Save review to Supabase (fire and don't await to keep UI snappy)
  saveReview(card.id, rating, card).then(({ error }) => {
    if (error) console.warn("saveReview error:", error);
  });

  // Update local card state for any "Again" (rating=1) re-queue
  if (rating === 1) {
    // Re-insert at end of queue so user sees it again this session
    _reviewQueue.push({ ...card, _requeued: true });
  }

  _reviewIndex++;
  _renderCurrentCard();
}

// Session clock
function _tickReviewTimer() {
  let elapsed = Math.floor((Date.now() - _reviewStartedAt) / 1000);
  let h = Math.floor(elapsed / 3600);
  let m = Math.floor((elapsed % 3600) / 60);
  let s = elapsed % 60;
  let str = h > 0
    ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`
    : `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  let el = document.getElementById("review-timer");
  if (el) el.textContent = str;
}

function _endSession() {
  _sessionActive = false;
  clearInterval(_reviewTimerInt);

  let elapsed    = Math.floor((Date.now() - _reviewStartedAt) / 1000);
  let totalRated = _reviewQueue.filter(c => !c._requeued).length;
  let goodEasy   = (_reviewRatings[3] || 0) + (_reviewRatings[4] || 0);
  let retention  = totalRated > 0 ? Math.round((goodEasy / totalRated) * 100) : 0;

  // Format elapsed time
  let mins = Math.floor(elapsed / 60);
  let secs = elapsed % 60;
  let timeStr = mins > 0
    ? `${mins} min${mins !== 1 ? "s" : ""} ${secs}s`
    : `${secs}s`;

  // Hide session, show complete screen
  document.getElementById("review-session").style.display         = "none";
  document.getElementById("review-complete-screen").style.display = "flex";

  // Populate summary
  document.getElementById("summary-again").textContent = _reviewRatings[1] || 0;
  document.getElementById("summary-hard").textContent  = _reviewRatings[2] || 0;
  document.getElementById("summary-good").textContent  = _reviewRatings[3] || 0;
  document.getElementById("summary-easy").textContent  = _reviewRatings[4] || 0;
  document.getElementById("summary-retention").textContent = `Retention rate: ${retention}%`;
  document.getElementById("summary-time").textContent       = `Time taken: ${timeStr}`;

  // Tomorrow count
  getDueCardCount(addDays(today(), 1)).then(tomorrowCount => {
    let el = document.getElementById("summary-tomorrow");
    if (el) el.textContent = `Next session: ${tomorrowCount} card${tomorrowCount !== 1 ? "s" : ""} due tomorrow`;
  });

  // Update nav badge to 0
  let badge = document.getElementById("nav-cards-badge");
  if (badge) badge.style.display = "none";
}


// ══════════════════════════════════════════════════════════════════
// BROWSE TAB
// ══════════════════════════════════════════════════════════════════

async function _loadBrowseCards() {
  // Populate subject filter from studyData
  let subjSel = document.getElementById("filter-subject");
  if (subjSel && subjSel.options.length === 1) {
    Object.keys(studyData.subjects || {}).forEach(s => {
      let opt = document.createElement("option");
      opt.value = s; opt.textContent = s;
      subjSel.appendChild(opt);
    });
  }

  let suspendedVal = document.getElementById("filter-suspended")?.value || "active";
  let suspended = suspendedVal === "suspended" ? true
                : suspendedVal === "all"       ? "all"
                : false;

  let { data } = await fetchCards({ suspended });
  _browseAll      = data || [];
  _browseFiltered = [..._browseAll];
  renderBrowseList();
}

function browseFilter() {
  let search    = (document.getElementById("browse-search")?.value || "").toLowerCase();
  let subject   = document.getElementById("filter-subject")?.value  || "";
  let unit      = document.getElementById("filter-unit")?.value     || "";
  let type      = document.getElementById("filter-type")?.value     || "";
  let suspVal   = document.getElementById("filter-suspended")?.value || "active";

  _browseFiltered = _browseAll.filter(card => {
    if (subject && card.subject !== subject) return false;
    if (unit    && card.unit    !== unit)    return false;
    if (type    && card.card_type !== type)  return false;
    if (suspVal === "active"    && card.is_suspended)  return false;
    if (suspVal === "suspended" && !card.is_suspended) return false;
    if (search) {
      let hay = ((card.front_text || "") + " " + (card.back_text || "")).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // If subject changed, update unit dropdown
  let unitSel = document.getElementById("filter-unit");
  if (unitSel && subject) {
    let units = [...new Set(_browseAll.filter(c => c.subject === subject).map(c => c.unit))];
    let current = unitSel.value;
    unitSel.innerHTML = `<option value="">All Units</option>`;
    units.forEach(u => {
      let opt = document.createElement("option");
      opt.value = u; opt.textContent = u;
      if (u === current) opt.selected = true;
      unitSel.appendChild(opt);
    });
  }

  renderBrowseList();
}

function renderBrowseList() {
  let list  = document.getElementById("browse-card-list");
  let empty = document.getElementById("browse-empty");
  if (!list) return;

  if (_browseFiltered.length === 0) {
    list.innerHTML = "";
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  list.innerHTML = _browseFiltered.map(card => {
    let frontPreview = (card.front_text || "").replace(/\{\{(.+?)\}\}/g, "[$1]").substring(0, 80);
    let due  = card.next_review_date <= today() ? `<span style="color:var(--red);font-weight:700;">Due</span>` : card.next_review_date;
    let type = { basic: "📄", cloze: "📝", image_occlusion: "🖼" }[card.card_type] || "📄";
    let susp = card.is_suspended ? `<span style="color:var(--text-dim);font-size:10px;">⏸ Suspended</span>` : "";

    return `<div class="fc-browse-item">
      <div class="fc-bi-content">
        <div class="fc-bi-front">${type} ${_fcEsc(frontPreview)}${frontPreview.length >= 80 ? "…" : ""}</div>
        <div class="fc-bi-meta">${_fcEsc(card.subject)} › ${_fcEsc(card.unit)} · ${due} ${susp}</div>
      </div>
      <div class="fc-bi-actions">
        <button class="fc-icon-btn" title="Edit"    onclick="editCard('${card.id}')">✏️</button>
        <button class="fc-icon-btn" title="${card.is_suspended ? "Unsuspend" : "Suspend"}"
          onclick="toggleSuspend('${card.id}', ${card.is_suspended})">
          ${card.is_suspended ? "▶️" : "⏸"}
        </button>
        <button class="fc-icon-btn" title="Delete"  onclick="confirmDeleteCard('${card.id}')">🗑️</button>
      </div>
    </div>`;
  }).join("");
}

async function toggleSuspend(cardId, currentlySuspended) {
  await setSuspended(cardId, !currentlySuspended);
  await _loadBrowseCards();
}

async function confirmDeleteCard(cardId) {
  if (!confirm("Delete this card? This cannot be undone.")) return;
  let { error } = await deleteCard(cardId);
  if (!error) await _loadBrowseCards();
}

function editCard(cardId) {
  let card = _browseAll.find(c => c.id === cardId);
  if (!card) return;
  switchTab("create");
  // Delegate all form population to cardCreator.js
  if (typeof loadCardForEdit === "function") loadCardForEdit(card);
}



// ════════════════════════════════════════════════════════════════
// CREATE TAB — form logic fully owned by cardCreator.js
// (setCardType, submitCard, handleTagInput, etc. declared there)
// ════════════════════════════════════════════════════════════════

// Boot: populate subject selects via cardCreator.js
function _populateSubjectSelects() {
  if (typeof populateSubjectSelects === "function") populateSubjectSelects();
}

// _resetCreateForm: delegate to cardCreator.js resetCreateForm()
function _resetCreateForm() {
  if (typeof resetCreateForm === "function") resetCreateForm();
}



// ══════════════════════════════════════════════════════════════════
// AI CARD GENERATOR
// ══════════════════════════════════════════════════════════════════

function openAiModal() {
  document.getElementById("ai-source-text").value    = "";
  document.getElementById("ai-generate-status").textContent = "";
  document.getElementById("ai-preview-list").innerHTML      = "";
  document.getElementById("ai-save-row").style.display      = "none";
  _aiCards = [];
  document.getElementById("ai-generate-modal").classList.add("open");
}

function closeAiModal() {
  document.getElementById("ai-generate-modal").classList.remove("open");
}

function closeAiModalOnBackdrop(event) {
  if (event.target === document.getElementById("ai-generate-modal")) closeAiModal();
}

async function runAiGenerate() {
  let sourceText = document.getElementById("ai-source-text")?.value.trim();
  if (!sourceText) {
    document.getElementById("ai-generate-status").textContent = "Please paste some text first.";
    return;
  }

  let subject = document.getElementById("create-subject")?.value || "";
  let unit    = document.getElementById("create-unit")?.value    || "";
  let chapter = document.getElementById("create-chapter")?.value || "";

  let btn = document.getElementById("btn-run-ai");
  btn.disabled    = true;
  btn.textContent = "Generating…";
  document.getElementById("ai-generate-status").textContent = "Calling Claude…";
  document.getElementById("ai-preview-list").innerHTML      = "";
  document.getElementById("ai-save-row").style.display      = "none";

  let prompt = `You are a medical education expert creating spaced-repetition flashcards.

Generate flashcards from the following medical text. Return ONLY a valid JSON array with no preamble, no markdown fences, just raw JSON.

Format:
[
  {"front_text": "Question?", "back_text": "Answer.", "card_type": "basic", "tags": ["tag1"]},
  {"front_text": "The {{mitochondria}} is the powerhouse of the cell.", "back_text": "", "card_type": "cloze", "tags": ["cell-biology"]}
]

Rules:
- Use card_type "cloze" for fill-in-the-blank (wrap hidden word in {{double braces}})
- Use card_type "basic" for Q&A pairs
- Focus on high-yield, exam-relevant facts
- Keep fronts concise (under 20 words)
- Generate 5-15 cards
- For cloze cards, back_text can be empty string

Context: ${chapter || "Medical"} (${subject} › ${unit})

TEXT:
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

    if (!response.ok) throw new Error(data?.error?.message || `API error ${response.status}`);

    let raw = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");

    // Strip any accidental markdown fences
    raw = raw.replace(/```json|```/g, "").trim();

    _aiCards = JSON.parse(raw);
    if (!Array.isArray(_aiCards)) throw new Error("Response was not a JSON array.");

    _renderAiPreview();
    document.getElementById("ai-generate-status").textContent = `${_aiCards.length} cards generated — review and edit below.`;
    document.getElementById("ai-save-row").style.display = "flex";

  } catch (err) {
    document.getElementById("ai-generate-status").textContent = "Error: " + err.message;
    console.error("runAiGenerate:", err);
  } finally {
    btn.disabled    = false;
    btn.textContent = "Generate Cards";
  }
}

function _renderAiPreview() {
  let list = document.getElementById("ai-preview-list");
  if (!list) return;

  list.innerHTML = _aiCards.map((card, i) => `
    <div class="ai-preview-card" id="ai-card-${i}">
      <div class="ai-preview-card-header">
        <span>${card.card_type === "cloze" ? "📝 Cloze" : "📄 Basic"}</span>
        <button onclick="removeAiCard(${i})"
          style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;margin:0;min-height:unset;padding:0;">✕</button>
      </div>
      <div style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin-bottom:3px;">Front</div>
      <textarea rows="2" oninput="_aiCards[${i}].front_text=this.value"
        style="width:100%;background:transparent;border:none;color:var(--text);font-size:13px;font-family:inherit;resize:none;outline:none;min-height:unset;padding:0;margin:0;"
      >${_fcEsc(card.front_text || "")}</textarea>
      ${card.card_type !== "cloze" ? `
        <div style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin:6px 0 3px;">Back</div>
        <textarea rows="2" oninput="_aiCards[${i}].back_text=this.value"
          style="width:100%;background:transparent;border:none;color:var(--text-muted);font-size:12px;font-family:inherit;resize:none;outline:none;min-height:unset;padding:0;margin:0;"
        >${_fcEsc(card.back_text || "")}</textarea>
      ` : ""}
      ${card.tags?.length ? `<div style="margin-top:5px;">${card.tags.map(t => `<span style="background:rgba(59,130,246,0.15);color:var(--blue);border-radius:20px;padding:1px 8px;font-size:10px;font-weight:700;">${_fcEsc(t)}</span>`).join(" ")}</div>` : ""}
    </div>`
  ).join("");
}

function removeAiCard(index) {
  _aiCards.splice(index, 1);
  _renderAiPreview();
  if (_aiCards.length === 0) {
    document.getElementById("ai-save-row").style.display = "none";
    document.getElementById("ai-generate-status").textContent = "All cards removed.";
  }
}

async function saveAiCards() {
  if (!_aiCards.length) return;

  let subject = document.getElementById("create-subject")?.value || "";
  let unit    = document.getElementById("create-unit")?.value    || "";
  let chapter = document.getElementById("create-chapter")?.value || "";

  let btn = document.querySelector("#ai-save-row button:last-child");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }

  let cards = _aiCards.map(c => ({
    subject,
    unit:      unit    || "",
    chapter:   chapter || "",
    card_type: c.card_type  || "basic",
    front_text: c.front_text || "",
    back_text:  c.back_text  || null,
    tags:       c.tags       || [],
  }));

  let { error } = await saveBatchCards(cards);

  if (btn) { btn.disabled = false; btn.textContent = "Save All Cards"; }

  if (error) {
    document.getElementById("ai-generate-status").textContent = "Save failed: " + (error.message || error);
    return;
  }

  document.getElementById("ai-generate-status").textContent = `✓ ${cards.length} cards saved!`;
  document.getElementById("ai-save-row").style.display = "none";
  document.getElementById("ai-preview-list").innerHTML = "";
  _aiCards = [];

  setTimeout(closeAiModal, 1200);
  _loadBrowseCards();
}


// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function _fcEsc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Override getDueCardCount to support a date arg (for tomorrow count in summary)
async function getDueCardCount(date) {
  const userId = (JSON.parse(localStorage.getItem("studyData") || "{}")).userId
               || localStorage.getItem("userId");
  if (!userId) return 0;
  let d = date || today();
  const { count, error } = await supabaseClient
    .from("flashcards")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_suspended", false)
    .lte("next_review_date", d);
  return error ? 0 : (count ?? 0);
}


// ══════════════════════════════════════════════════════════════════
// GLOBALS EXPOSED TO flashcards.html INLINE HANDLERS
// ══════════════════════════════════════════════════════════════════
//   switchTab(tabName)
//   flipCard()
//   rateCard(rating)
//   browseFilter()
//   toggleSuspend(cardId, currentlySuspended)
//   confirmDeleteCard(cardId)
//   editCard(cardId)
//   setCardType(type)
//   updateClozePreview()
//   populateUnitSelect()
//   populateChapterSelect()
//   handleImageSelect(side, inputEl)
//   removeImage(side)
//   handleTagInput(event)
//   removeCreateTag(index)
//   saveCard()
//   openAiModal()
//   closeAiModal()
//   closeAiModalOnBackdrop(event)
//   runAiGenerate()
//   removeAiCard(index)
//   saveAiCards()
