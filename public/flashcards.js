// flashcards.js — Medical Study OS
// Full logic for flashcards.html
// Features: Review (side-nav entry), Browse (accordion+bulk delete+select+quick-add+stats),
//           Create, CSV Import, Edit/Delete in Review, Streak, Keyboard Shortcuts,
//           Cloze fix, Note→Card bridge entry point
// ─────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════
// MODULE STATE
// ══════════════════════════════════════════════════════════════════

let _reviewQueue     = [];
let _reviewIndex     = 0;
let _reviewFlipped   = false;
let _reviewStartedAt = null;
let _reviewTimerInt  = null;
let _reviewRatings   = { 1: 0, 2: 0, 3: 0, 4: 0 };
let _sessionActive   = false;
let _reviewStreak    = 0;

let _browseAll        = [];
let _browseSubTab     = "new";
let _browseSelectMode = false;
let _selectedCardIds  = new Set();

let _aiCards    = [];
let _confirmAction = null;
let _csvParsed  = [];


// ══════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════

document.addEventListener("DOMContentLoaded", async function () {
  _populateSubjectSelects();

  let params   = new URLSearchParams(window.location.search);
  let tabParam = params.get("tab") || "browse";
  showPanel(tabParam);

  // Pre-fill create tab if deep-linked
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

  await _loadReviewStartScreen();
  _loadBrowseCards();

  let count = await getDueCardCount();
  let badge = document.getElementById("nav-review-badge");
  if (badge && count > 0) {
    badge.textContent = count > 99 ? "99+" : count;
    badge.style.display = "inline-block";
  }

  document.addEventListener("keydown", _handleReviewKeydown);
  _csvPopulateSubjects();

  // Note → Cards bridge: if redirected from notes page
  let n2c = params.get("n2c");
  if (n2c === "1") {
    try {
      let n2cContent = sessionStorage.getItem("n2c_content");
      let n2cSubject = sessionStorage.getItem("n2c_subject");
      let n2cUnit    = sessionStorage.getItem("n2c_unit");
      let n2cChapter = sessionStorage.getItem("n2c_chapter");
      sessionStorage.removeItem("n2c_content");
      sessionStorage.removeItem("n2c_subject");
      sessionStorage.removeItem("n2c_unit");
      sessionStorage.removeItem("n2c_chapter");
      if (n2cContent) {
        setTimeout(() => openAiModalWithContent(n2cContent, n2cSubject, n2cUnit, n2cChapter), 200);
      }
    } catch(e) {}
  }

  document.addEventListener("click", function(e) {
    if (!e.target.closest(".fc-acc-section-menu")) {
      document.querySelectorAll(".fc-acc-menu-dropdown.open").forEach(d => d.classList.remove("open"));
    }
  });
});


// ══════════════════════════════════════════════════════════════════
// PANEL SWITCHING
// ══════════════════════════════════════════════════════════════════

