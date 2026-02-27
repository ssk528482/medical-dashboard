// review.js — Medical Study OS  
// Standalone review session page logic
// Depends on: utils.js, data.js, supabase.js, cardSync.js

'use strict';

// ── State ─────────────────────────────────────────────────────────
let _queue       = [];
let _index       = 0;
let _flipped     = false;
let _active      = false;
let _ratingInProgress = false;
let _startedAt   = null;
let _timerInt    = null;
let _ratings     = { 1:0, 2:0, 3:0, 4:0 };
let _streak      = 0;
let _editCardId  = null;
let _isFiltered  = false;  // true when launched from browse with specific card ids
let _undoStack   = [];     // [{index, card, prevSRS, rating, preRatingStreak, wasRequeued}]
let _redoStack   = [];     // same shape

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
  try {
  let params = new URLSearchParams(window.location.search);

  // ── Mode 1: launched from editor with subject/unit/chapter deep-link ──
  let paramSubject = params.get('subject');
  let paramUnit    = params.get('unit');
  let paramChapter = params.get('chapter');

  if (paramSubject || paramChapter) {
    _isFiltered = true;
    let { data } = await fetchCards({ suspended: false });
    let cards = (data || []).filter(c => {
      if (paramSubject && c.subject !== paramSubject) return false;
      if (paramUnit    && c.unit    !== paramUnit)    return false;
      if (paramChapter && c.chapter !== paramChapter) return false;
      return true;
    });
    if (!cards.length) { _showScreen('empty'); return; }
    let label = paramChapter
      ? paramChapter + ' (' + cards.length + ' card' + (cards.length !== 1 ? 's' : '') + ')'
      : paramSubject + ' — ' + cards.length + ' card' + (cards.length !== 1 ? 's' : '');
    _setupStart(cards, label, 'Review All');
    return;
  }

  // ── Mode 2: launched from browse page with specific card ids ──
  _isFiltered = params.get('mode') === 'filtered';

  if (_isFiltered) {
    // Load specific cards passed via sessionStorage
    let ids = [];
    try { ids = JSON.parse(sessionStorage.getItem('reviewCardIds') || '[]'); } catch (_) {}
    sessionStorage.removeItem('reviewCardIds');

    if (!ids.length) {
      // No ids → fall back to due cards
      _isFiltered = false;
    } else {
      let { data } = await fetchCards({ suspended: false });
      let cards = (data || []).filter(c => ids.includes(c.id));
      if (!cards.length) {
        _showScreen('empty'); return;
      }
      _setupStart(cards, ids.length + ' card' + (ids.length !== 1 ? 's' : '') + ' selected', 'Start');
      return;
    }
  }

  // Normal mode: load due cards
  let { data: due } = await fetchDueCards(today());
  let count = due?.length || 0;

  if (!count) { _showScreen('empty'); return; }

  let estMins = Math.round(count * 1.5);
  let estStr  = estMins >= 60
    ? Math.floor(estMins/60) + 'h ' + (estMins%60) + 'm'
    : '~' + estMins + ' min' + (estMins !== 1 ? 's' : '');

  _setupStart(due, count + ' card' + (count !== 1 ? 's' : '') + ' due', estStr);

  // Nav badge
  let badge = document.getElementById('nav-review-badge');
  if (badge && count > 0) { badge.textContent = count > 99 ? '99+' : count; badge.style.display = 'inline-block'; }
  } catch (err) {
    console.error('Review boot error:', err);
    _showScreen('empty');
  }
});

function _setupStart(cards, countText, subText) {
  document.getElementById('start-count').textContent = countText;
  document.getElementById('start-sub').textContent   = subText;
  document.getElementById('btn-start').onclick = () => _startSession(cards);
  _showScreen('start');
}

// ── Session ───────────────────────────────────────────────────────
function _startSession(cards) {
  _queue     = _sortQueue(cards);
  _index     = 0;
  _flipped   = false;
  _ratings   = { 1:0, 2:0, 3:0, 4:0 };
  _streak    = 0;
  _startedAt = Date.now();
  _active    = true;
  _undoStack = [];
  _redoStack = [];
  _updateUndoRedoBtns();

  _showScreen('session');
  clearInterval(_timerInt);
  _timerInt = setInterval(_tick, 1000);
  _renderCard();
}

