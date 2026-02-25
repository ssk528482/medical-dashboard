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
  // When html is CSS-rotated 90deg clockwise:
  //   visual "down" swipe = finger moves RIGHT in screen coords (clientX increases, dx > 0)
  //   → body.scrollTop should INCREASE (scroll down)
  // Direction fix: scrollTop += dx  (not -dx)
  // Momentum: track velocity at touchend, decelerate with rAF for natural iOS feel.
  var _tx = 0, _velX = 0, _lastT = 0, _rafID = null;

  function _stopMomentum() {
    if (_rafID) { cancelAnimationFrame(_rafID); _rafID = null; }
  }

  function _runMomentum() {
    if (Math.abs(_velX) < 0.5) { _rafID = null; return; }
    document.body.scrollTop += _velX;
    _velX *= 0.93;                        // friction coefficient — matches iOS feel
    _rafID = requestAnimationFrame(_runMomentum);
  }

  document.addEventListener('touchstart', function (e) {
    if (!_rotated) return;
    _stopMomentum();
    _tx   = e.touches[0].clientX;
    _velX = 0;
    _lastT = Date.now();
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (!_rotated) return;
    var dx  = e.touches[0].clientX - _tx;
    _tx = e.touches[0].clientX;

    var now = Date.now();
    var dt  = Math.max(1, now - _lastT);
    _lastT  = now;

    // dx > 0 (swipe right in screen) = swipe DOWN visually → scrollTop increases
    document.body.scrollTop += dx;
    _velX = (dx / dt) * 16;              // velocity → scaled to ~60fps frame

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
