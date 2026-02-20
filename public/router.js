// ─── Router / Auth Guard ──────────────────────────────────────
// Include this on every protected page BEFORE other scripts.
// Pages that DON'T need auth: login.html, setup.html

(async function routeGuard() {
  const publicPages = ["login.html", "setup.html"];
  const currentPage = window.location.pathname.split("/").pop() || "index.html";

  // Skip guard on public pages
  if (publicPages.includes(currentPage)) return;

  const SUPABASE_URL = "https://alrkpctsjmvspybrgdfy.supabase.co";
  const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscmtwY3Rzam12c3B5YnJnZGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjAxODcsImV4cCI6MjA4NzA5NjE4N30.TLSmuCaKCnZ99QUcwL9w7yUGJHrMMj-BWXnqNG7OTwU";

  // Need to init supabase early for the check
  // (supabaseClient is declared in supabase.js but may not be loaded yet)
  const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    const { data: { session } } = await _sb.auth.getSession();

    if (!session) {
      // Not logged in → go to login
      window.location.href = "login.html";
      return;
    }

    // Logged in but check setup complete
    let localData = JSON.parse(localStorage.getItem("studyData") || "{}");

    // Also try cloud for setup status
    if (!localData.setupComplete) {
      const { data } = await _sb
        .from("study_data")
        .select("data")
        .eq("user_id", session.user.id)
        .limit(1);

      if (data && data.length > 0) {
        let cloudData = data[0].data;
        if (typeof cloudData === "string") cloudData = JSON.parse(cloudData);
        if (cloudData.setupComplete) {
          // Cloud has setup, update local
          localStorage.setItem("studyData", JSON.stringify(cloudData));
          return; // allow access
        }
      }

      // Setup not done → go to setup wizard
      window.location.href = "setup.html";
    }
  } catch (err) {
    console.error("Router guard error:", err);
    // On error, allow access (don't break the app)
  }
})();
