// search.js — Global Search Overlay
// Press '/' anywhere to open. Searches chapters (sync), cards, and notes (async).
// Depends on: data.js (studyData), cardSync.js (fetchCards), noteSync.js (searchNotes)

(function () {
  'use strict';

  let _overlay, _input, _results, _debounceTimer, _lastQ = '';

  // ── Inject overlay ─────────────────────────────────────────────
  function _inject() {
    _overlay = document.createElement('div');
    _overlay.id = 'gs-overlay';
    _overlay.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.75);display:flex;flex-direction:column;align-items:center;padding-top:80px;padding-bottom:40px;opacity:0;pointer-events:none;';
    _overlay.innerHTML = `
      <div id="gs-box" style="
        width:min(680px,94vw);background:#0f172a;border:1px solid #1e3a5f;
        border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,0.7);
        overflow:hidden;display:flex;flex-direction:column;
        max-height:calc(100vh - 140px);
      ">
        <div style="display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #1e293b;">
          <span style="font-size:18px;color:#475569;">🔍</span>
          <input id="gs-input" type="text" placeholder="Search chapters, cards, notes…"
            autocomplete="off" spellcheck="false"
            style="flex:1;background:transparent;border:none;outline:none;
              font-size:16px;color:#f1f5f9;min-height:0;margin:0;padding:0;"/>
          <span style="font-size:11px;color:#334155;background:#1e293b;
            border-radius:4px;padding:2px 6px;cursor:pointer;" onclick="gsClose()">ESC</span>
        </div>
        <div id="gs-results" style="
          overflow-y:auto;padding:8px 0;
          max-height:calc(100vh - 220px);
        ">
          <div style="text-align:center;padding:24px;font-size:13px;color:#475569;">
            Type to search across your study material…
          </div>
        </div>
      </div>`;
    document.body.appendChild(_overlay);

    _input   = document.getElementById('gs-input');
    _results = document.getElementById('gs-results');

    _overlay.addEventListener('click', e => { if (e.target === _overlay) gsClose(); });
    _input.addEventListener('input', _onInput);
    _input.addEventListener('keydown', _onKeydown);
  }

  // ── Open / Close ───────────────────────────────────────────────
  function gsOpen() {
    _overlay.style.pointerEvents = 'auto';
    _overlay.style.opacity = '0';
    // double rAF ensures transition fires after display is active
    requestAnimationFrame(() => requestAnimationFrame(() => {
      _overlay.style.opacity = '1';
      _overlay.classList.add('gs-open');
    }));
    setTimeout(() => { _input.value = ''; _lastQ = ''; _input.focus(); _renderResults([]); }, 30);
  }
  window.gsOpen = gsOpen;

  function gsClose() {
    _overlay.style.opacity = '0';
    _overlay.classList.remove('gs-open');
    setTimeout(() => { _overlay.style.pointerEvents = 'none'; }, 240);
    clearTimeout(_debounceTimer);
  }
  window.gsClose = gsClose;

  // ── Global '/' shortcut ────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { gsClose(); return; }
    if (e.key === '/' && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) {
      e.preventDefault(); gsOpen();
    }
  });

  // ── Input handler ──────────────────────────────────────────────
  function _onInput() {
    let q = _input.value.trim();
    if (q === _lastQ) return;
    _lastQ = q;
    clearTimeout(_debounceTimer);
    if (!q) { _renderResults([]); return; }

    // Immediately show sync results (chapters)
    let syncResults = _searchChapters(q);
    _renderResults(syncResults, true);

    // Debounce async (cards + notes)
    _debounceTimer = setTimeout(() => _searchAsync(q, syncResults), 350);
  }

  function _onKeydown(e) {
    if (e.key === 'Escape') { gsClose(); return; }
    let items = _results.querySelectorAll('[data-result]');
    if (!items.length) return;
    let focused = _results.querySelector('[data-result].focused');
    let idx = Array.from(items).indexOf(focused);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      let next = items[idx + 1] || items[0];
      if (focused) focused.classList.remove('focused');
      next.classList.add('focused');
      next.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      let prev = items[idx - 1] || items[items.length - 1];
      if (focused) focused.classList.remove('focused');
      prev.classList.add('focused');
      prev.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (focused) { focused.click(); }
      else if (items[0]) { items[0].click(); }
    }
  }

  // ── Chapter search (sync) ──────────────────────────────────────
  function _searchChapters(q) {
    let results = [];
    if (typeof studyData === 'undefined' || !studyData?.subjects) return results;
    let ql = q.toLowerCase();
    Object.entries(studyData.subjects).forEach(([subj, sData]) => {
      sData.units.forEach(unit => {
        unit.chapters.forEach(ch => {
          let hay = [ch.name, unit.name, subj].join(' ').toLowerCase();
          if (hay.includes(ql)) {
            results.push({
              type: 'chapter',
              icon: ch.status === 'completed' ? '✅' : '📚',
              title: ch.name,
              sub:   subj + ' › ' + unit.name,
              url:   'editor.html',
              score: ch.name.toLowerCase().startsWith(ql) ? 2 : 1
            });
          }
        });
      });
    });
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, 8);
  }

  // ── Async search (cards + notes) ──────────────────────────────
  async function _searchAsync(q, syncResults) {
    if (q !== _lastQ) return; // stale
    let combined = [...syncResults];

    // Cards
    if (typeof fetchCards === 'function') {
      try {
        let { data: cards } = await fetchCards({ suspended: false });
        let ql = q.toLowerCase();
        let cardResults = (cards || []).filter(c => {
          let hay = [c.front_text, c.back_text, c.subject, c.chapter].join(' ').toLowerCase();
          return hay.includes(ql);
        }).slice(0, 6).map(c => ({
          type: 'card',
          icon: c.card_type === 'cloze' ? '📝' : '🃏',
          title: (c.front_text || '').slice(0, 70) + ((c.front_text || '').length > 70 ? '…' : ''),
          sub:   (c.subject || '') + (c.chapter ? ' › ' + c.chapter : ''),
          url:   'browse.html?subject=' + encodeURIComponent(c.subject||'') + '&unit=' + encodeURIComponent(c.unit||'') + '&chapter=' + encodeURIComponent(c.chapter||'')
        }));
        combined = combined.concat(cardResults);
      } catch (_) {}
    }

    // Notes
    if (typeof searchNotes === 'function') {
      try {
        let { data: notes } = await searchNotes(q);
        let noteResults = (notes || []).slice(0, 5).map(n => ({
          type: 'note',
          icon: '📝',
          title: n.title || (n.chapter || 'Note'),
          sub:   (n.subject || '') + (n.chapter ? ' › ' + n.chapter : ''),
          url:   'notes.html?subject=' + encodeURIComponent(n.subject||'') + '&unit=' + encodeURIComponent(n.unit||'') + '&chapter=' + encodeURIComponent(n.chapter||'')
        }));
        combined = combined.concat(noteResults);
      } catch (_) {}
    }

    if (q !== _lastQ) return; // stale after awaits
    _renderResults(combined);
  }

  // ── Render results ─────────────────────────────────────────────
  function _renderResults(items, loading) {
    if (!items.length && !loading) {
      _results.innerHTML = '<div style="text-align:center;padding:24px;font-size:13px;color:#475569;">' +
        (_lastQ ? 'No results for <strong style="color:#94a3b8;">' + _esc(_lastQ) + '</strong>' : 'Type to search…') + '</div>';
      return;
    }

    let grouped = { chapter: [], card: [], note: [] };
    items.forEach(r => { if (grouped[r.type]) grouped[r.type].push(r); });

    let html = '';
    let groups = [['chapter', '📚 Chapters'], ['card', '🃏 Cards'], ['note', '📝 Notes']];
    groups.forEach(([type, label]) => {
      let g = grouped[type];
      if (!g.length) return;
      html += '<div style="padding:6px 12px 2px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#475569;">' + label + '</div>';
      g.forEach(r => {
        html += '<div data-result="1" data-url="' + r.url + '" ' +
          'onclick="gsNavigate(this)" ' +
          'style="display:flex;align-items:flex-start;gap:10px;padding:9px 16px;cursor:pointer;' +
          'border-bottom:1px solid #0f172a;transition:background 0.1s;"' +
          ' onmouseenter="this.style.background=\'rgba(59,130,246,0.1)\'" onmouseleave="this.style.background=\'\'">' +
          '<span style="font-size:16px;flex-shrink:0;line-height:1.4;">' + r.icon + '</span>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:13px;color:#f1f5f9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _esc(r.title) + '</div>' +
          '<div style="font-size:11px;color:#475569;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + _esc(r.sub) + '</div>' +
          '</div></div>';
      });
    });

    if (loading) {
      html += '<div style="padding:8px 16px;font-size:12px;color:#334155;text-align:center;">Searching cards &amp; notes…</div>';
    }

    _results.innerHTML = html || '<div style="text-align:center;padding:24px;font-size:13px;color:#475569;">No results</div>';
  }

  function gsNavigate(el) {
    let url = el.dataset.url;
    if (url) { gsClose(); window.location.href = url; }
  }
  window.gsNavigate = gsNavigate;

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Boot ───────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _inject);
  } else {
    _inject();
  }

  // After nav is available, inject a search shortcut link
  function _injectNavSearch() {
    let navItems = document.querySelector('.side-nav-items');
    if (!navItems || document.getElementById('nav-search-btn')) return;
    let a = document.createElement('a');
    a.id   = 'nav-search-btn';
    a.href  = '#';
    a.className = 'side-nav-item';
    a.title = 'Global Search (press /)';
    a.innerHTML = '<span class="side-nav-icon">🔍</span><span class="side-nav-label">Search <span style="font-size:10px;color:#475569;background:#1e293b;padding:1px 5px;border-radius:4px;margin-left:4px;">/</span></span>';
    a.onclick = e => { e.preventDefault(); gsOpen(); };
    navItems.appendChild(a);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _injectNavSearch);
  } else {
    setTimeout(_injectNavSearch, 100);
  }

})();