function showPanel(name) {
  let tabBar  = document.getElementById("fc-tabs-bar");
  let titleEl = document.getElementById("fc-page-title");

  ["review","browse","create"].forEach(n => {
    let p = document.getElementById("panel-" + n);
    if (p) p.style.display = "none";
  });

  let target = document.getElementById("panel-" + name);
  if (target) target.style.display = "block";

  if (name === "review") {
    if (tabBar)  tabBar.style.display  = "none";
    if (titleEl) titleEl.textContent   = "🔁 Review";
    document.querySelectorAll(".side-nav-item").forEach(a => {
      let href = a.getAttribute("href") || "";
      a.classList.toggle("active", href.includes("tab=review"));
    });
  } else {
    if (tabBar)  tabBar.style.display  = "flex";
    if (titleEl) titleEl.textContent   = "🃏 Flashcards";
    document.querySelectorAll(".fc-tab").forEach(t => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.querySelectorAll(".side-nav-item").forEach(a => {
      let href = a.getAttribute("href") || "";
      let isCards = href === "flashcards.html" && !href.includes("tab=review");
      a.classList.toggle("active", isCards);
    });
    if (name === "browse" && _browseAll.length === 0) _loadBrowseCards();
  }
}

function switchTab(name) { showPanel(name); }

document.addEventListener("DOMContentLoaded", function () {
  document.querySelectorAll(".fc-tab").forEach(tab => {
    tab.addEventListener("click", () => showPanel(tab.dataset.tab));
  });
});


// ══════════════════════════════════════════════════════════════════
// REVIEW — START SCREEN
// ══════════════════════════════════════════════════════════════════

async function _loadReviewStartScreen() {
  let { data: dueCards } = await fetchDueCards(today());
  let count = dueCards?.length || 0;
  let countLabel = document.getElementById("due-count-label");
  let subLabel   = document.getElementById("due-sub-label");
  let startBtn   = document.getElementById("btn-start-review");

  if (count === 0) {
    document.getElementById("review-start-screen").style.display = "none";
    document.getElementById("review-empty-state").style.display  = "flex";
    return;
  }

  if (countLabel) countLabel.textContent = count + " card" + (count === 1 ? "" : "s") + " due";
  let estMins = Math.round(count * 1.5);
  let estStr  = estMins >= 60
    ? Math.floor(estMins / 60) + "h " + (estMins % 60) + "m"
    : "~" + estMins + " min" + (estMins !== 1 ? "s" : "");
  if (subLabel) subLabel.textContent = "Estimated time: " + estStr;
  if (startBtn) startBtn.onclick = () => startReviewSession(dueCards);
}


// ══════════════════════════════════════════════════════════════════
// REVIEW — SESSION ENGINE
// ══════════════════════════════════════════════════════════════════

function startReviewSession(cards) {
  if (!cards || cards.length === 0) return;
  _reviewQueue     = _sortReviewQueue(cards);
  _reviewIndex     = 0;
  _reviewFlipped   = false;
  _reviewRatings   = { 1:0, 2:0, 3:0, 4:0 };
  _reviewStreak    = 0;
  _reviewStartedAt = Date.now();
  _sessionActive   = true;

  document.getElementById("review-start-screen").style.display = "none";
  document.getElementById("review-empty-state").style.display  = "none";
  document.getElementById("review-session").style.display      = "block";

  clearInterval(_reviewTimerInt);
  _reviewTimerInt = setInterval(_tickReviewTimer, 1000);
  _renderCurrentCard();
}

function _sortReviewQueue(cards) {
  return [...cards].sort((a, b) => {
    let aNew = a.interval_days === 0;
    let bNew = b.interval_days === 0;
    if (aNew && !bNew) return 1;
    if (!aNew && bNew) return -1;
    return a.next_review_date < b.next_review_date ? -1 : 1;
  });
}

function _renderCurrentCard() {
  if (_reviewIndex >= _reviewQueue.length) { _endSession(); return; }

  let card = _reviewQueue[_reviewIndex];
  _reviewFlipped = false;

  let cardEl  = document.getElementById("review-card");
  let ratBtns = document.getElementById("review-rating-buttons");
  let actBtns = document.getElementById("review-card-actions");
  if (cardEl)  cardEl.classList.remove("flipped");
  if (ratBtns) ratBtns.classList.remove("visible");
  if (actBtns) actBtns.classList.remove("visible");

  if (card.card_type === "image_occlusion") {
    _setOcclusionFaces(card);
  } else {
    _setFaceText("front", card.front_text, card.front_image_url);
    if (card.card_type === "cloze") {
      _setFaceHtml("back", _renderClozeBack(card.front_text), card.back_image_url);
    } else {
      _setFaceText("back", card.back_text, card.back_image_url);
    }
  }

  let counter = document.getElementById("review-card-counter");
  if (counter) counter.textContent = "Card " + (_reviewIndex + 1) + " of " + _reviewQueue.length;

  let pct   = (_reviewIndex / _reviewQueue.length) * 100;
  let fill  = document.getElementById("review-progress-fill");
  let label = document.getElementById("review-progress-label");
  if (fill)  fill.style.width    = pct + "%";
  if (label) label.textContent   = _reviewIndex + " / " + _reviewQueue.length;
}

// Set face content: text is HTML-escaped, cloze blanks styled
function _setFaceText(side, text, imgUrl) {
  let textEl = document.getElementById("card-" + side + "-text");
  let imgEl  = document.getElementById("card-" + side + "-img");
  if (textEl) textEl.innerHTML = text ? _renderCardText(text) : "";
  if (imgEl) {
    if (imgUrl) { imgEl.src = imgUrl; imgEl.style.display = "block"; }
    else        { imgEl.src = "";     imgEl.style.display = "none"; }
  }
}

// Set face with already-built HTML (for cloze back reveal)
function _setFaceHtml(side, html, imgUrl) {
  let textEl = document.getElementById("card-" + side + "-text");
  let imgEl  = document.getElementById("card-" + side + "-img");
  if (textEl) textEl.innerHTML = html || "";
  if (imgEl) {
    if (imgUrl) { imgEl.src = imgUrl; imgEl.style.display = "block"; }
    else        { imgEl.src = "";     imgEl.style.display = "none"; }
  }
}

function _setOcclusionFaces(card) {
  ["front","back"].forEach(side => {
    let t = document.getElementById("card-" + side + "-text");
    let i = document.getElementById("card-" + side + "-img");
    if (t) t.innerHTML = "";
    if (i) i.style.display = "none";
  });
  let data = null;
  try { data = JSON.parse(card.front_text || "{}"); } catch(_) {}
  if (!data || !data.imageUrl) {
    let ft = document.getElementById("card-front-text");
    if (ft) ft.innerHTML = "⚠ Occlusion data missing";
    return;
  }
  ["front","back"].forEach(side => {
    let face = document.getElementById("card-" + side);
    if (!face) return;
    let canvasId = "occ-canvas-" + side;
    let ex = document.getElementById(canvasId);
    if (ex) ex.remove();
    let canvas = document.createElement("canvas");
    canvas.id = canvasId;
    canvas.style.cssText = "max-width:100%;border-radius:8px;margin-top:8px;";
    face.appendChild(canvas);
    if (side === "front" && typeof renderOcclusionFront === "function") renderOcclusionFront(canvas, data);
    else if (side === "back"  && typeof renderOcclusionBack  === "function") renderOcclusionBack(canvas, data);
  });
}

// Escape HTML and style {{cloze}} as hidden blanks (front face)
function _renderCardText(text) {
  if (!text) return "";
  let esc = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return esc.replace(/\{\{(.+?)\}\}/g,
    '<span style="background:var(--blue);color:var(--blue);border-radius:3px;padding:0 4px;min-width:40px;display:inline-block;user-select:none;">$1</span>');
}

// Escape HTML and reveal {{cloze}} tokens in green (back face)
function _renderClozeBack(frontText) {
  if (!frontText) return "";
  let esc = frontText.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  return esc.replace(/\{\{(.+?)\}\}/g,
    '<span style="background:rgba(16,185,129,0.25);color:#6ee7b7;border-radius:3px;padding:0 4px;font-weight:700;">$1</span>');
}

function flipCard() {
  if (!_sessionActive) return;
  let cardEl  = document.getElementById("review-card");
  let ratBtns = document.getElementById("review-rating-buttons");
  let actBtns = document.getElementById("review-card-actions");
  if (!_reviewFlipped) {
    _reviewFlipped = true;
    if (cardEl)  cardEl.classList.add("flipped");
    if (ratBtns) ratBtns.classList.add("visible");
    if (actBtns) actBtns.classList.add("visible");
  } else {
    _reviewFlipped = false;
    if (cardEl)  cardEl.classList.remove("flipped");
    if (ratBtns) ratBtns.classList.remove("visible");
    if (actBtns) actBtns.classList.remove("visible");
  }
}

async function rateCard(rating) {
  if (!_sessionActive || !_reviewFlipped) return;
  let card = _reviewQueue[_reviewIndex];
  _reviewRatings[rating] = (_reviewRatings[rating] || 0) + 1;

  if (rating >= 3) _reviewStreak++;
  else             _reviewStreak = 0;
  _updateStreakBadge();

  let ratBtns = document.getElementById("review-rating-buttons");
  if (ratBtns) ratBtns.classList.remove("visible");
  let actBtns = document.getElementById("review-card-actions");
  if (actBtns) actBtns.classList.remove("visible");

  saveReview(card.id, rating, card).then(({ error }) => {
    if (error) console.warn("saveReview error:", error);
  });

  if (rating === 1) {
    _reviewQueue.push(Object.assign({}, card, { _requeued: true }));
  }

  _reviewIndex++;
  _renderCurrentCard();
}

function _updateStreakBadge() {
  let badge = document.getElementById("review-streak-badge");
  if (!badge) return;
  if (_reviewStreak >= 3) {
    badge.textContent = "🔥 " + _reviewStreak;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }
}

function _tickReviewTimer() {
  let elapsed = Math.floor((Date.now() - _reviewStartedAt) / 1000);
  let h = Math.floor(elapsed / 3600);
  let m = Math.floor((elapsed % 3600) / 60);
  let s = elapsed % 60;
  let str = h > 0
    ? h + ":" + String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0")
    : String(m).padStart(2,"0") + ":" + String(s).padStart(2,"0");
  let el = document.getElementById("review-timer");
  if (el) el.textContent = str;
}

function _endSession() {
  _sessionActive = false;
  clearInterval(_reviewTimerInt);

  let elapsed    = Math.floor((Date.now() - _reviewStartedAt) / 1000);
  let totalRated = _reviewQueue.filter(c => !c._requeued).length;
  let goodEasy   = (_reviewRatings[3]||0) + (_reviewRatings[4]||0);
  let retention  = totalRated > 0 ? Math.round((goodEasy / totalRated) * 100) : 0;
  let mins = Math.floor(elapsed / 60);
  let secs = elapsed % 60;
  let timeStr = mins > 0 ? mins + " min" + (mins !== 1 ? "s" : "") + " " + secs + "s" : secs + "s";

  document.getElementById("review-session").style.display         = "none";
  document.getElementById("review-complete-screen").style.display = "flex";

  document.getElementById("summary-again").textContent     = _reviewRatings[1] || 0;
  document.getElementById("summary-hard").textContent      = _reviewRatings[2] || 0;
  document.getElementById("summary-good").textContent      = _reviewRatings[3] || 0;
  document.getElementById("summary-easy").textContent      = _reviewRatings[4] || 0;
  document.getElementById("summary-retention").textContent = "Retention rate: " + retention + "%";
  document.getElementById("summary-time").textContent      = "Time taken: " + timeStr;

  getDueCardCount(addDays(today(), 1)).then(tomorrowCount => {
    let el = document.getElementById("summary-tomorrow");
    if (el) el.textContent = "Next session: " + tomorrowCount + " card" + (tomorrowCount !== 1 ? "s" : "") + " due tomorrow";
  });

  let badge = document.getElementById("nav-review-badge");
  if (badge) badge.style.display = "none";
}


// ══════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════════

function _handleReviewKeydown(e) {
  let panel = document.getElementById("panel-review");
  if (!panel || panel.style.display === "none") return;
  if (!_sessionActive) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;

  if (e.code === "Space") {
    e.preventDefault(); flipCard();
  } else if (e.key === "1" && _reviewFlipped) { rateCard(1); }
  else if (e.key === "2" && _reviewFlipped)   { rateCard(2); }
  else if (e.key === "3" && _reviewFlipped)   { rateCard(3); }
  else if (e.key === "4" && _reviewFlipped)   { rateCard(4); }
  else if ((e.key === "e" || e.key === "E") && _reviewFlipped) { reviewEditCard(); }
}


// ══════════════════════════════════════════════════════════════════
// EDIT / DELETE DURING REVIEW
// ══════════════════════════════════════════════════════════════════

function reviewEditCard() {
  if (!_sessionActive || _reviewIndex >= _reviewQueue.length) return;
  let card = _reviewQueue[_reviewIndex];
  if (card.card_type === "image_occlusion") {
    alert("Image occlusion cards must be edited in the Create tab."); return;
  }
  document.getElementById("ecm-front").value = card.front_text || "";
  document.getElementById("ecm-back").value  = card.back_text  || "";
  document.getElementById("edit-card-modal").classList.add("open");
}

function closeEditCardModal() {
  document.getElementById("edit-card-modal").classList.remove("open");
}
function closeEditCardModalOnBackdrop(e) {
  if (e.target === document.getElementById("edit-card-modal")) closeEditCardModal();
}

async function saveEditCardModal() {
  if (!_sessionActive || _reviewIndex >= _reviewQueue.length) return;
  let card  = _reviewQueue[_reviewIndex];
  let front = document.getElementById("ecm-front").value.trim();
  let back  = document.getElementById("ecm-back").value.trim();
  if (!front) { alert("Front text is required."); return; }

  let { error } = await saveCard({
    id: card.id,
    front_text: front,
    back_text:  back || null,
    card_type:  card.card_type,
    subject:    card.subject,
    unit:       card.unit,
    chapter:    card.chapter,
    tags:       card.tags,
  });
  if (error) { alert("Save failed: " + (error.message || error)); return; }

  _reviewQueue[_reviewIndex] = Object.assign({}, _reviewQueue[_reviewIndex], { front_text: front, back_text: back });
  closeEditCardModal();
  _renderCurrentCard();
  _loadBrowseCards();
}

function reviewDeleteCard() {
  if (!_sessionActive || _reviewIndex >= _reviewQueue.length) return;
  let card = _reviewQueue[_reviewIndex];
  openConfirmModal(
    "Delete this card?",
    '"' + _fcEsc((card.front_text || "").slice(0, 80)) + '"<br><br>This cannot be undone.',
    async () => {
      let { error } = await deleteCard(card.id);
      if (error) { alert("Delete failed: " + (error.message || error)); return; }
      _reviewQueue.splice(_reviewIndex, 1);
      if (_reviewIndex >= _reviewQueue.length && _reviewQueue.length > 0) _reviewIndex = _reviewQueue.length - 1;
      _loadBrowseCards();
      if (_reviewQueue.length === 0) { _endSession(); return; }
      _renderCurrentCard();
    },
    "Delete"
  );
}


// ══════════════════════════════════════════════════════════════════
// BROWSE — ACCORDION
// ══════════════════════════════════════════════════════════════════

// Collect which subjects/units are currently open in the accordion
function _getAccordionOpenStates() {
  let open = { subjects: new Set(), units: new Set() };
  document.querySelectorAll(".fc-acc-subject.open").forEach(el => {
    open.subjects.add(el.id);
  });
  document.querySelectorAll(".fc-acc-unit.open").forEach(el => {
    open.units.add(el.id);
  });
  return open;
}

// Re-render accordion then restore previously open items
function _renderAccordionPreservingState() {
  let open = _getAccordionOpenStates();
  renderBrowseAccordion();
  // Restore open states
  open.subjects.forEach(id => {
    let el = document.getElementById(id);
    if (el) el.classList.add("open");
  });
  open.units.forEach(id => {
    let el = document.getElementById(id);
    if (el) {
      el.classList.add("open");
      let chevron = el.querySelector(".fc-acc-chevron");
      if (chevron) chevron.textContent = "▾";
    }
  });
}

async function _loadBrowseCards() {
  let open = _getAccordionOpenStates();
  let { data } = await fetchCards({ suspended: false });
  _browseAll = data || [];
  renderBrowseAccordion();
  // Restore open states after fresh render
  open.subjects.forEach(id => {
    let el = document.getElementById(id);
    if (el) el.classList.add("open");
  });
  open.units.forEach(id => {
    let el = document.getElementById(id);
    if (el) {
      el.classList.add("open");
      let chevron = el.querySelector(".fc-acc-chevron");
      if (chevron) chevron.textContent = "▾";
    }
  });
}

function switchBrowseSubTab(tab) {
  _browseSubTab = tab;
  document.getElementById("browse-sub-new")?.classList.toggle("active", tab === "new");
  document.getElementById("browse-sub-revise")?.classList.toggle("active", tab === "revise");
  document.getElementById("browse-sub-all")?.classList.toggle("active", tab === "all");
  renderBrowseAccordion();
}

function browseSearch()  { renderBrowseAccordion(); }
function browseFilter()  { browseSearch(); }

function renderBrowseAccordion() {
  let accordion = document.getElementById("browse-accordion");
  if (!accordion) return;

  let searchQ  = (document.getElementById("browse-search")?.value || "").toLowerCase().trim();
  let todayStr = today();

  let cards = _browseAll.filter(c => {
    if (_browseSubTab === "new")    return c.interval_days === 0 || c.interval_days == null;
    if (_browseSubTab === "revise") return (c.interval_days > 0) && (c.next_review_date <= todayStr);
    return true;
  });

  if (searchQ) {
    cards = cards.filter(c => {
      let hay = ((c.front_text||"") + " " + (c.back_text||"") + " " +
                 (c.subject||"") + " " + (c.unit||"") + " " + (c.chapter||"")).toLowerCase();
      return hay.includes(searchQ);
    });
  }

  if (!cards.length) {
    accordion.innerHTML = '<div class="fc-browse-loading" style="color:var(--text-dim);">' +
      (searchQ ? 'No cards matching "' + _fcEsc(searchQ) + '"' :
        _browseSubTab === "new" ? "No new cards" :
        _browseSubTab === "revise" ? "No cards due for revision" : "No cards yet") + "</div>";
    return;
  }

  // Group subject → unit → chapter
  let grouped = {};
  cards.forEach(c => {
    let s  = c.subject  || "Uncategorised";
    let u  = c.unit     || "General";
    let ch = c.chapter  || "General";
    if (!grouped[s])      grouped[s]    = {};
    if (!grouped[s][u])   grouped[s][u] = {};
    if (!grouped[s][u][ch]) grouped[s][u][ch] = [];
    grouped[s][u][ch].push(c);
  });

  let isRevise = _browseSubTab === "revise";
  let btnClass = isRevise ? "revise" : "";
  let btnLabel = isRevise ? "Revise" : "Learn";

  accordion.innerHTML = Object.entries(grouped).map(function([subj, units]) {
    let subjCount = Object.values(units).reduce((a, u) =>
      a + Object.values(u).reduce((b, chs) => b + chs.length, 0), 0);

    let unitsHtml = Object.entries(units).map(function([unit, chapters]) {
      let unitCount   = Object.values(chapters).reduce((a, chs) => a + chs.length, 0);
      let unitCardIds = Object.values(chapters).flat().map(c => c.id);

      let chapHtml = Object.entries(chapters).map(function([chap, cCards]) {
        let chapCardIds  = cCards.map(c => c.id);
        let allReviewed  = cCards.length > 0 && cCards.every(c => c.interval_days > 0);
        let completeMark = allReviewed ? '<span class="fc-chapter-complete" title="All reviewed">✅</span>' : "";

        let cardRows = cCards.map(function(c) {
          let frontSnip  = (c.front_text || "").slice(0, 55);
          let truncated  = (c.front_text || "").length > 55 ? "…" : "";
          let nextDate   = c.next_review_date ? c.next_review_date.slice(5) : "new";
          let statsHtml  = '<span class="fc-card-stats-pill" title="SRS stats">' +
            'Int: ' + (c.interval_days||0) + 'd · Rep: ' + (c.reps||0) + ' · Next: ' + nextDate + '</span>';
          let cbHtml = _browseSelectMode
            ? '<input type="checkbox" class="browse-select-cb" data-id="' + c.id + '" ' +
              'onchange="browseCardToggle(\'' + c.id + '\',this.checked)" ' +
              (_selectedCardIds.has(c.id) ? "checked" : "") + ">"
            : "";
          return '<div class="fc-card-row">' +
            cbHtml +
            '<span class="fc-card-row-front">' + _fcEsc(frontSnip) + truncated + '</span>' +
            statsHtml +
            '<div class="fc-card-row-actions">' +
              '<button class="fc-card-row-btn edit" onclick="event.stopPropagation();editCard(\'' + c.id + '\')" title="Edit">✏️</button>' +
              '<button class="fc-card-row-btn del"  onclick="event.stopPropagation();confirmDeleteCard(\'' + c.id + '\')" title="Delete">🗑️</button>' +
            '</div></div>';
        }).join("");

        let qaId     = ("qa-" + subj + "-" + unit + "-" + chap).replace(/[^a-z0-9]/gi,"_");
        let cMenuId  = ("cmenu-" + subj + "-" + unit + "-" + chap).replace(/[^a-z0-9]/gi,"_");
        let chapIds  = JSON.stringify(chapCardIds);

        let qaForm = '<div class="fc-quick-add-form" id="form-' + qaId + '">' +
          '<div class="fc-quick-add-row">' +
            '<div style="flex:1;display:flex;flex-direction:column;gap:6px;">' +
              '<textarea class="fc-quick-add-textarea" id="qa-front-' + qaId + '" placeholder="Front (question or cloze with {{blanks}})…" rows="2"></textarea>' +
              '<textarea class="fc-quick-add-textarea" id="qa-back-' + qaId  + '" placeholder="Back (answer — leave blank for cloze)…" rows="2"></textarea>' +
            '</div>' +
            '<div style="display:flex;flex-direction:column;gap:6px;">' +
              '<select class="fc-quick-add-type" id="qa-type-' + qaId + '"><option value="basic">Basic</option><option value="cloze">Cloze</option></select>' +
              '<button class="fc-quick-add-save" onclick="quickAddSave(' +
                "'" + _fcEsc(subj) + "','" + _fcEsc(unit) + "','" + _fcEsc(chap) + "','" + qaId + "'" +
              ')">+ Add</button>' +
              '<button class="fc-quick-add-cancel" onclick="quickAddClose(\'' + qaId + '\')">Cancel</button>' +
            '</div></div></div>';

        return '<div class="fc-acc-chapter" style="flex-direction:column;align-items:stretch;padding:0;">' +
          '<div style="display:flex;align-items:center;gap:6px;padding:8px 16px 8px 44px;flex-wrap:wrap;">' +
            completeMark +
            '<span class="fc-acc-chapter-name">' + _fcEsc(chap) + '</span>' +
            '<span class="fc-acc-chapter-count">' + cCards.length + ' card' + (cCards.length !== 1 ? "s" : "") + '</span>' +
            '<button class="fc-acc-learn-btn ' + btnClass + '" onclick="startFilteredSession(' + chapIds + ')">' + btnLabel + ' ' + cCards.length + '</button>' +
            '<button class="fc-add-chapter-btn" onclick="quickAddOpen(\'' + qaId + '\')">+ Quick Add</button>' +
            '<div class="fc-acc-section-menu">' +
              '<button class="fc-acc-menu-btn" onclick="toggleAccMenu(\'' + cMenuId + '\',event)">⋮</button>' +
              '<div class="fc-acc-menu-dropdown" id="' + cMenuId + '">' +
                '<button class="fc-acc-menu-item" onclick="toggleAccMenu(\'' + cMenuId + '\');startFilteredSession(' + chapIds + ')">' + btnLabel + ' all ' + cCards.length + '</button>' +
                '<button class="fc-acc-menu-item" onclick="toggleAccMenu(\'' + cMenuId + '\');selectCardIds(' + chapIds + ')">☑ Select all</button>' +
                '<button class="fc-acc-menu-item danger" onclick="toggleAccMenu(\'' + cMenuId + '\');confirmBulkDelete(' + chapIds + ',\'' + _fcEsc(chap) + '\')">🗑️ Delete all (' + cCards.length + ')</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          qaForm +
          '<div id="cards-' + qaId + '">' + cardRows + '</div>' +
        '</div>';
      }).join("");

      let uMenuId = ("umenu-" + subj + "-" + unit).replace(/[^a-z0-9]/gi,"_");
      let uIds    = JSON.stringify(unitCardIds);
      return '<div class="fc-acc-unit" id="fc-unit-' + _fcEsc(subj) + '-' + _fcEsc(unit) + '">' +
        '<div class="fc-acc-unit-head" onclick="toggleBrowseUnit(this)">' +
          '<span class="fc-acc-chevron" style="font-size:10px;margin-right:2px;">▸</span>' +
          '<span class="fc-acc-unit-name">' + _fcEsc(unit) + '</span>' +
          '<span class="fc-acc-subject-count ' + (isRevise && unitCount > 0 ? "has-due" : "") + '">' + unitCount + '</span>' +
          '<button class="fc-acc-learn-btn ' + btnClass + '" onclick="event.stopPropagation();startFilteredSession(' + uIds + ')">' + btnLabel + ' ' + unitCount + '</button>' +
          '<div class="fc-acc-section-menu" onclick="event.stopPropagation()">' +
            '<button class="fc-acc-menu-btn" onclick="toggleAccMenu(\'' + uMenuId + '\',event)">⋮</button>' +
            '<div class="fc-acc-menu-dropdown" id="' + uMenuId + '">' +
              '<button class="fc-acc-menu-item" onclick="toggleAccMenu(\'' + uMenuId + '\');selectCardIds(' + uIds + ')">☑ Select all in unit</button>' +
              '<button class="fc-acc-menu-item danger" onclick="toggleAccMenu(\'' + uMenuId + '\');confirmBulkDelete(' + uIds + ',\'' + _fcEsc(unit) + '\')">🗑️ Delete all unit (' + unitCount + ')</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="fc-acc-chapters">' + chapHtml + '</div>' +
      '</div>';
    }).join("");

    let subjCardIds = cards.filter(c => (c.subject || "Uncategorised") === subj).map(c => c.id);
    let sMenuId = ("smenu-" + subj).replace(/[^a-z0-9]/gi,"_");
    let sIds    = JSON.stringify(subjCardIds);
    return '<div class="fc-acc-subject" id="fc-subj-' + _fcEsc(subj) + '">' +
      '<div class="fc-acc-subject-head" onclick="toggleBrowseSubject(this)">' +
        '<span class="fc-acc-subject-name">' + _fcEsc(subj) + '</span>' +
        '<span class="fc-acc-subject-count ' + (isRevise && subjCount > 0 ? "has-due" : "") + '">' + subjCount + ' cards</span>' +
        '<button class="fc-acc-learn-btn ' + btnClass + '" onclick="event.stopPropagation();startFilteredSession(' + sIds + ')">' + btnLabel + ' ' + subjCount + '</button>' +
        '<span class="fc-acc-chevron">▾</span>' +
        '<div class="fc-acc-section-menu" onclick="event.stopPropagation()">' +
          '<button class="fc-acc-menu-btn" onclick="toggleAccMenu(\'' + sMenuId + '\',event)">⋮</button>' +
          '<div class="fc-acc-menu-dropdown" id="' + sMenuId + '">' +
            '<button class="fc-acc-menu-item" onclick="toggleAccMenu(\'' + sMenuId + '\');selectCardIds(' + sIds + ')">☑ Select all in subject</button>' +
            '<button class="fc-acc-menu-item danger" onclick="toggleAccMenu(\'' + sMenuId + '\');confirmBulkDelete(' + sIds + ',\'' + _fcEsc(subj) + '\')">🗑️ Delete all subject (' + subjCount + ')</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fc-acc-units">' + unitsHtml + '</div>' +
    '</div>';
  }).join("");
}

function toggleBrowseSubject(headEl) { headEl.closest(".fc-acc-subject").classList.toggle("open"); }
function toggleBrowseUnit(headEl) {
  let unit = headEl.closest(".fc-acc-unit");
  unit.classList.toggle("open");
  let chevron = headEl.querySelector(".fc-acc-chevron");
  if (chevron) chevron.textContent = unit.classList.contains("open") ? "▾" : "▸";
}
function toggleAccMenu(menuId, event) {
  if (event) event.stopPropagation();
  let menu = document.getElementById(menuId);
  if (!menu) return;
  let wasOpen = menu.classList.contains("open");
  document.querySelectorAll(".fc-acc-menu-dropdown.open").forEach(d => d.classList.remove("open"));
  if (!wasOpen) menu.classList.add("open");
}

async function startFilteredSession(cardIds) {
  if (!cardIds || cardIds.length === 0) return;
  let cards = _browseAll.filter(c => cardIds.includes(c.id));
  if (!cards.length) return;
  showPanel("review");
  setTimeout(() => startReviewSession(cards), 60);
}

function renderBrowseList() { renderBrowseAccordion(); }

async function toggleSuspend(cardId, currentlySuspended) {
  await setSuspended(cardId, !currentlySuspended);
  await _loadBrowseCards();
}

async function confirmDeleteCard(cardId) {
  let card = _browseAll.find(c => c.id === cardId);
  openConfirmModal(
    "Delete card?",
    '"' + _fcEsc((card?.front_text || "").slice(0, 80)) + '"<br><br>This cannot be undone.',
    async () => {
      let { error } = await deleteCard(cardId);
      if (!error) await _loadBrowseCards();
      else alert("Delete failed: " + (error.message || error));
    },
    "Delete"
  );
}

function editCard(cardId) {
  let card = _browseAll.find(c => c.id === cardId);
  if (!card) return;
  showPanel("create");
  if (typeof loadCardForEdit === "function") loadCardForEdit(card);
}


// ── Browse: Select Mode ────────────────────────────────────────────

function toggleBrowseSelectMode() {
  _browseSelectMode = !_browseSelectMode;
  if (!_browseSelectMode) {
    _selectedCardIds.clear();
    _hideBulkBar();
  }
  let btn = document.getElementById("browse-select-btn");
  if (btn) {
    if (_browseSelectMode) {
      btn.textContent = "✕ Done";
      btn.style.cssText += ";background:rgba(239,68,68,0.12);color:var(--red);border-color:rgba(239,68,68,0.3);";
    } else {
      btn.textContent = "☑ Select";
      btn.style.background = ""; btn.style.color = ""; btn.style.borderColor = "";
    }
  }
  _renderAccordionPreservingState();
}

function browseCardToggle(cardId, checked) {
  if (checked) _selectedCardIds.add(cardId);
  else         _selectedCardIds.delete(cardId);
  _updateBulkBar();
  // Update all checkboxes for this card (in case there are duplicates) without re-rendering
  document.querySelectorAll('.browse-select-cb[data-id="' + cardId + '"]').forEach(cb => {
    cb.checked = checked;
  });
}

function selectCardIds(ids) {
  let wasSelectMode = _browseSelectMode;
  ids.forEach(id => _selectedCardIds.add(id));
  if (!_browseSelectMode) {
    _browseSelectMode = true;
    let btn = document.getElementById("browse-select-btn");
    if (btn) { btn.textContent = "✕ Done"; btn.style.background="rgba(239,68,68,0.12)"; btn.style.color="var(--red)"; btn.style.borderColor="rgba(239,68,68,0.3)"; }
  }
  _updateBulkBar();
  // If we just entered select mode, re-render to add checkboxes; otherwise just check them
  if (!wasSelectMode) {
    _renderAccordionPreservingState();
  } else {
    ids.forEach(id => {
      document.querySelectorAll('.browse-select-cb[data-id="' + id + '"]').forEach(cb => { cb.checked = true; });
    });
  }
}

function _updateBulkBar() {
  let count = _selectedCardIds.size;
  let bar   = document.getElementById("browse-bulk-bar");
  let label = document.getElementById("browse-bulk-count");
  if (label) label.textContent = count + " card" + (count !== 1 ? "s" : "") + " selected";
  if (bar) {
    if (count > 0) bar.classList.add("visible");
    else           bar.classList.remove("visible");
  }
}

function _hideBulkBar() {
  let bar = document.getElementById("browse-bulk-bar");
  if (bar) bar.classList.remove("visible");
}

async function bulkDeleteSelected() {
  let ids = [..._selectedCardIds];
  if (!ids.length) return;
  openConfirmModal(
    "Delete " + ids.length + " card" + (ids.length !== 1 ? "s" : "") + "?",
    "You are about to permanently delete <strong>" + ids.length + " card" + (ids.length !== 1 ? "s" : "") + "</strong>. This cannot be undone.",
    async () => {
      let errors = 0;
      for (let id of ids) {
        let { error } = await deleteCard(id);
        if (error) errors++;
      }
      _selectedCardIds.clear();
      _hideBulkBar();
      _browseSelectMode = false;
      let btn = document.getElementById("browse-select-btn");
      if (btn) { btn.textContent = "☑ Select"; btn.style.background=""; btn.style.color=""; btn.style.borderColor=""; }
      await _loadBrowseCards();
      if (errors > 0) alert(errors + " cards failed to delete.");
    },
    "Delete " + ids.length
  );
}

function confirmBulkDelete(cardIds, label) {
  openConfirmModal(
    'Delete all cards in "' + label + '"?',
    "<strong>" + cardIds.length + " card" + (cardIds.length !== 1 ? "s" : "") + "</strong> will be permanently deleted. This cannot be undone.",
    async () => {
      let errors = 0;
      for (let id of cardIds) {
        let { error } = await deleteCard(id);
        if (error) errors++;
      }
      await _loadBrowseCards();
      if (errors > 0) alert(errors + " cards failed to delete.");
    },
    "Delete " + cardIds.length
  );
}


// ── Browse: Quick Add ──────────────────────────────────────────────

function quickAddOpen(qaId) {
  let form = document.getElementById("form-" + qaId);
  if (form) form.classList.add("open");
}

function quickAddClose(qaId) {
  let form = document.getElementById("form-" + qaId);
  if (form) form.classList.remove("open");
  let f = document.getElementById("qa-front-" + qaId);
  let b = document.getElementById("qa-back-" + qaId);
  if (f) f.value = "";
  if (b) b.value = "";
}

async function quickAddSave(subject, unit, chapter, qaId) {
  let frontEl = document.getElementById("qa-front-" + qaId);
  let backEl  = document.getElementById("qa-back-"  + qaId);
  let typeEl  = document.getElementById("qa-type-"  + qaId);
  let front = (frontEl?.value || "").trim();
  let back  = (backEl?.value  || "").trim();
  let type  = typeEl?.value || "basic";

  if (!front) { if (frontEl) frontEl.focus(); return; }
  if (type === "basic" && !back) { if (backEl) backEl.focus(); return; }

  let saveBtn = document.querySelector("#form-" + qaId + " .fc-quick-add-save");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "…"; }

  let { error } = await saveCard({
    subject, unit, chapter,
    card_type:  type,
    front_text: front,
    back_text:  back || null,
    tags: [],
  });

  if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "+ Add"; }
  if (error)   { alert("Save failed: " + (error.message || error)); return; }

  quickAddClose(qaId);
  await _loadBrowseCards();
}


