// notifications.js — Browser Push Notifications
// Requests permission once per session and sends a due-card reminder.
// Must be included AFTER supabase.js and cardSync.js.

(function () {
  'use strict';

  const STORAGE_KEY   = '_notifLastShown';
  const COOLDOWN_MINS = 60; // don't re-notify within 60 minutes

  // ── Request permission (shows browser prompt once) ─────────────
  function requestPermission() {
    if (!('Notification' in window)) return Promise.resolve('denied');
    if (Notification.permission === 'granted' || Notification.permission === 'denied') {
      return Promise.resolve(Notification.permission);
    }
    return Notification.requestPermission();
  }

  // ── Send a notification ─────────────────────────────────────────
  function sendNotification(title, body, url) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    let opts = { body, icon: 'icon/icon-192.svg', badge: 'icon/icon-192.svg', tag: 'medical-os' };
    let n = new Notification(title, opts);
    if (url) n.onclick = () => { window.focus(); window.location.href = url; n.close(); };
  }

  // ── Check cooldown ──────────────────────────────────────────────
  function _canNotify() {
    try {
      let last = parseInt(localStorage.getItem(STORAGE_KEY) || '0');
      return Date.now() - last > COOLDOWN_MINS * 60 * 1000;
    } catch (_) { return true; }
  }
  function _markNotified() {
    try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch (_) {}
  }

  // ── Main check ─────────────────────────────────────────────────
  async function checkAndNotify() {
    // Only run in a secure context / supported environment
    if (!('Notification' in window)) return;
    if (!_canNotify()) return;

    // Request permission if not yet decided
    let permission = await requestPermission();
    if (permission !== 'granted') return;

    // Fetch due cards (requires cardSync.js)
    if (typeof fetchDueCards !== 'function') return;
    try {
      let todayStr = typeof today === 'function' ? today() : new Date().toISOString().split('T')[0];
      let { data } = await fetchDueCards(todayStr);
      let count = data?.length || 0;
      if (count === 0) return;

      _markNotified();

      let title = count >= 20
        ? `📚 ${count} cards due — heavy day ahead!`
        : `🃏 ${count} flashcard${count > 1 ? 's' : ''} due today`;
      let body = count >= 20
        ? 'Consider splitting into 2 sessions. Tap to review.'
        : 'Stay on track — review now to maintain your streak.';

      sendNotification(title, body, 'review.html');
    } catch (_) {}
  }

  // ── Boot: run after page + data are ready ──────────────────────
  // We wait for DOMContentLoaded + a short delay so supabase auth can settle
  function _boot() {
    // Only trigger on home, review, or planner pages
    let page = window.location.pathname.split('/').pop() || 'index.html';
    if (['index.html', 'review.html', 'planner.html', ''].includes(page)) {
      setTimeout(checkAndNotify, 3000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }

  // Expose for manual calls (e.g., from pomodoro timer)
  window.sendNotification = sendNotification;
  window.requestNotifPermission = requestPermission;

})();
