// supabase.js — Medical Study OS
// Tasks fixed: #1 (smart merge), #7 (offline detection),
//              #19 (loading skeleton / no content jump)

const SUPABASE_URL = "https://alrkpctsjmvspybrgdfy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscmtwY3Rzam12c3B5YnJnZGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjAxODcsImV4cCI6MjA4NzA5NjE4N30.TLSmuCaKCnZ99QUcwL9w7yUGJHrMMj-BWXnqNG7OTwU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── OFFLINE STATE MANAGEMENT ─────────────────────────────────
// Task #7: track online/offline, show banner, queue retries.
let _isOnline = navigator.onLine;
let _saveQueue = [];          // pending saves when offline
let _savePending = false;

function _setOnlineStatus(online) {
  _isOnline = online;
  let banner = document.getElementById("offline-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "offline-banner";
    banner.style.cssText = `
      position:fixed;bottom:0;left:0;right:0;z-index:9999;
      background:#1a0a00;border-top:2px solid #f59e0b;
      color:#fcd34d;font-size:12px;font-weight:600;
      text-align:center;padding:8px 16px;
      display:none;transition:opacity 0.3s;
    `;
    document.body.appendChild(banner);
  }

  if (!online) {
    banner.textContent = "📡 You're offline — changes saved locally, will sync when reconnected.";
    banner.style.display = "block";
  } else {
    if (banner.style.display !== "none") {
      banner.textContent = "✅ Back online — syncing...";
      banner.style.background = "#052e16";
      banner.style.borderColor = "#16a34a";
      banner.style.color = "#4ade80";
      // Flush pending saves
      _flushSaveQueue();
      setTimeout(() => { banner.style.display = "none"; }, 2500);
    }
  }
}

async function _flushSaveQueue() {
  if (!_isOnline || !_saveQueue.length) return;
  // Just do one full save of current state — no need to replay each queued item
  _saveQueue = [];
  await saveToCloud();
}

window.addEventListener("online",  () => _setOnlineStatus(true));
window.addEventListener("offline", () => _setOnlineStatus(false));

// ─── SAVE ────────────────────────────────────────────────────
async function saveToCloud() {
  if (!_isOnline) {
    // Queue a save for when we come back online
    if (!_saveQueue.includes("pending")) _saveQueue.push("pending");
    return;
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { error } = await supabaseClient
    .from("study_data")
    .upsert(
      { user_id: user.id, data: studyData, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );

  if (error) {
    console.error("Save error:", error);
    // If save failed due to network, treat as offline
    if (error.message?.includes("fetch") || error.code === "PGRST000") {
      _setOnlineStatus(false);
    }
  }
}

// ─── LOAD (conflict-safe smart merge) ─────────────────────────
// Task #19: show loading skeleton while cloud data loads, then
// re-render — prevents jarring content jumps by showing a spinner
// overlay rather than blank-to-full content flash.
async function loadFromCloud() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  // Show loading overlay
  _showLoadingOverlay(true);

  const { data, error } = await supabaseClient
    .from("study_data")
    .select("*")
    .eq("user_id", user.id)
    .limit(1);

  _showLoadingOverlay(false);

  if (error) { console.error("Load error:", error); return; }

  if (data && data.length > 0) {
    let cloudData = data[0].data;
    if (typeof cloudData === "string") cloudData = JSON.parse(cloudData);

    let localData = JSON.parse(localStorage.getItem("studyData") || "{}");

    // Task #1: use smart merge instead of last-write-wins
    let merged = mergeData(localData, cloudData);
    merged = migrateData(merged);

    studyData = merged;
    localStorage.setItem("studyData", JSON.stringify(studyData));

    // Push local back if it's newer (conflict resolution)
    if (localData.updatedAt && cloudData.updatedAt &&
        new Date(localData.updatedAt) > new Date(cloudData.updatedAt)) {
      await saveToCloud();
    }
  } else {
    await saveToCloud();
  }
}

// Loading overlay: shown while cloud data is fetching to prevent
// the "data appears then jumps" effect (task #19)
function _showLoadingOverlay(show) {
  let el = document.getElementById("cloud-loading-overlay");
  if (!el && show) {
    el = document.createElement("div");
    el.id = "cloud-loading-overlay";
    el.style.cssText = `
      position:fixed;inset:0;background:rgba(2,6,23,0.75);
      z-index:9998;display:flex;align-items:center;justify-content:center;
      transition:opacity 0.3s;
    `;
    el.innerHTML = `
      <div style="text-align:center;">
        <div style="width:36px;height:36px;border:3px solid #1e3a5f;border-top-color:#3b82f6;
          border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
        <div style="color:#94a3b8;font-size:13px;">Syncing your data...</div>
      </div>
    `;
    // Add keyframe if not present
    if (!document.getElementById("spin-style")) {
      let s = document.createElement("style");
      s.id = "spin-style";
      s.textContent = "@keyframes spin{to{transform:rotate(360deg)}}";
      document.head.appendChild(s);
    }
    document.body.appendChild(el);
  }
  if (el) {
    el.style.opacity = show ? "1" : "0";
    if (!show) setTimeout(() => el?.remove(), 300);
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

  let greetingEl = document.getElementById("userGreeting");
  let statusEl   = document.getElementById("authStatus");

  if (user) {
    if (greetingEl) {
      let name = studyData.userName || user.email.split("@")[0];
      let hour = new Date().getHours();
      let greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      greetingEl.textContent = `${greeting}, ${name} 👋`;
    }
    if (statusEl) statusEl.textContent = user.email;

    // Initial online status
    _setOnlineStatus(navigator.onLine);

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
        // Task #1: use smart merge on realtime updates too
        if (!studyData.updatedAt || new Date(incoming.updatedAt) > new Date(studyData.updatedAt)) {
          studyData = mergeData(studyData, migrateData(incoming));
          localStorage.setItem("studyData", JSON.stringify(studyData));
          renderAll();
        }
      }
    )
    .subscribe();
}

document.addEventListener("DOMContentLoaded", checkUser);