// ══════════════════════════════════════════════════════════════════
// CONFIRM MODAL
// ══════════════════════════════════════════════════════════════════

function openConfirmModal(title, body, action, okLabel, okClass) {
  _confirmAction = action;
  let t  = document.getElementById("confirm-modal-title");
  let b  = document.getElementById("confirm-modal-body");
  let ok = document.getElementById("confirm-modal-ok");
  if (t)  t.textContent = title;
  if (b)  b.innerHTML   = body;
  if (ok) {
    ok.textContent = okLabel || "Delete";
    ok.className   = "gen-modal-confirm" + (okClass ? " " + okClass : "");
  }
  document.getElementById("confirm-modal").classList.add("open");
}

function closeConfirmModal() {
  document.getElementById("confirm-modal").classList.remove("open");
  _confirmAction = null;
}
function closeConfirmModalOnBackdrop(e) {
  if (e.target === document.getElementById("confirm-modal")) closeConfirmModal();
}
async function runConfirmAction() {
  closeConfirmModal();
  if (_confirmAction) await _confirmAction();
}


// ══════════════════════════════════════════════════════════════════
// CREATE TAB — delegates to cardCreator.js
// ══════════════════════════════════════════════════════════════════

function _populateSubjectSelects() {
  if (typeof populateSubjectSelects === "function") populateSubjectSelects();
}
function _resetCreateForm() {
  if (typeof resetCreateForm === "function") resetCreateForm();
}


