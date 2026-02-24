// ─── Router / Auth Guard ──────────────────────────────────────
// Include this on every protected page BEFORE other scripts.
// Pages that DON'T need auth: login.html, setup.html
//
// FIX: Was querying the old `study_data` table directly.
// Now checks `user_meta.setup_complete` from the new normalized schema,
// with a fallback to localStorage for offline/fast-load cases.

(async function routeGuard() {
  const publicPages = ["login.html", "setup.html"];
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  // Skip guard on public pages
  if (publicPages.includes(currentPage)) return;

  const SUPABASE_URL     = "https://alrkpctsjmvspybrgdfy.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscmtwY3Rzam12c3B5YnJnZGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjAxODcsImV4cCI6MjA4NzA5NjE4N30.TLSmuCaKCnZ99QUcwL9w7yUGJHrMMj-BWXnqNG7OTwU";

  const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    const { data: { session } } = await _sb.auth.getSession();

    if (!session) {
      window.location.href = "login.html";
      return;
    }

    // ── Fast path: check localStorage first (avoids network round-trip) ──
    let localData = JSON.parse(localStorage.getItem("studyData") || "{}");
    if (localData.setupComplete) return; // all good, let the page load

    // ── Cloud path: check user_meta table (new schema) ──────────────────
    // Falls back to old study_data table if user_meta doesn't exist yet
    // so we don't break existing users during migration.
    let setupComplete = false;

    try {
      const { data: metaRows } = await _sb
        .from("user_meta")
        .select("setup_complete")
        .eq("user_id", session.user.id)
        .limit(1);

      if (metaRows && metaRows.length > 0) {
        setupComplete = metaRows[0].setup_complete === true;
      }
    } catch (_) {
      // user_meta table may not exist yet (pre-migration) — try old table
      try {
        const { data: oldRows } = await _sb
          .from("study_data")
          .select("data")
          .eq("user_id", session.user.id)
          .limit(1);

        if (oldRows && oldRows.length > 0) {
          let cloudData = oldRows[0].data;
          if (typeof cloudData === "string") cloudData = JSON.parse(cloudData);
          setupComplete = !!cloudData?.setupComplete;

          // Sync to localStorage so future checks are fast
          if (setupComplete && !localData.setupComplete) {
            localData = { ...localData, ...cloudData };
            localStorage.setItem("studyData", JSON.stringify(localData));
          }
        }
      } catch (fallbackErr) {
        console.warn("Router: both user_meta and study_data checks failed:", fallbackErr);
      }
    }

    if (!setupComplete) {
      window.location.href = "setup.html";
    }

  } catch (err) {
    console.error("Router guard error:", err);
    // On error, allow access — don't lock users out due to network failure
  }
})();
