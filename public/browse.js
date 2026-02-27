// browse.js — Medical Study OS
// Browse, search, select, bulk-delete, CSV import, inline edit for Cards page
// Depends on: data.js, supabase.js, cardSync.js, utils.js

'use strict';

// ── State ─────────────────────────────────────────────────────────
let _all          = [];        // all fetched cards
let _subTab       = 'new';     // new | revise | all
let _selectMode   = false;
let _selected     = new Set(); // selected card ids
let _editCardId   = null;
let _csvParsed    = [];

// ── ID registry: maps short keys to arrays of card IDs ────────────
// Avoids embedding JSON arrays in onclick attributes (causes SyntaxErrors
// when IDs contain special characters or the array is large).
let _idRegistry = {};
function _regIds(ids) {
  let key = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  _idRegistry[key] = ids;
  return key;
}
function _getIds(key) { return _idRegistry[key] || []; }

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async function () {
  await _load();
  _initNavBadge();

  // Deep-link: ?subject=...&unit=...&chapter=... (from editor badge)
  let _p = new URLSearchParams(window.location.search);
  let _pSubject = _p.get('subject');
  let _pUnit    = _p.get('unit');
  let _pChapter = _p.get('chapter');
  if (_pSubject) {
    // Switch to All tab so the chapter is visible regardless of card state
    switchTab('all');
    // Wait one tick for accordion DOM to be ready, then open + scroll
    setTimeout(() => _deepLinkOpen(_pSubject, _pUnit, _pChapter), 80);
  }

  // Close menus on outside click
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.fc-section-menu')) {
      document.querySelectorAll('.fc-menu-dropdown.open')
        .forEach(d => d.classList.remove('open'));
    }
  });
});