// ══════════════════════════════════════════════════════════════════
// AI CARD GENERATOR
// ══════════════════════════════════════════════════════════════════

function openAiModal() {
  document.getElementById("ai-source-text").value           = "";
  document.getElementById("ai-generate-status").textContent = "";
  document.getElementById("ai-preview-list").innerHTML      = "";
  document.getElementById("ai-save-row").style.display      = "none";
  _aiCards = [];
  document.getElementById("ai-generate-modal").classList.add("open");
}

// Called from notes page Note→Card bridge
function openAiModalWithContent(text, subject, unit, chapter) {
  showPanel("create");
  setTimeout(() => {
    openAiModal();
    let ta = document.getElementById("ai-source-text");
    if (ta) ta.value = text || "";
    if (subject) {
      let sel = document.getElementById("create-subject");
      if (sel) { sel.value = subject; if (typeof populateUnitSelect === "function") populateUnitSelect(); }
      setTimeout(() => {
        let uSel = document.getElementById("create-unit");
        if (uSel && unit) { uSel.value = unit; if (typeof populateChapterSelect === "function") populateChapterSelect(); }
        setTimeout(() => {
          let cSel = document.getElementById("create-chapter");
          if (cSel && chapter) cSel.value = chapter;
        }, 60);
      }, 60);
    }
  }, 80);
}

