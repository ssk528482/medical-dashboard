const SUPABASE_URL = "https://alrkpctsjmvspybrgdfy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscmtwY3Rzam12c3B5YnJnZGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjAxODcsImV4cCI6MjA4NzA5NjE4N30.TLSmuCaKCnZ99QUcwL9w7yUGJHrMMj-BWXnqNG7OTwU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── SAVE ────────────────────────────────────────────────────
async function saveToCloud() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { error } = await supabaseClient
    .from("study_data")
    .upsert(
      { user_id: user.id, data: studyData, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) console.error("Save error:", error);
}

// ─── LOAD (conflict-safe) ─────────────────────────────────────
async function loadFromCloud() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data, error } = await supabaseClient
    .from("study_data")
    .select("*")
    .eq("user_id", user.id)
    .limit(1);

  if (error) { console.error("Load error:", error); return; }

  if (data && data.length > 0) {
    let cloudData = data[0].data;
    if (typeof cloudData === "string") cloudData = JSON.parse(cloudData);

    let localData = JSON.parse(localStorage.getItem("studyData") || "{}");
    let merged = mergeData(localData, cloudData);
    merged = migrateData(merged);

    studyData = merged;
    localStorage.setItem("studyData", JSON.stringify(studyData));

    // Push local back if it's newer
    if (localData.updatedAt && cloudData.updatedAt && new Date(localData.updatedAt) > new Date(cloudData.updatedAt)) {
      await saveToCloud();
    }
  } else {
    await saveToCloud();
  }
}

// ─── LOGIN / LOGOUT ──────────────────────────────────────────
async function login() {
  const email = document.getElementById("emailInput")?.value;
  if (!email) { alert("Enter email"); return; }
  const { error } = await supabaseClient.auth.signInWithOtp({
    email: email,
    options: { emailRedirectTo: "https://medical-dashboard-lac.vercel.app/index.html" }
  });
  if (error) { alert("Login failed: " + error.message); }
  else { alert("Check your email for a magic link."); }
}

async function logout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem("studyData");
  window.location.href = "login.html";
}

// ─── INIT ─────────────────────────────────────────────────────
async function checkUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  // User greeting on index.html
  let greetingEl = document.getElementById("userGreeting");
  let statusEl = document.getElementById("authStatus");

  if (user) {
    if (greetingEl) {
      let name = studyData.userName || user.email.split("@")[0];
      let hour = new Date().getHours();
      let greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      greetingEl.textContent = `${greeting}, ${name} 👋`;
    }
    if (statusEl) statusEl.textContent = user.email;

    await loadFromCloud();
    await setupRealtime();
  } else {
    if (greetingEl) greetingEl.textContent = "Not logged in";
    if (statusEl) statusEl.textContent = "";
  }

  renderAll();
}

function renderAll() {
  if (typeof renderStatus === "function") renderStatus();
  if (typeof renderSubjects === "function") renderSubjects();
  if (typeof renderSavedPlan === "function") renderSavedPlan();
  if (typeof populateAllEveningSelectors === "function") populateAllEveningSelectors();
  if (typeof renderHeatmap === "function") renderHeatmap();
  if (typeof renderQbank === "function") renderQbank();
  if (typeof renderAnalytics === "function") renderAnalytics();
  if (typeof renderEditor === "function") renderEditor();
  if (typeof renderProfile === "function") renderProfile();
}

// ─── REALTIME ─────────────────────────────────────────────────
let realtimeChannel = null;

async function setupRealtime() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

  realtimeChannel = supabaseClient
    .channel("study-data-listener")
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "study_data", filter: `user_id=eq.${user.id}` },
      async (payload) => {
        let incoming = payload.new.data;
        if (typeof incoming === "string") incoming = JSON.parse(incoming);
        // Only apply if incoming is newer
        if (!studyData.updatedAt || new Date(incoming.updatedAt) > new Date(studyData.updatedAt)) {
          studyData = migrateData(incoming);
          localStorage.setItem("studyData", JSON.stringify(studyData));
          renderAll();
        }
      }
    )
    .subscribe();
}

document.addEventListener("DOMContentLoaded", checkUser);