// Open and scroll to a specific subject → unit → chapter in the accordion
function _deepLinkOpen(subject, unit, chapter) {
  // Open subject
  let subjectEl = document.getElementById('fc-subj-' + _slug(subject));
  if (subjectEl && !subjectEl.classList.contains('open')) subjectEl.classList.add('open');

  // Open unit
  if (unit) {
    let unitEl = document.getElementById('fc-unit-' + _slug(subject + '-' + unit));
    if (unitEl) {
      if (!unitEl.classList.contains('open')) unitEl.classList.add('open');
      let btn = unitEl.querySelector('.fc-acc-unit-head .fc-acc-collapse-btn');
      if (btn) btn.textContent = '▾';
    }
  }

  // Open chapter and scroll to it
  if (chapter) {
    let qaId = 'ch-qa-' + _slug(subject + '-' + (unit || '') + '-' + chapter);
    let chapEl = document.getElementById(qaId);
    if (chapEl) {
      if (!chapEl.classList.contains('open')) chapEl.classList.add('open');
      // Highlight briefly so the user can see where they landed
      chapEl.style.outline = '2px solid var(--blue)';
      chapEl.style.borderRadius = '8px';
      setTimeout(() => { chapEl.style.outline = ''; }, 2000);
      chapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else if (subjectEl) {
    subjectEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

async function _load() {
  let { data } = await fetchCards({ suspended: false });
  _all = data || [];
  _idRegistry = {};
  _renderCurrent();
}

async function _loadPreserving() {
  let openSubjects = new Set();
  let openUnits    = new Set();
  document.querySelectorAll('.fc-acc-subject.open').forEach(el => openSubjects.add(el.id));
  document.querySelectorAll('.fc-acc-unit.open').forEach(el => openUnits.add(el.id));

  let { data } = await fetchCards({ suspended: false });
  _all = data || [];
  _idRegistry = {};
  _renderCurrent();

  openSubjects.forEach(id => { let el = document.getElementById(id); if (el) el.classList.add('open'); });
  openUnits.forEach(id => {
    let el = document.getElementById(id);
    if (el) {
      el.classList.add('open');
      let btn = el.querySelector('.fc-acc-unit-head .fc-acc-collapse-btn');
      if (btn) btn.textContent = '▾';
    }
  });
}

// Dispatch to the correct render function for the active tab
function _renderCurrent() {
  if (_subTab === 'leeches') _renderLeeches(); else _render();
}

// ── Nav badge ─────────────────────────────────────────────────────
async function _initNavBadge() {
  let badge = document.getElementById('nav-review-badge');
  if (!badge) return;
  try {
    let { data } = await fetchDueCards(today());
    let n = data?.length || 0;
    if (n > 0) { badge.textContent = n > 99 ? '99+' : n; badge.style.display = 'inline-block'; }
  } catch (_) {}
}

// ── Sub-tabs ──────────────────────────────────────────────────────
function switchTab(tab) {
  _subTab = tab;
  ['new','revise','all','leeches'].forEach(t => {
    document.getElementById('tab-' + t)?.classList.toggle('active', t === tab);
  });
  if (tab === 'leeches') { _renderLeeches(); } else { _render(); }
}

// ── Search ────────────────────────────────────────────────────────
function onSearch() {
  if (_subTab === 'leeches') _renderLeeches(); else _render();
}

// ── Leeches tab ────────────────────────────────────────────────────
async function _renderLeeches() {
  let acc = document.getElementById('accordion');
  acc.innerHTML = '<div class="browse-empty"><div class="browse-empty-icon">⏳</div>Finding leech cards…</div>';
  try {
    let { data: cards, error } = await fetchLeechCards();
    if (error) throw error;
    if (!cards || !cards.length) {
      acc.innerHTML = '<div class="browse-empty"><div class="browse-empty-icon">🐛</div>No leech cards! Great retention.</div>';
      return;
    }
    // Render flat list with leech badge
    acc.innerHTML = '<div style="padding:8px 0 4px;font-size:12px;color:#ef4444;font-weight:600;">🐛 ' + cards.length + ' leech card' + (cards.length !== 1 ? 's' : '') + ' — rated Again 3+ times</div>' +
      cards.map(c => {
        let snip  = (c.front_text || '').slice(0, 80);
        let trunc = (c.front_text || '').length > 80 ? '…' : '';
        return '<div class="fc-card-row" style="border:1px solid rgba(239,68,68,0.3);border-radius:8px;margin-bottom:6px;background:rgba(239,68,68,0.05);">' +
          '<span style="font-size:10px;background:rgba(239,68,68,0.15);color:#ef4444;border-radius:4px;padding:2px 6px;flex-shrink:0;font-weight:700;">LEECH</span>' +
          '<span class="fc-card-front">' + _esc(snip) + trunc + '</span>' +
          '<span class="fc-card-stats" style="color:#64748b;">' + (c.subject || '') + ' · ' + (c.chapter || '') + '</span>' +
          '<div class="fc-card-actions">' +
            '<button class="fc-card-btn edit" onclick="event.stopPropagation();openEditModal(\'' + c.id + '\')" title="Edit">✏️</button>' +
            '<button class="fc-card-btn del"  onclick="event.stopPropagation();deleteOneCard(\'' + c.id + '\')" title="Delete">🗑️</button>' +
          '</div>' +
        '</div>';
      }).join('');
  } catch (err) {
    acc.innerHTML = '<div class="browse-empty">Error loading leech cards: ' + _esc(String(err)) + '</div>';
  }
}

// ── Render accordion ─────────────────────────────────────────────
function _render() {
  let acc     = document.getElementById('accordion');
  let searchQ = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  let today_  = today();
  let isRevise = _subTab === 'revise';
  let btnLabel = isRevise ? 'Revise' : 'Learn';
  let btnClass = isRevise ? 'revise' : '';

  // Filter by sub-tab
  let cards = _all.filter(c => {
    if (_subTab === 'new')    return !c.interval_days || c.interval_days === 0;
    if (_subTab === 'revise') return c.interval_days > 0 && c.next_review_date <= today_;
    return true;
  });

  // Filter by search
  if (searchQ) {
    cards = cards.filter(c => {
      let hay = [c.front_text, c.back_text, c.subject, c.unit, c.chapter].join(' ').toLowerCase();
      return hay.includes(searchQ);
    });
  }

  if (!cards.length) {
    acc.innerHTML = '<div class="browse-empty"><div class="browse-empty-icon">🃏</div>' +
      (searchQ ? 'No cards matching "' + _esc(searchQ) + '"' :
        _subTab === 'new' ? 'No new cards yet' :
        _subTab === 'revise' ? 'No cards due for revision' :
        'No cards yet. <a href="create.html" style="color:var(--blue)">Create your first card →</a>') + '</div>';
    return;
  }

  // Group: subject → unit → chapter
  let grouped = {};
  cards.forEach(c => {
    let s  = c.subject  || 'Uncategorised';
    let u  = c.unit     || 'General';
    let ch = c.chapter  || 'General';
    if (!grouped[s])         grouped[s]       = {};
    if (!grouped[s][u])      grouped[s][u]    = {};
    if (!grouped[s][u][ch])  grouped[s][u][ch]= [];
    grouped[s][u][ch].push(c);
  });

  acc.innerHTML = Object.entries(grouped).map(([subj, units]) => {
    let subjCardIds = cards.filter(c => (c.subject||'Uncategorised') === subj).map(c => c.id);
    let subjCount   = subjCardIds.length;
    let subjIdAttr  = 'fc-subj-' + _slug(subj);
    let sMenuId     = 'smenu-' + _slug(subj);
    let sLearnKey   = _regIds(subjCardIds);
    let sSelKey     = _regIds(subjCardIds);
    let sDelKey     = _regIds(subjCardIds);

    let unitsHtml = Object.entries(units).map(([unit, chapters]) => {
      let unitCardIds = Object.values(chapters).flat().map(c => c.id);
      let unitCount   = unitCardIds.length;
      let unitIdAttr  = 'fc-unit-' + _slug(subj + '-' + unit);
      let uMenuId     = 'umenu-' + _slug(subj + '-' + unit);
      let uLearnKey   = _regIds(unitCardIds);
      let uSelKey     = _regIds(unitCardIds);
      let uDelKey     = _regIds(unitCardIds);

      let chapHtml = Object.entries(chapters).map(([chap, cCards]) => {
        let chapCardIds = cCards.map(c => c.id);
        let qaId        = 'qa-' + _slug(subj + '-' + unit + '-' + chap);
        let cMenuId     = 'cmenu-' + _slug(subj + '-' + unit + '-' + chap);        let cLearnKey   = _regIds(chapCardIds);
        let cSelKey     = _regIds(chapCardIds);
        let cDelKey     = _regIds(chapCardIds);
        let allDone     = cCards.every(c => c.interval_days > 0);

        let cardRows = cCards.map(c => {
          let snip  = (c.front_text || '').slice(0, 60);
          let trunc = (c.front_text || '').length > 60 ? '…' : '';
          let nextD = c.next_review_date ? c.next_review_date.slice(5) : 'new';
          let cbHtml = _selectMode
            ? '<input type="checkbox" class="fc-card-checkbox" data-id="' + c.id + '" ' +
              (_selected.has(c.id) ? 'checked' : '') +
              ' onchange="toggleCard(\'' + c.id + '\',this.checked)">'
            : '';
          return '<div class="fc-card-row">' +
            cbHtml +
            '<span class="fc-card-front">' + _esc(snip) + trunc + '</span>' +
            '<span class="fc-card-stats">Int:' + (c.interval_days||0) + 'd · Rep:' + (c.reps||0) + ' · ' + nextD + '</span>' +
            '<div class="fc-card-actions">' +
              '<button class="fc-card-btn edit" onclick="event.stopPropagation();openEditModal(\'' + c.id + '\')" title="Edit">✏️</button>' +
              '<button class="fc-card-btn del"  onclick="event.stopPropagation();deleteOneCard(\'' + c.id + '\')" title="Delete">🗑️</button>' +
            '</div></div>';
        }).join('');

        return '<div class="fc-acc-chapter" id="ch-' + qaId + '">' +
          '<div class="fc-acc-chapter-head" onclick="event.stopPropagation();toggleChapter(this.closest(\'.fc-acc-chapter\'))">' +
            '<button class="fc-acc-collapse-btn" onclick="event.stopPropagation();toggleChapter(this.closest(\'.fc-acc-chapter\'))">▸</button>' +
            (allDone ? '<span title="All reviewed" style="font-size:10px;flex-shrink:0;">✅</span>' : '') +
            '<span class="fc-acc-chapter-name">' + _esc(chap) + '</span>' +
            '<span class="fc-acc-chapter-count">' + cCards.length + '</span>' +
            '<button class="fc-learn-btn ' + btnClass + '" onclick="event.stopPropagation();startLearn(\'' + cLearnKey + '\')">' + btnLabel + ' ' + cCards.length + '</button>' +
            '<button class="fc-quick-add-btn" onclick="event.stopPropagation();openQuickAddModal(\'' + _jesc(subj) + '\',\'' + _jesc(unit) + '\',\'' + _jesc(chap) + '\')">+</button>' +
            '<div class="fc-section-menu">' +
              '<button class="fc-menu-btn" onclick="event.stopPropagation();toggleMenu(\'' + cMenuId + '\',this)">⋮</button>' +
              '<div class="fc-menu-dropdown" id="' + cMenuId + '">' +
                '<button class="fc-menu-item" onclick="toggleMenu(\'' + cMenuId + '\');selectByKey(\'' + cSelKey + '\')">☑ Select all</button>' +
                '<button class="fc-menu-item danger" onclick="toggleMenu(\'' + cMenuId + '\');bulkDeleteByKey(\'' + cDelKey + '\',\'' + _jesc(chap) + '\')">🗑 Delete all (' + cCards.length + ')</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="fc-acc-chapter-cards">' +
            '<div id="rows-' + qaId + '">' + cardRows + '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      return '<div class="fc-acc-unit" id="' + unitIdAttr + '">' +
        '<div class="fc-acc-unit-head">' +
          '<button class="fc-acc-collapse-btn" onclick="event.stopPropagation();toggleUnit(this.closest(\'.fc-acc-unit\'))" title="Collapse">▸</button>' +
          '<span class="fc-acc-unit-name">' + _esc(unit) + '</span>' +
          '<span class="fc-acc-unit-count">' + unitCount + '</span>' +
          '<button class="fc-learn-btn ' + btnClass + '" onclick="event.stopPropagation();startLearn(\'' + uLearnKey + '\')">' + btnLabel + ' ' + unitCount + '</button>' +
          '<div class="fc-section-menu" onclick="event.stopPropagation()">' +
            '<button class="fc-menu-btn" onclick="toggleMenu(\'' + uMenuId + '\',this)">⋮</button>' +
            '<div class="fc-menu-dropdown" id="' + uMenuId + '">' +
              '<button class="fc-menu-item" onclick="toggleMenu(\'' + uMenuId + '\');selectByKey(\'' + uSelKey + '\')">☑ Select all in unit</button>' +
              '<button class="fc-menu-item danger" onclick="toggleMenu(\'' + uMenuId + '\');bulkDeleteByKey(\'' + uDelKey + '\',\'' + _jesc(unit) + '\')">🗑 Delete all (' + unitCount + ')</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="fc-acc-chapters">' + chapHtml + '</div>' +
      '</div>';
    }).join('');

    return '<div class="fc-acc-subject open" id="' + subjIdAttr + '">' +
      '<div class="fc-acc-subject-head" onclick="toggleSubject(this.closest(\'.fc-acc-subject\'))">' +
        '<button class="fc-acc-collapse-btn" onclick="event.stopPropagation();toggleSubject(this.closest(\'.fc-acc-subject\'))" title="Collapse">▾</button>' +
        '<span class="fc-acc-subject-name">' + _esc(subj) + '</span>' +
        '<span class="fc-acc-subject-count ' + (isRevise && subjCount ? 'has-due' : '') + '">' + subjCount + ' cards</span>' +
        '<button class="fc-learn-btn ' + btnClass + '" onclick="event.stopPropagation();startLearn(\'' + sLearnKey + '\')">' + btnLabel + ' ' + subjCount + '</button>' +
        '<div class="fc-section-menu" onclick="event.stopPropagation()">' +
          '<button class="fc-menu-btn" onclick="toggleMenu(\'' + sMenuId + '\',this)">⋮</button>' +
          '<div class="fc-menu-dropdown" id="' + sMenuId + '">' +
            '<button class="fc-menu-item" onclick="toggleMenu(\'' + sMenuId + '\');selectByKey(\'' + sSelKey + '\')">☑ Select all in subject</button>' +
            '<button class="fc-menu-item danger" onclick="toggleMenu(\'' + sMenuId + '\');bulkDeleteByKey(\'' + sDelKey + '\',\'' + _jesc(subj) + '\')">🗑 Delete all (' + subjCount + ')</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="fc-acc-units">' + unitsHtml + '</div>' +
    '</div>';
  }).join('');
}

// ── Accordion toggles ─────────────────────────────────────────────
function toggleSubject(subjectEl) {
  if (!subjectEl) return;
  let isOpen = subjectEl.classList.toggle('open');
  let btn = subjectEl.querySelector(':scope > .fc-acc-subject-head .fc-acc-collapse-btn');
  if (btn) btn.textContent = isOpen ? '▾' : '▸';
}

function toggleUnit(unitEl) {
  if (!unitEl) return;
  let isOpen = unitEl.classList.toggle('open');
  let btn = unitEl.querySelector(':scope > .fc-acc-unit-head .fc-acc-collapse-btn');
  if (btn) btn.textContent = isOpen ? '▾' : '▸';
}

function toggleChapter(chapEl) {
  if (!chapEl) return;
  let isOpen = chapEl.classList.toggle('open');
  let btn = chapEl.querySelector(':scope > .fc-acc-chapter-head .fc-acc-collapse-btn');
  if (btn) btn.textContent = isOpen ? '▾' : '▸';
}

function toggleMenu(menuId, triggerBtn) {
  let m = document.getElementById(menuId);
  if (!m) return;
  let wasOpen = m.classList.contains('open');
  document.querySelectorAll('.fc-menu-dropdown.open').forEach(d => d.classList.remove('open'));
  if (!wasOpen) {
    m.classList.add('open');
    // Position using fixed coords so it escapes overflow:hidden parents
    let btn = triggerBtn || document.querySelector('[onclick*="' + menuId + '"]');
    if (btn) {
      let r = btn.getBoundingClientRect();
      let dropW = 210;
      let left  = r.right - dropW;
      if (left < 4) left = r.left;
      let top = r.bottom + 4;
      // Flip up if too close to bottom
      if (top + 120 > window.innerHeight) top = r.top - 4 - Math.min(120, m.scrollHeight || 100);
      m.style.left = left + 'px';
      m.style.top  = top  + 'px';
      m.style.width = dropW + 'px';
    }
  }
}

// ── Learn session ─────────────────────────────────────────────────
function startLearn(registryKey) {
  let cardIds = _getIds(registryKey);
  if (!cardIds || !cardIds.length) return;
  sessionStorage.setItem('reviewCardIds', JSON.stringify(cardIds));
  window.location.href = 'review.html?mode=filtered';
}

// ── Select mode ───────────────────────────────────────────────────
function toggleSelectMode() {
  _selectMode = !_selectMode;
  if (!_selectMode) { _selected.clear(); _hideBulkBar(); }
  let btn = document.getElementById('select-btn');
  if (btn) {
    btn.textContent = _selectMode ? '✕ Done' : '☑ Select';
    btn.classList.toggle('active', _selectMode);
  }
  _render();
}

function toggleCard(id, checked) {
  if (checked) _selected.add(id); else _selected.delete(id);
  _updateBulkBar();
}

// selectByKey — uses registry key, no JSON embedded in onclick
function selectByKey(registryKey) {
  let ids = _getIds(registryKey);
  if (!ids.length) return;
  ids.forEach(id => _selected.add(id));
  if (!_selectMode) {
    _selectMode = true;
    let btn = document.getElementById('select-btn');
    if (btn) { btn.textContent = '✕ Done'; btn.classList.add('active'); }
    _render(); // re-render shows checkboxes, then update bar
  } else {
    ids.forEach(id => {
      document.querySelectorAll('.fc-card-checkbox[data-id="' + id + '"]')
        .forEach(cb => { cb.checked = true; });
    });
  }
  _updateBulkBar();
}

function _updateBulkBar() {
  let n   = _selected.size;
  let bar = document.getElementById('bulk-bar');
  let lbl = document.getElementById('bulk-count');
  if (lbl) lbl.textContent = n + ' card' + (n !== 1 ? 's' : '') + ' selected';
  if (bar) bar.classList.toggle('visible', n > 0);
}
function _hideBulkBar() { document.getElementById('bulk-bar')?.classList.remove('visible'); }

// ── Delete progress overlay ──────────────────────────────────────
function _showDeleteProgress(label) {
  let el = document.getElementById('delete-progress-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'delete-progress-overlay';
    el.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(10,22,40,0.88);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;';
    document.body.appendChild(el);
  }
  el.innerHTML =
    '<div style="font-size:36px;">🗑️</div>' +
    '<div style="font-size:15px;font-weight:700;color:#f0f6ff;">' + label + '</div>' +
    '<div style="width:180px;height:6px;background:rgba(255,255,255,0.1);border-radius:20px;overflow:hidden;">' +
    '  <div id="del-prog-bar" style="height:100%;background:#ef4444;border-radius:20px;width:0%;transition:width 0.2s;"></div>' +
    '</div>' +
    '<div id="del-prog-text" style="font-size:12px;color:#94a3b8;">Preparing…</div>';
  el.style.display = 'flex';
}
function _updateDeleteProgress(done, total) {
  let bar  = document.getElementById('del-prog-bar');
  let text = document.getElementById('del-prog-text');
  let pct  = total > 0 ? Math.round(done / total * 100) : 0;
  if (bar)  bar.style.width = pct + '%';
  if (text) text.textContent = done + ' / ' + total + ' deleted';
}
function _hideDeleteProgress() {
  let el = document.getElementById('delete-progress-overlay');
  if (el) el.remove();
}

async function bulkDelete() {
  let ids = [..._selected];
  if (!ids.length) return;
  openConfirm(
    'Delete ' + ids.length + ' card' + (ids.length !== 1 ? 's' : '') + '?',
    'This cannot be undone.',
    async () => {
      _showDeleteProgress('Deleting ' + ids.length + ' cards…');
      _updateDeleteProgress(0, ids.length);
      let { error } = await deleteCardsBatch(ids);
      _updateDeleteProgress(ids.length, ids.length);
      if (error) { _hideDeleteProgress(); console.error('Bulk delete failed:', error); return; }
      setTimeout(async () => {
        _hideDeleteProgress();
        _selected.clear(); _hideBulkBar(); _selectMode = false;
        let btn = document.getElementById('select-btn');
        if (btn) { btn.textContent = '☑ Select'; btn.classList.remove('active'); }
        await _loadPreserving();
      }, 400);
    },
    'Delete ' + ids.length
  );
}

async function deleteOneCard(id) {
  let card = _all.find(c => c.id === id);
  openConfirm(
    'Delete card?',
    '"' + _esc((card?.front_text || '').slice(0, 80)) + '"<br>This cannot be undone.',
    async () => {
      let { error } = await deleteCard(id);
      if (error) {
        showToast('Delete failed: ' + (error.message || JSON.stringify(error)), 'error');
        return;
      }
      await _loadPreserving();
    },
    'Delete'
  );
}

// bulkDeleteByKey — uses registry key, no JSON embedded in onclick
async function bulkDeleteByKey(registryKey, label) {
  let ids = _getIds(registryKey);
  if (!ids.length) return;
  openConfirm(
    'Delete all in "' + label + '"?',
    ids.length + ' cards will be permanently deleted.',
    async () => {
      _showDeleteProgress('Deleting ' + ids.length + ' cards from "' + label + '"…');
      _updateDeleteProgress(0, ids.length);
      let { error } = await deleteCardsBatch(ids);
      _updateDeleteProgress(ids.length, ids.length);
      if (error) { _hideDeleteProgress(); console.error('Bulk delete failed:', error); return; }
      setTimeout(async () => {
        _hideDeleteProgress();
        await _loadPreserving();
      }, 400);
    },
    'Delete ' + ids.length
  );
}

// ── Quick Add Modal ───────────────────────────────────────────────
let _qaSubject = '', _qaUnit = '', _qaChapter = '';

function openQuickAddModal(subject, unit, chapter) {
  _qaSubject = subject; _qaUnit = unit; _qaChapter = chapter;
  let label = document.getElementById('fc-qa-chapter-label');
  if (label) label.textContent = '📖 ' + subject + (unit ? ' → ' + unit : '') + (chapter ? ' → ' + chapter : '');
  let front = document.getElementById('fc-qa-front');
  let back  = document.getElementById('fc-qa-back');
  let type  = document.getElementById('fc-qa-type');
  if (front) front.value = '';
  if (back)  back.value  = '';
  if (type)  type.value  = 'basic';
  document.getElementById('fc-qa-modal').classList.add('open');
  setTimeout(() => { if (front) front.focus(); }, 120);
}

function closeQuickAddModal() {
  document.getElementById('fc-qa-modal').classList.remove('open');
}

async function submitQuickAddModal() {
  let front = (document.getElementById('fc-qa-front')?.value || '').trim();
  let back  = (document.getElementById('fc-qa-back')?.value  || '').trim();
  let type  = document.getElementById('fc-qa-type')?.value || 'basic';
  if (!front) {
    let f = document.getElementById('fc-qa-front');
    if (f) { f.focus(); f.style.borderColor = 'var(--red)'; setTimeout(() => { f.style.borderColor = ''; }, 1500); }
    return;
  }
  let btn = document.getElementById('fc-qa-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  await saveCard({ subject: _qaSubject, unit: _qaUnit, chapter: _qaChapter, card_type: type, front_text: front, back_text: back || null, tags: [] });
  if (btn) { btn.disabled = false; btn.textContent = '+ Add Card'; }
  closeQuickAddModal();
  await _loadPreserving();
}

// ── Inline Edit Modal ─────────────────────────────────────────────
function openEditModal(cardId) {
  let card = _all.find(c => c.id === cardId);
  if (!card) return;
  _editCardId = cardId;
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
  let card  = _all.find(c => c.id === _editCardId);
  let front = document.getElementById('edit-front').value.trim();
  let back  = document.getElementById('edit-back').value.trim();
  if (!front) { showToast('Front text is required.', 'warn'); return; }
  let btn = document.querySelector('.edit-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  let { error } = await saveCard({
    id: _editCardId, front_text: front, back_text: back || null,
    card_type: card?.card_type || 'basic',
    subject: card?.subject, unit: card?.unit,
    chapter: card?.chapter, tags: card?.tags || []
  });
  if (btn) { btn.disabled = false; btn.textContent = '💾 Save Changes'; }
  if (error) { showToast('Save failed: ' + (error.message || error), 'error'); return; }
  closeEditModal();
  await _loadPreserving();
}

// ── Confirm Modal (shim → global popup system) ──────────────────────────
function openConfirm(title, body, fn, okLabel) {
  showConfirm(title, body, fn, okLabel || 'Delete', true);
}
function closeConfirm() { _gsCloseConfirm(); }
async function runConfirm() {
  await _gsRunConfirm();
}

// ── CSV Import ────────────────────────────────────────────────────
function openCsvModal() {
  document.getElementById('csv-modal').classList.add('open');
  _csvFillSubjects();
  document.getElementById('csv-text').value = '';
  document.getElementById('csv-preview-wrap').style.display = 'none';
  document.getElementById('csv-import-btn').style.display   = 'none';
  document.getElementById('csv-status').textContent = '';
  _csvParsed = [];
}
function closeCsvModal() { document.getElementById('csv-modal').classList.remove('open'); }

function _csvFillSubjects() {
  let sel = document.getElementById('csv-subject');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Subject —</option>';
  Object.keys(studyData.subjects || {}).sort().forEach(s => {
    let o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o);
  });
}
function csvFillUnits() {
  let subj = document.getElementById('csv-subject')?.value || '';
  let uSel = document.getElementById('csv-unit');
  if (!uSel) return;
  uSel.innerHTML = '<option value="">— Unit —</option>';
  (studyData.subjects[subj]?.units || []).forEach(u => {
    let o = document.createElement('option'); o.value = u.name; o.textContent = u.name; uSel.appendChild(o);
  });
  csvFillChapters();
}
function csvFillChapters() {
  let subj = document.getElementById('csv-subject')?.value || '';
  let unit = document.getElementById('csv-unit')?.value    || '';
  let cSel = document.getElementById('csv-chapter');
  if (!cSel) return;
  cSel.innerHTML = '<option value="">— Chapter —</option>';
  let unitObj = studyData.subjects[subj]?.units?.find(u => u.name === unit);
  (unitObj?.chapters || []).forEach(ch => {
    let o = document.createElement('option'); o.value = ch.name; o.textContent = ch.name; cSel.appendChild(o);
  });
}

function csvLoadFile(inputEl) {
  let file = inputEl.files[0]; if (!file) return;
  let r = new FileReader();
  r.onload = e => { document.getElementById('csv-text').value = e.target.result; csvParse(); };
  r.readAsText(file); inputEl.value = '';
}

function _csvDelim() {
  let v = document.getElementById('csv-delim')?.value || 'comma';
  return { comma: ',', tab: '\t', pipe: '|', semicolon: ';' }[v] || ',';
}

function csvParse() {
  let text  = document.getElementById('csv-text')?.value || '';
  let delim = _csvDelim();
  let lines = text.split(/\r?\n/).filter(l => l.trim());
  let prevWrap  = document.getElementById('csv-preview-wrap');
  let importBtn = document.getElementById('csv-import-btn');

  if (!lines.length) {
    if (prevWrap)  prevWrap.style.display  = 'none';
    if (importBtn) importBtn.style.display = 'none';
    _csvParsed = []; return;
  }

  let rows = lines.map(l => _csvSplit(l, delim));
  let firstRow  = rows[0];
  // Only treat first row as header if it contains recognizable header keywords
  // (front, back, question, answer, term, definition, q, a - case insensitive)
  let headerKeywords = /^(front|back|question|answer|term|definition|q|a|word|meaning|hint|note|side\s*1|side\s*2)$/i;
  let hasHeader = rows.length > 1 && firstRow.every(c => headerKeywords.test(c.trim()));
  let dataRows  = hasHeader ? rows.slice(1) : rows;

  _csvParsed = dataRows
    .filter(r => (r[0] || '').trim())
    .map(r => ({ front: (r[0] || '').trim(), back: (r[1] || '').trim() }));

  let countEl = document.getElementById('csv-count');
  let table   = document.getElementById('csv-table');
  if (countEl) countEl.textContent = _csvParsed.length + ' card' + (_csvParsed.length !== 1 ? 's' : '') + ' detected';
  if (prevWrap) prevWrap.style.display = 'block';

  let preview = _csvParsed.slice(0, 20).map(r =>
    '<tr><td>' + _esc(r.front) + '</td><td>' + _esc(r.back) + '</td></tr>'
  ).join('');
  if (table) table.innerHTML = '<thead><tr><th>Front</th><th>Back</th></tr></thead><tbody>' + preview + '</tbody>';
  if (importBtn) importBtn.style.display = _csvParsed.length ? 'inline-block' : 'none';
}

function _csvSplit(line, delim) {
  if (delim !== ',') return line.split(delim).map(f => f.trim().replace(/^["']|["']$/g, ''));
  let result = [], field = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    let ch = line[i];
    if (ch === '"') { if (inQ && line[i+1] === '"') { field += '"'; i++; } else inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(field.trim()); field = ''; }
    else field += ch;
  }
  result.push(field.trim()); return result;
}

async function csvImport() {
  if (!_csvParsed.length) return;
  let subject   = document.getElementById('csv-subject')?.value  || '';
  let unit      = document.getElementById('csv-unit')?.value     || '';
  let chapter   = document.getElementById('csv-chapter')?.value  || '';
  let cardType  = document.getElementById('csv-type')?.value     || 'basic';
  let statusEl  = document.getElementById('csv-status');
  let importBtn = document.getElementById('csv-import-btn');

  if (!subject) { statusEl.textContent = 'Please select a subject.'; statusEl.style.color = 'var(--red)'; return; }

  importBtn.disabled = true; importBtn.textContent = 'Importing…';
  statusEl.style.color = 'var(--blue)'; statusEl.textContent = 'Importing ' + _csvParsed.length + ' cards…';

  let cards = _csvParsed.map(r => ({
    subject, unit: unit || '', chapter: chapter || '',
    card_type: cardType, front_text: r.front, back_text: r.back || null, tags: []
  }));

  let { error } = await saveBatchCards(cards);
  importBtn.disabled = false; importBtn.textContent = '📥 Import Cards';

  if (error) {
    statusEl.style.color = 'var(--red)';
    statusEl.textContent = 'Import failed: ' + (error.message || error);
    return;
  }
  statusEl.style.color = 'var(--green)';
  statusEl.textContent = '✓ ' + cards.length + ' cards imported!';
  _csvParsed = [];
  document.getElementById('csv-preview-wrap').style.display = 'none';
  importBtn.style.display = 'none';
  setTimeout(() => { closeCsvModal(); _loadPreserving(); }, 1400);
}

// ── Helpers ───────────────────────────────────────────────────────
function _esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// _jesc: use when embedding a value inside a JS string literal in an onclick attribute.
// HTML entities like &#39; get decoded by the HTML parser before JS runs, breaking syntax.
// Backslash-escaping is the correct approach for JS string contexts.
function _jesc(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}
function _slug(str) {
  return String(str).replace(/[^a-z0-9]/gi, '_').toLowerCase();
}
