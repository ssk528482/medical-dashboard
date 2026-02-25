/* rotateScreen.js — Programmatic landscape/portrait toggle
   Works by rotating <html> 90deg and swapping viewport dimensions.
   Persists preference in localStorage. */

(function () {
  'use strict';

  var STORAGE_KEY = 'screenRotated';
  var _rotated = localStorage.getItem(STORAGE_KEY) === '1';

  function applyRotation(rotated, animate) {
    var html = document.documentElement;
    if (rotated) {
      html.classList.add('screen-rotated');
    } else {
      html.classList.remove('screen-rotated');
    }
    // Update all rotate buttons across page
    document.querySelectorAll('.rotate-screen-btn').forEach(function (btn) {
      btn.setAttribute('title', rotated ? 'Switch to Portrait' : 'Switch to Landscape');
      btn.querySelector('.rotate-screen-icon').textContent = rotated ? '\uD83D\uDCF1' : '\uD83D\uDD04';
      btn.querySelector('.rotate-screen-label').textContent = rotated ? 'Portrait' : 'Landscape';
    });
  }

  function toggleRotation() {
    _rotated = !_rotated;
    localStorage.setItem(STORAGE_KEY, _rotated ? '1' : '0');
    applyRotation(_rotated, true);
  }

  // Apply on load immediately (no flash)
  document.addEventListener('DOMContentLoaded', function () {
    applyRotation(_rotated, false);
  });
  // Also run right away in case DOMContentLoaded already fired
  if (document.readyState !== 'loading') {
    applyRotation(_rotated, false);
  }

  // ── Touch-scroll fix for rotated mode on touch devices ────────────────────
  // When html is CSS-rotated 90deg clockwise every scrollable element — body,
  // nav, modals, notes panels, etc. — has its axis remapped:
  //   visual "down" swipe = finger moves RIGHT in screen coords (dx > 0)
  //   → target.scrollTop should INCREASE
  //
  // Strategy:
  //   touchstart → walk the DOM from the touched element upward to find the
  //                nearest ancestor (or body) that can actually scroll vertically.
  //   touchmove  → route dx → that element's scrollTop (with preventDefault so
  //                the browser doesn't try its own (broken) scroll).
  //   touchend   → launch momentum / inertia on the same target.

  var _tx = 0, _velX = 0, _lastT = 0, _rafID = null, _scrollTarget = null;

  // Walk up from `el` and return the first element whose content overflows
  // vertically (scrollHeight > clientHeight) with an overflow-y that allows
  // scrolling. Falls back to document.body.
  function _findScrollParent(el) {
    while (el && el !== document.body) {
      var style = window.getComputedStyle(el);
      var oy = style.overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) {
        return el;
      }
      el = el.parentElement;
    }
    return document.body;
  }

  function _stopMomentum() {
    if (_rafID) { cancelAnimationFrame(_rafID); _rafID = null; }
  }

  function _runMomentum() {
    if (!_scrollTarget || Math.abs(_velX) < 0.5) { _rafID = null; return; }
    _scrollTarget.scrollTop += _velX;
    _velX *= 0.93;                          // iOS-like friction
    _rafID = requestAnimationFrame(_runMomentum);
  }

  document.addEventListener('touchstart', function (e) {
    if (!_rotated) return;
    _stopMomentum();
    _scrollTarget = _findScrollParent(e.target);
    _tx    = e.touches[0].clientX;
    _velX  = 0;
    _lastT = Date.now();
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!_rotated || !_scrollTarget) return;
    var dx  = e.touches[0].clientX - _tx;
    _tx = e.touches[0].clientX;

    var now = Date.now();
    var dt  = Math.max(1, now - _lastT);
    _lastT  = now;

    // dx > 0 (rightward in screen) = downward visually → scrollTop increases
    _scrollTarget.scrollTop += dx;
    _velX = (dx / dt) * 16;               // velocity scaled to ~60 fps frame

    e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', function () {
    if (!_rotated) return;
    _rafID = requestAnimationFrame(_runMomentum);
  }, { passive: true });

  // Expose globally
  window.toggleRotation = toggleRotation;
  window.isScreenRotated = function () { return _rotated; };
})();