function _sortQueue(cards) {
  return [...cards].sort((a, b) => {
    let an = !a.interval_days || a.interval_days === 0;
    let bn = !b.interval_days || b.interval_days === 0;
    if (an && !bn) return 1;
    if (!an && bn) return -1;
    return (a.next_review_date || '') < (b.next_review_date || '') ? -1 : 1;
  });
}

function _renderCard() {
  if (_index >= _queue.length) { _endSession(); return; }

  let card = _queue[_index];
  _flipped = false;

  let cardEl = document.getElementById('review-card');
  if (cardEl) cardEl.classList.remove('flipped');
  _hideRatings();

  // Front text
  let ftEl = document.getElementById('card-front-text');
  let fiEl = document.getElementById('card-front-img');
  let btEl = document.getElementById('card-back-text');
  let biEl = document.getElementById('card-back-img');

  if (card.card_type === 'image_occlusion') {
    // Parse occlusion JSON stored in front_text
    let occData = null;
    try { occData = typeof card.front_text === 'string' ? JSON.parse(card.front_text) : card.front_text; } catch(e) {}

    if (ftEl) {
      ftEl.innerHTML = '';
      if (occData) {
        let fc = document.createElement('canvas');
        fc.style.cssText = 'width:100%;max-width:700px;height:auto;border-radius:8px;display:block;margin:0 auto;';
        ftEl.appendChild(fc);
        renderOcclusionFront(fc, occData);
      }
    }
    if (fiEl) fiEl.style.display = 'none';

    if (btEl) {
      btEl.innerHTML = '';
      if (occData) {
        let bc = document.createElement('canvas');
        bc.style.cssText = 'width:100%;max-width:700px;height:auto;border-radius:8px;display:block;margin:0 auto;';
        btEl.appendChild(bc);
        renderOcclusionBack(bc, occData);
      }
    }
    if (biEl) biEl.style.display = 'none';
  } else {
    if (ftEl) ftEl.innerHTML = card.front_text ? _renderText(card.front_text) : '';
    if (fiEl) { if (card.front_image_url) { fiEl.src = card.front_image_url; fiEl.style.display = 'block'; } else { fiEl.src=''; fiEl.style.display='none'; } }

    // Back text
    let backHtml = '';
    if (card.card_type === 'cloze') {
      backHtml = _renderClozeBack(card.front_text);
      if (card.back_text) {
        backHtml += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.08);">' +
          '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#64748b;margin-bottom:6px;">Details</div>' +
          '<div style="color:#cbd5e1;font-size:14px;">' + _renderText(card.back_text) + '</div>' +
          '</div>';
      }
    } else {
      backHtml = card.back_text ? _renderText(card.back_text) : '';
    }
    if (btEl) btEl.innerHTML = backHtml;
    if (biEl) { if (card.back_image_url) { biEl.src = card.back_image_url; biEl.style.display = 'block'; } else { biEl.src=''; biEl.style.display='none'; } }
  }

  // Counters
  let counter = document.getElementById('card-counter');
  if (counter) counter.textContent = 'Card ' + (_index+1) + ' of ' + _queue.length;

  let pct  = (_index / _queue.length) * 100;
  let fill = document.getElementById('progress-fill');
  let lbl  = document.getElementById('progress-label');
  if (fill) fill.style.width = pct + '%';
  if (lbl)  lbl.textContent  = _index + ' / ' + _queue.length;

  // Flip button label
  let flipBtn = document.getElementById('btn-flip');
  if (flipBtn) flipBtn.textContent = 'Show Answer';
}

function _renderText(text) {
  if (!text) return '';
  let esc = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc.replace(/\{\{(.+?)\}\}/g,
    '<span style="background:var(--blue);color:var(--blue);border-radius:3px;padding:0 4px;min-width:40px;display:inline-block;user-select:none;">$1</span>');
}

function _renderClozeBack(frontText) {
  if (!frontText) return '';
  let esc = frontText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  return esc.replace(/\{\{(.+?)\}\}/g,
    '<span style="background:rgba(16,185,129,0.25);color:#6ee7b7;border-radius:3px;padding:0 4px;font-weight:700;">$1</span>');
}

function flipCard() {
  if (!_active) return;
  let cardEl = document.getElementById('review-card');
  _flipped = !_flipped;
  if (_flipped) {
    cardEl?.classList.add('flipped');
    _showRatings();
    document.getElementById('btn-flip').textContent = 'Tap to flip back';
  } else {
    cardEl?.classList.remove('flipped');
    _hideRatings();
    document.getElementById('btn-flip').textContent = 'Show Answer';
  }
}

