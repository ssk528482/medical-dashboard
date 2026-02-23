/* rotateScreen.js — Programmatic landscape/portrait toggle
   The CORRECT approach: rotate a wrapper div that contains all scrollable
   content. The wrapper gets dimensions swapped (vh×vw) and rotated 90deg.
   Scrolling works because overflow is on the rotated wrapper, not html/body.
   The side-nav is hidden in landscape; a compact topbar replaces it.
*/
(function () {
  'use strict';

  var KEY = 'screenRotated';
  var _on = localStorage.getItem(KEY) === '1';

  /* ─── inject a <style> tag we'll update each toggle ─── */
  var _s = document.createElement('style');
  _s.id  = 'rs-style';
  document.head && document.head.appendChild(_s);

  /* ─── build / reuse wrapper div ─── */
  function getWrapper() {
    var w = document.getElementById('rs-wrap');
    if (w) return w;
    w = document.createElement('div');
    w.id = 'rs-wrap';
    /* Move every body child except <nav.side-nav> into wrapper */
    var kids = Array.from(document.body.children);
    kids.forEach(function(c) {
      if (!c.classList.contains('side-nav') && c.id !== 'rs-topbar') {
        w.appendChild(c);
      }
    });
    document.body.appendChild(w);
    return w;
  }

  /* ─── build the floating landscape topbar ─── */
  function getTopbar() {
    var tb = document.getElementById('rs-topbar');
    if (tb) return tb;
    tb = document.createElement('div');
    tb.id = 'rs-topbar';
    tb.innerHTML =
      '<div id="rs-topbar-links"></div>' +
      '<button onclick="toggleRotation()" style="' +
        'background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);' +
        'color:#93c5fd;padding:5px 12px;border-radius:8px;font-size:12px;' +
        'font-weight:700;cursor:pointer;margin:0;min-height:unset;white-space:nowrap;' +
        'flex-shrink:0;">📱 Portrait</button>';
    document.body.appendChild(tb);
    return tb;
  }

  /* populate topbar nav links from the side-nav */
  function populateTopbar() {
    var tb = getTopbar();
    var linksEl = document.getElementById('rs-topbar-links');
    if (!linksEl) return;
    linksEl.innerHTML = '';
    var navItems = document.querySelectorAll('.side-nav-item');
    navItems.forEach(function(a) {
      var icon  = a.querySelector('.side-nav-icon');
      var label = a.querySelector('.side-nav-label');
      var link  = document.createElement('a');
      link.href = a.href;
      link.style.cssText =
        'display:flex;flex-direction:column;align-items:center;gap:2px;' +
        'text-decoration:none;color:' + (a.classList.contains('active') ? '#3b82f6' : '#7a90b0') + ';' +
        'font-size:10px;font-weight:600;min-width:36px;';
      link.innerHTML =
        '<span style="font-size:18px;">' + (icon ? icon.textContent : '') + '</span>' +
        '<span>' + (label ? label.textContent.trim() : '') + '</span>';
      linksEl.appendChild(link);
    });
  }

  /* ─── core apply ─── */
  function apply(on) {
    getWrapper(); // ensure wrapper exists
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    if (on) {
      /* Landscape: wrapper is vh wide × vw tall, rotated 90deg CW */
      _s.textContent =
        'html,body{overflow:hidden!important;width:' + vw + 'px;height:' + vh + 'px;}' +
        '.side-nav{display:none!important;}' +
        '#rs-topbar{display:flex!important;}' +
        '#rs-wrap{' +
          'position:fixed;top:0;left:0;' +
          'width:' + vh + 'px;' +
          'height:' + (vw - 48) + 'px;' +   /* 48px = topbar height */
          'transform-origin:top left;' +
          'transform:rotate(90deg) translateY(-' + vw + 'px);' +
          'overflow-y:auto;overflow-x:hidden;' +
          '-webkit-overflow-scrolling:touch;' +
          'padding-top:0;' +
          'box-sizing:border-box;' +
          'background:var(--bg);' +
        '}' +
        /* Reset body margin since nav is hidden */
        '#rs-wrap>*:not(.side-nav){margin-left:0!important;}' +
        'body{margin-left:0!important;}';
      populateTopbar();
    } else {
      /* Portrait: remove all overrides */
      _s.textContent =
        '#rs-wrap{position:static;width:auto;height:auto;transform:none;overflow:visible;}' +
        '.side-nav{display:flex!important;}' +
        '#rs-topbar{display:none!important;}';
    }

    /* sync buttons */
    document.querySelectorAll('.rotate-screen-btn').forEach(function(btn) {
      var ic = btn.querySelector('.rotate-screen-icon');
      var lb = btn.querySelector('.rotate-screen-label');
      if (ic) ic.textContent  = on ? '📱' : '🔄';
      if (lb) lb.textContent  = on ? 'Portrait' : 'Landscape';
    });
  }

  window.toggleRotation = function() {
    _on = !_on;
    localStorage.setItem(KEY, _on ? '1' : '0');
    apply(_on);
  };

  window.isScreenRotated = function() { return _on; };

  function init() {
    getWrapper();
    getTopbar();
    apply(_on);
    window.addEventListener('resize', function() { if (_on) apply(true); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
