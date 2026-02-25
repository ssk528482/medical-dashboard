// ─── Router / Auth Guard ──────────────────────────────────────
// Include this on every protected page BEFORE other scripts.
// Pages that DON'T need auth: login.html, setup.html

(async function routeGuard() {
  const publicPages = ["login.html", "setup.html"];
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  // Skip guard on public pages
  if (publicPages.includes(currentPage)) return;

  // Hide page until auth check completes — prevents flash of protected content
  document.documentElement.style.opacity = '0';
  document.documentElement.style.transition = 'opacity 0.15s';

  const SUPABASE_URL = "https://alrkpctsjmvspybrgdfy.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscmtwY3Rzam12c3B5YnJnZGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjAxODcsImV4cCI6MjA4NzA5NjE4N30.TLSmuCaKCnZ99QUcwL9w7yUGJHrMMj-BWXnqNG7OTwU";

  // Singleton — create once, reuse on all subsequent loads (e.g. supabase.js)
  if (!window._supabaseSingleton) {
    window._supabaseSingleton = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  const _sb = window._supabaseSingleton;

  function showPage() { document.documentElement.style.opacity = '1'; }

  try {
    const { data: { session } } = await _sb.auth.getSession();

    if (!session) {
      // Save intended destination so login.html can redirect back after sign-in
      sessionStorage.setItem('authReturnTo', currentPage + window.location.search);
      window.location.href = "login.html";
      return;
    }

    // Logged in — check setup complete
    let localData = JSON.parse(localStorage.getItem("studyData") || "{}");

    if (!localData.setupComplete) {
      // Local doesn't confirm — check cloud (catches cleared-localStorage case)
      const { data } = await _sb
        .from("user_meta")
        .select("setup_complete")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data && data.setup_complete) {
        // Cloud confirms setup is done — allow access
        showPage();
        return;
      }

      // Setup genuinely not done → go to setup wizard
      window.location.href = "setup.html";
      return;
    }

    // All good — show the page
    showPage();
  } catch (err) {
    console.error("Router guard error:", err);
    // On error, show the page anyway (don't lock users out)
    showPage();
  }
})();