function _showRatings() {
  document.getElementById('rating-btns')?.classList.add('visible');
  document.getElementById('card-actions')?.classList.add('visible');
}
function _hideRatings() {
  document.getElementById('rating-btns')?.classList.remove('visible');
  document.getElementById('card-actions')?.classList.remove('visible');
}

async function rateCard(rating) {
  if (!_active || !_flipped || _ratingInProgress) return;
  _ratingInProgress = true;
  let card = _queue[_index];

  // Snapshot for undo
  _undoStack.push({
    index:           _index,
    card:            card,
    prevSRS: {
      ease_factor:      card.ease_factor,
      interval_days:    card.interval_days,
      next_review_date: card.next_review_date,
    },
    rating:          rating,
    preRatingStreak: _streak,
    wasRequeued:     rating === 1,
  });
  _redoStack = [];
  _updateUndoRedoBtns();

  _ratings[rating] = (_ratings[rating] || 0) + 1;

  if (rating >= 3) _streak++; else _streak = 0;
  _updateStreak();
  _hideRatings();

  // Save to DB asynchronously (don't block UI)
  saveReview(card.id, rating, card);

  // Re-queue if Again
  if (rating === 1) _queue.push(Object.assign({}, card, { _requeued: true }));

  _index++;
  _ratingInProgress = false;
  _renderCard();
}

async function undoRating() {
  if (!_undoStack.length || !_active) return;
  let e = _undoStack.pop();
  _redoStack.push(e);
  _updateUndoRedoBtns();

  // Remove re-queued duplicate if this rating caused one
  if (e.wasRequeued) {
    for (let i = _queue.length - 1; i > e.index; i--) {
      if (_queue[i]._requeued && _queue[i].id === e.card.id) {
        _queue.splice(i, 1); break;
      }
    }
  }

  // Restore rating counter
  _ratings[e.rating] = Math.max(0, (_ratings[e.rating] || 0) - 1);

  // Restore streak & index
  _streak = e.preRatingStreak;
  _index  = e.index;
  _flipped = false;
  _updateStreak();

  // Restore SRS on card object in queue so UI reflects old state
  let qc = _queue[e.index];
  if (qc) Object.assign(qc, e.prevSRS);

  // Reverse DB asynchronously
  restoreCardSRS(e.card.id, e.prevSRS);

  _renderCard();
}

async function redoRating() {
  if (!_redoStack.length || !_active) return;
  let e = _redoStack.pop();
  _undoStack.push(e);
  _updateUndoRedoBtns();

  let card = _queue[e.index];
  _ratings[e.rating] = (_ratings[e.rating] || 0) + 1;
  _streak = e.rating >= 3 ? e.preRatingStreak + 1 : 0;
  _updateStreak();

  // Re-apply DB change
  saveReview(card.id, e.rating, card);
  if (e.wasRequeued) _queue.push(Object.assign({}, card, { _requeued: true }));

  _index = e.index + 1;
  _flipped = false;
  _renderCard();
}

function _updateUndoRedoBtns() {
  let u = document.getElementById('btn-undo');
  let r = document.getElementById('btn-redo');
  if (u) u.disabled = _undoStack.length === 0;
  if (r) r.disabled = _redoStack.length === 0;
}

function _updateStreak() {
  let b = document.getElementById('streak-badge');
  if (!b) return;
  if (_streak >= 3) { b.textContent = '🔥 ' + _streak; b.classList.add('visible'); }
  else              { b.classList.remove('visible'); }
}

function _tick() {
  let elapsed = Math.floor((Date.now() - _startedAt) / 1000);
  let h = Math.floor(elapsed / 3600);
  let m = Math.floor((elapsed % 3600) / 60);
  let s = elapsed % 60;
  let str = h > 0
    ? h + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0')
    : String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  let el = document.getElementById('review-timer');
  if (el) el.textContent = str;
}

