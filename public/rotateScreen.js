/* rotateScreen.js — Reliable programmatic landscape mode
   
   HOW IT WORKS:
   - Creates a fixed overlay div covering the whole screen
   - Sets it to width=screenHeight, height=screenWidth (swapped dims)
   - Rotates it 90deg with correct transform-origin
   - Moves all page content into a scrollable inner div inside the overlay
   - The side-nav is rebuilt as a horizontal bottom bar in landscape
   - Portrait restores everything to original DOM position
*/
(function () {
  'use strict';

  var KEY = 'screenRotated';
  var _on = localStorage.getItem(KEY) === '1';
  var _overlay    = null;
  var _inner      = null;
  var _origParent = null;   // original insertion point marker
  var _origSibling = null;
  var _styleTag   = null;
  var _initialized = false;

  /* ── inject persistent <style> ── */
  function ensureStyle() {
    if (_styleTag) return;
    _styleTag = document.createElement('style');
    _styleTag.id = 'rs-css';
    document.head.appendChild(_styleTag);
  }

  /* ── create the landscape overlay shell (once) ── */
  function buildOverlay() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'rs-overlay';
    _overlay.style.cssText = [
      'position:fixed',
      'top:0','left:0',
      'z-index:99999',
      'overflow:hidden',
      'background:var(--bg,#0a1628)',
      'display:none',
    ].join(';');

    _inner = document.createElement('div');
    _inner.id = 'rs-inner';
    _inner.style.cssText = [
      'width:100%',
      'height:100%',
      'overflow-y:auto',
      'overflow-x:hidden',
      '-webkit-overflow-scrolling:touch',
      'box-sizing:border-box',
    ].join(';');

    _overlay.appendChild(_inner);
    document.body.appendChild(_overlay);
  }

  /* ── horizontal nav bar shown at bottom of landscape overlay ── */
  function buildLandscapeNav() {
    var existing = document.getElementById('rs-nav');
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.id = 'rs-nav';
    bar.style.cssText = [
      'position:absolute','bottom:0','left:0','right:0',
      'height:52px',
      'background:rgba(10,18,36,0.97)',
      'border-top:1px solid #1e3350',
      'display:flex','align-items:center',
      'padding:0 8px','gap:2px',
      'z-index:10','overflow-x:auto','overflow-y:hidden',
      'scrollbar-width:none',
    ].join(';');

    /* Copy links from actual side-nav */
    var items = document.querySelectorAll('.side-nav .side-nav-item');
    items.forEach(function(a) {
      var icon  = a.querySelector('.side-nav-icon');
      var label = a.querySelector('.side-nav-label');
      var isActive = a.classList.contains('active');
      var lnk = document.createElement('a');
      lnk.href = a.href;
      lnk.style.cssText = [
        'display:flex','flex-direction:column','align-items:center',
        'gap:1px','text-decoration:none',
        'color:' + (isActive ? '#3b82f6' : '#7a90b0'),
        'font-size:9px','font-weight:600',
        'padding:4px 8px','border-radius:6px',
        'flex-shrink:0','min-width:44px',
        isActive ? 'background:rgba(59,130,246,0.12)' : '',
      ].join(';');
      lnk.innerHTML =
        '<span style="font-size:20px;">' + (icon ? icon.textContent : '') + '</span>' +
        '<span>' + (label ? label.textContent.trim() : '') + '</span>';
      bar.appendChild(lnk);
    });

    /* Spacer + portrait button */
    var spacer = document.createElement('div');
    spacer.style.cssText = 'flex:1;min-width:8px;';
    bar.appendChild(spacer);

    var pbtn = document.createElement('button');
    pbtn.textContent = '📱 Portrait';
    pbtn.style.cssText = [
      'background:rgba(59,130,246,0.15)',
      'border:1px solid rgba(59,130,246,0.3)',
      'color:#93c5fd','padding:6px 14px',
      'border-radius:8px','font-size:11px','font-weight:700',
      'cursor:pointer','margin:0','min-height:unset',
      'white-space:nowrap','flex-shrink:0',
    ].join(';');
    pbtn.onclick = function() { toggleRotation(); };
    bar.appendChild(pbtn);

    _overlay.appendChild(bar);
  }

  /* ── grab all body content (except nav + our overlay) ── */
  function grabContent() {
    /* Remember where content was */
    var frag = document.createDocumentFragment();
    var ref  = null;
    Array.from(document.body.children).forEach(function(c) {
      if (c.id === 'rs-overlay') return;
      if (c.classList.contains('side-nav')) return;
      if (!ref) ref = c;
      frag.appendChild(c);
    });

    /* Store marker for restoration */
    _origSibling = ref ? ref.nextSibling : null;
    _origParent  = document.body;

    _inner.appendChild(frag);
  }

  /* ── return content from inner back to body ── */
  function releaseContent() {
    var frag = document.createDocumentFragment();
    Array.from(_inner.children).forEach(function(c) {
      frag.appendChild(c);
    });
    /* Re-insert before the overlay (or at end of body) */
    document.body.insertBefore(frag, _overlay);
  }

  /* ── size and position the overlay for landscape ── */
  function sizeOverlay() {
    var sw = window.innerWidth;
    var sh = window.innerHeight;
    /* Overlay is sh wide × sw tall (swapped), rotated 90° CW */
    /* After rotation: top-left pivot, then shift left by sh to stay on screen */
    _overlay.style.width  = sh + 'px';
    _overlay.style.height = sw + 'px';
    _overlay.style.transformOrigin = '0 0';
    _overlay.style.transform = 'rotate(90deg) translateX(0px) translateY(-' + sh + 'px)';

    /* Inner scroll area: full width, minus bottom nav bar (52px) */
    _inner.style.height = (sw - 52) + 'px';
    _inner.style.width  = sh + 'px';
  }

  /* ── main apply ── */
  function apply(on) {
    ensureStyle();
    buildOverlay();

    if (on) {
      /* ── Enter landscape ── */
      grabContent();
      sizeOverlay();
      buildLandscapeNav();
      _overlay.style.display = 'block';

      /* Hide side nav */
      _styleTag.textContent =
        '.side-nav{display:none!important;}' +
        'body{margin-left:0!important;overflow:hidden!important;}';

      /* Reset inner scroll to top */
      _inner.scrollTop = 0;
    } else {
      /* ── Enter portrait ── */
      releaseContent();
      _overlay.style.display = 'none';
      var rsNav = document.getElementById('rs-nav');
      if (rsNav) rsNav.remove();
      _styleTag.textContent =
        '.side-nav{display:flex!important;}';
    }

    syncButtons(on);
  }

  function syncButtons(on) {
    document.querySelectorAll('.rotate-screen-btn').forEach(function(btn) {
      var ic = btn.querySelector('.rotate-screen-icon');
      var lb = btn.querySelector('.rotate-screen-label');
      if (ic) ic.textContent = on ? '📱' : '🔄';
      if (lb) lb.textContent = on ? 'Portrait' : 'Landscape';
      btn.title = on ? 'Switch to Portrait' : 'Switch to Landscape';
    });
  }

  /* ── Public API ── */
  window.toggleRotation = function() {
    _on = !_on;
    localStorage.setItem(KEY, _on ? '1' : '0');
    apply(_on);
  };
  window.isScreenRotated = function() { return _on; };

  /* ── Init ── */
  function init() {
    if (_initialized) return;
    _initialized = true;
    buildOverlay();
    ensureStyle();

    if (_on) {
      apply(true);
    } else {
      syncButtons(false);
    }

    window.addEventListener('resize', function() {
      if (_on) sizeOverlay();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Delay slightly to ensure all page scripts have run
    setTimeout(init, 0);
  }

})();