function closeAiModal() {
  document.getElementById("ai-generate-modal").classList.remove("open");
}
function closeAiModalOnBackdrop(event) {
  if (event.target === document.getElementById("ai-generate-modal")) closeAiModal();
}

async function runAiGenerate() {
  let sourceText = document.getElementById("ai-source-text")?.value.trim();
  if (!sourceText) { document.getElementById("ai-generate-status").textContent = "Please paste some text first."; return; }

  let subject = document.getElementById("create-subject")?.value || "";
  let unit    = document.getElementById("create-unit")?.value    || "";
  let chapter = document.getElementById("create-chapter")?.value || "";

  let btn = document.getElementById("btn-run-ai");
  btn.disabled = true; btn.textContent = "Generating…";
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

Context: ${chapter || "Medical"} (${subject} > ${unit})

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
    if (!response.ok) throw new Error(data?.error?.message || "API error " + response.status);

    let raw = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    raw = raw.replace(/```json|```/g, "").trim();
    _aiCards = JSON.parse(raw);
    if (!Array.isArray(_aiCards)) throw new Error("Response was not a JSON array.");

    _renderAiPreview();
    document.getElementById("ai-generate-status").textContent = _aiCards.length + " cards generated — review and edit below.";
    document.getElementById("ai-save-row").style.display = "flex";
  } catch (err) {
    document.getElementById("ai-generate-status").textContent = "Error: " + err.message;
    console.error("runAiGenerate:", err);
  } finally {
    btn.disabled = false; btn.textContent = "Generate Cards";
  }
}