function _endSession() {
  _active = false;
  clearInterval(_timerInt);

  let elapsed   = Math.floor((Date.now() - _startedAt) / 1000);
  let unique    = _queue.filter(c => !c._requeued).length;
  let goodEasy  = (_ratings[3]||0) + (_ratings[4]||0);
  let retention = unique > 0 ? Math.round((goodEasy / unique) * 100) : 0;
  let mins = Math.floor(elapsed / 60), secs = elapsed % 60;
  let timeStr = mins > 0 ? mins + 'min ' + secs + 's' : secs + 's';

  document.getElementById('sum-again').textContent = _ratings[1] || 0;
  document.getElementById('sum-hard').textContent  = _ratings[2] || 0;
  document.getElementById('sum-good').textContent  = _ratings[3] || 0;
  document.getElementById('sum-easy').textContent  = _ratings[4] || 0;
  document.getElementById('sum-retention').textContent = 'Retention: ' + retention + '%';
  document.getElementById('sum-time').textContent  = 'Time: ' + timeStr;

  getDueCardCount(addDays(today(), 1)).then(n => {
    let el = document.getElementById('sum-tomorrow');
    if (el) el.textContent = 'Tomorrow: ' + n + ' card' + (n !== 1 ? 's' : '') + ' due';
  });

  _showScreen('complete');
}

function _showScreen(name) {
  ['start','empty','session','complete'].forEach(s => {
    let el = document.getElementById('screen-' + s);
    if (el) el.style.display = s === name ? (s === 'session' ? 'block' : 'flex') : 'none';
  });
}

// ── Keyboard shortcuts ────────────────────────────────────────────
document.addEventListener('keydown', function (e) {
  if (!_active) return;
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
  // Undo: Ctrl+Z or U
  if ((e.ctrlKey && e.code === 'KeyZ') || (!e.ctrlKey && !e.metaKey && e.code === 'KeyU')) {
    e.preventDefault(); undoRating(); return;
  }
  // Redo: Ctrl+Y or Ctrl+Shift+Z or R
  if ((e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) ||
      (!e.ctrlKey && !e.metaKey && e.code === 'KeyR')) {
    e.preventDefault(); redoRating(); return;
  }
  if (e.code === 'Space' || e.code === 'ArrowDown') { e.preventDefault(); flipCard(); }
  else if (_flipped) {
    if (e.code === 'Digit1' || e.code === 'KeyA') rateCard(1);
    else if (e.code === 'Digit2' || e.code === 'KeyS') rateCard(2);
    else if (e.code === 'Digit3' || e.code === 'KeyD') rateCard(3);
    else if (e.code === 'Digit4' || e.code === 'KeyF') rateCard(4);
  }
});

// ── Inline Edit Modal ─────────────────────────────────────────────
function openEditModal() {
  if (!_active) return;
  let card = _queue[_index];
  if (!card) return;
  if (card.card_type === 'image_occlusion') {
    showToast('Image occlusion cards must be edited from the Browse page.', 'warn');
    return;
  }
  _editCardId = card.id;
  document.getElementById('edit-front').value = card.front_text || '';
  document.getElementById('edit-back').value  = card.back_text  || '';
  document.getElementById('edit-modal').classList.add('open');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('open');
  _editCardId = null;
}

async function saveEdit() {
  if (!_editCardId) return;
  let card  = _queue[_index];
  let front = (document.getElementById('edit-front')?.value || '').trim();
  let back  = (document.getElementById('edit-back')?.value  || '').trim();
  if (!front) { showToast('Front text is required.', 'warn'); return; }

  let btn = document.querySelector('.edit-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  await saveCard({
    id: _editCardId,
    front_text: front, back_text: back || null,
    card_type: card?.card_type || 'basic',
    subject: card?.subject, unit: card?.unit, chapter: card?.chapter,
    tags: card?.tags || []
  });

  if (btn) { btn.disabled = false; btn.textContent = '💾 Save Changes'; }

  // Update in-queue card so current render reflects changes
  if (card) { card.front_text = front; card.back_text = back || null; }
  closeEditModal();
  _renderCard(); // re-render with updated text
}

// ── Delete current card ───────────────────────────────────────────
function deleteCurrentCard() {
  if (!_active) return;
  let card = _queue[_index];
  if (!card) return;
  openConfirm(
    'Delete this card?',
    'This cannot be undone.',
    async () => {
      await deleteCard(card.id);
      // Remove from queue and advance
      _queue.splice(_index, 1);
      if (_index >= _queue.length && _queue.length > 0) _index = _queue.length - 1;
      if (!_queue.length) { _endSession(); return; }
      _renderCard();
    },
    'Delete'
  );
}

// ── Confirm Modal (shim → global popup system) ──────────────────────────
function openConfirm(title, body, fn, okLabel) {
  showConfirm(title, body, fn, okLabel || 'Delete', true);
}
function closeConfirm() { _gsCloseConfirm(); }
async function runConfirm() { await _gsRunConfirm(); }