function _renderAiPreview() {
  let list = document.getElementById("ai-preview-list");
  if (!list) return;
  list.innerHTML = _aiCards.map((card, i) =>
    '<div class="ai-preview-card" id="ai-card-' + i + '">' +
      '<div class="ai-preview-card-header">' +
        '<span>' + (card.card_type === "cloze" ? "📝 Cloze" : "📄 Basic") + '</span>' +
        '<button onclick="removeAiCard(' + i + ')" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:14px;margin:0;min-height:unset;padding:0;">✕</button>' +
      '</div>' +
      '<div style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin-bottom:3px;">Front</div>' +
      '<textarea rows="2" oninput="_aiCards[' + i + '].front_text=this.value" style="width:100%;background:transparent;border:none;color:var(--text);font-size:13px;font-family:inherit;resize:none;outline:none;min-height:unset;padding:0;margin:0;">' + _fcEsc(card.front_text || "") + '</textarea>' +
      (card.card_type !== "cloze" ?
        '<div style="font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;margin:6px 0 3px;">Back</div>' +
        '<textarea rows="2" oninput="_aiCards[' + i + '].back_text=this.value" style="width:100%;background:transparent;border:none;color:var(--text-muted);font-size:12px;font-family:inherit;resize:none;outline:none;min-height:unset;padding:0;margin:0;">' + _fcEsc(card.back_text || "") + '</textarea>'
        : "") +
      (card.tags?.length ? '<div style="margin-top:5px;">' + card.tags.map(t => '<span style="background:rgba(59,130,246,0.15);color:var(--blue);border-radius:20px;padding:1px 8px;font-size:10px;font-weight:700;">' + _fcEsc(t) + '</span>').join(" ") + '</div>' : "") +
    '</div>'
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
    subject, unit: unit||"", chapter: chapter||"",
    card_type:  c.card_type  || "basic",
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

  document.getElementById("ai-generate-status").textContent = "✓ " + cards.length + " cards saved!";
  document.getElementById("ai-save-row").style.display = "none";
  document.getElementById("ai-preview-list").innerHTML = "";
  _aiCards = [];
  setTimeout(closeAiModal, 1200);
  _loadBrowseCards();
}


// ══════════════════════════════════════════════════════════════════
// CSV IMPORT
// ══════════════════════════════════════════════════════════════════

function openCsvImportModal() {
  document.getElementById("csv-import-modal").classList.add("open");
  _csvPopulateSubjects();
  document.getElementById("csv-paste-area").value             = "";
  document.getElementById("csv-preview-container").style.display = "none";
  document.getElementById("csv-import-btn").style.display     = "none";
  document.getElementById("csv-import-status").textContent    = "";
  document.getElementById("csv-column-map").style.display     = "none";
  _csvParsed = [];
}

function closeCsvImportModal() {
  document.getElementById("csv-import-modal").classList.remove("open");
}
function closeCsvModalOnBackdrop(e) {
  if (e.target === document.getElementById("csv-import-modal")) closeCsvImportModal();
}

function _csvPopulateSubjects() {
  let sel = document.getElementById("csv-subject");
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select subject —</option>';
  Object.keys(studyData.subjects || {}).sort().forEach(s => {
    let opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  });
}

function csvPopulateUnits() {
  let subj = document.getElementById("csv-subject")?.value || "";
  let uSel = document.getElementById("csv-unit");
  if (!uSel) return;
  uSel.innerHTML = '<option value="">— Select unit —</option>';
  if (subj && studyData.subjects[subj]) {
    studyData.subjects[subj].units.forEach(u => {
      let opt = document.createElement("option");
      opt.value = u.name; opt.textContent = u.name;
      uSel.appendChild(opt);
    });
  }
  csvPopulateChapters();
}

function csvPopulateChapters() {
  let subj = document.getElementById("csv-subject")?.value || "";
  let unit = document.getElementById("csv-unit")?.value    || "";
  let cSel = document.getElementById("csv-chapter");
  if (!cSel) return;
  cSel.innerHTML = '<option value="">— Select chapter —</option>';
  if (subj && unit && studyData.subjects[subj]) {
    let unitObj = studyData.subjects[subj].units.find(u => u.name === unit);
    if (unitObj) {
      unitObj.chapters.forEach(ch => {
        let opt = document.createElement("option");
        opt.value = ch.name; opt.textContent = ch.name;
        cSel.appendChild(opt);
      });
    }
  }
}

function csvLoadFile(inputEl) {
  let file = inputEl.files[0];
  if (!file) return;
  let reader = new FileReader();
  reader.onload = e => {
    document.getElementById("csv-paste-area").value = e.target.result;
    csvParse();
  };
  reader.readAsText(file);
  inputEl.value = "";
}

function _csvGetDelimiter() {
  let d = document.getElementById("csv-delimiter")?.value || "comma";
  return { comma: ",", tab: "\t", pipe: "|", semicolon: ";" }[d] || ",";
}

function csvParse() {
  let text  = document.getElementById("csv-paste-area")?.value || "";
  let delim = _csvGetDelimiter();
  let lines = text.split(/\r?\n/).filter(l => l.trim());

  if (!lines.length) {
    document.getElementById("csv-preview-container").style.display = "none";
    document.getElementById("csv-import-btn").style.display = "none";
    _csvParsed = [];
    return;
  }

  let rows = lines.map(l => _csvSplitLine(l, delim));
  let maxCols = Math.max(...rows.map(r => r.length));

  let firstRow = rows[0];
  // Only treat first row as header if: it has non-numeric text AND there are more rows below it
  let hasHeader = rows.length > 1 && maxCols >= 2 && firstRow.every(c => isNaN(Number(c)) && c.trim() !== "");
  let headers, dataRows;
  if (hasHeader) {
    headers  = firstRow.map((h, i) => h || "Col " + (i+1));
    dataRows = rows.slice(1);
    if (maxCols > 2) _csvShowColumnMap(headers);
    else document.getElementById("csv-column-map").style.display = "none";
  } else {
    headers  = Array.from({length: maxCols}, (_, i) => "Col " + (i+1));
    dataRows = rows;
    document.getElementById("csv-column-map").style.display = "none";
  }

  let frontIdx = 0, backIdx = 1;
  let mapFront = document.getElementById("csv-map-front");
  let mapBack  = document.getElementById("csv-map-back");
  if (mapFront && mapBack && document.getElementById("csv-column-map").style.display !== "none") {
    frontIdx = parseInt(mapFront.value) || 0;
    backIdx  = parseInt(mapBack.value)  || 1;
  }

  _csvParsed = dataRows
    .filter(r => r.length >= 1 && (r[frontIdx] || "").trim())
    .map(r => ({ front: (r[frontIdx] || "").trim(), back: (r[backIdx] || "").trim() }));

  let container = document.getElementById("csv-preview-container");
  let table     = document.getElementById("csv-preview-table");
  let countEl   = document.getElementById("csv-preview-count");
  container.style.display = "block";
  countEl.textContent     = _csvParsed.length + " card" + (_csvParsed.length !== 1 ? "s" : "") + " detected";

  let preview = _csvParsed.slice(0, 20).map(r =>
    '<tr' + (!r.front ? ' class="csv-error-row"' : "") + '><td>' + _fcEsc(r.front) + '</td><td>' + _fcEsc(r.back) + '</td></tr>'
  ).join("");
  if (_csvParsed.length > 20) preview += '<tr><td colspan="2" style="color:var(--text-dim);font-style:italic;">… and ' + (_csvParsed.length - 20) + ' more</td></tr>';
  table.innerHTML = '<thead><tr><th>Front</th><th>Back</th></tr></thead><tbody>' + preview + '</tbody>';

  document.getElementById("csv-import-btn").style.display = _csvParsed.length ? "block" : "none";
}

function _csvSplitLine(line, delim) {
  if (delim !== ",") return line.split(delim).map(f => f.trim().replace(/^["']|["']$/g, ""));
  // RFC4180 CSV parser
  let result = [], field = "", inQuote = false;
  for (let i = 0; i < line.length; i++) {
    let ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i+1] === '"') { field += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === "," && !inQuote) {
      result.push(field.trim()); field = "";
    } else {
      field += ch;
    }
  }
  result.push(field.trim());
  return result;
}

function _csvShowColumnMap(headers) {
  let mapDiv   = document.getElementById("csv-column-map");
  let selFront = document.getElementById("csv-map-front");
  let selBack  = document.getElementById("csv-map-back");
  if (!mapDiv || !selFront || !selBack) return;
  mapDiv.style.display = "grid";
  let opts = headers.map((h, i) => '<option value="' + i + '">' + _fcEsc(h) + '</option>').join("");
  selFront.innerHTML = opts;
  selBack.innerHTML  = opts;
  if (selFront.options.length > 0) selFront.selectedIndex = 0;
  if (selBack.options.length  > 1) selBack.selectedIndex  = 1;
  selFront.onchange = csvParse;
  selBack.onchange  = csvParse;
}

async function csvImport() {
  if (!_csvParsed.length) return;
  let subject  = document.getElementById("csv-subject")?.value  || "";
  let unit     = document.getElementById("csv-unit")?.value     || "";
  let chapter  = document.getElementById("csv-chapter")?.value  || "";
  let cardType = document.getElementById("csv-cardtype")?.value || "basic";
  let status   = document.getElementById("csv-import-status");
  let btn      = document.getElementById("csv-import-btn");

  if (!subject) { status.textContent = "Please select a subject."; status.style.color = "var(--red)"; return; }

  btn.disabled = true; btn.textContent = "Importing…";
  status.style.color = "var(--blue)";
  status.textContent = "Importing " + _csvParsed.length + " cards…";

  let cards = _csvParsed.map(r => ({
    subject, unit: unit||"", chapter: chapter||"",
    card_type:  cardType,
    front_text: r.front,
    back_text:  r.back || null,
    tags: [],
  }));

  let { error } = await saveBatchCards(cards);
  btn.disabled = false; btn.textContent = "📥 Import Cards";

  if (error) {
    status.style.color = "var(--red)";
    status.textContent = "Import failed: " + (error.message || error);
    return;
  }

  status.style.color = "var(--green)";
  status.textContent = "✓ " + cards.length + " cards imported successfully!";
  _csvParsed = [];
  document.getElementById("csv-preview-container").style.display = "none";
  btn.style.display = "none";
  setTimeout(() => { closeCsvImportModal(); _loadBrowseCards(); }, 1500);
}


// ══════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════

function _fcEsc(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

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
