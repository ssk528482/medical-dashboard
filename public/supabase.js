// ─────────────────────────────────────────────────────────────
// 1) Replace YOUR_URL and YOUR_ANON_KEY with values from
//    Supabase Settings → API → Project URL & anon public key
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = "https://alrkpctsjmvspybrgdfy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscmtwY3Rzam12c3B5YnJnZGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjAxODcsImV4cCI6MjA4NzA5NjE4N30.TLSmuCaKCnZ99QUcwL9w7yUGJHrMMj-BWXnqNG7OTwU";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

// 🔥 SAVE TO CLOUD
async function saveToCloud() {

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { error } = await supabaseClient
    .from("study_data")
    .upsert(
      {
        user_id: user.id,
        data: studyData,
        updated_at: new Date().toISOString()
      },
      {
        onConflict: "user_id"
      }
    );

  if (error) {
    console.error("Save error:", error);
  }
}


// 🔥 LOAD FROM CLOUD
async function loadFromCloud() {

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data, error } = await supabaseClient
    .from("study_data")
    .select("*")
    .eq("user_id", user.id)
    .limit(1);

  if (error) {
    console.log("Load error:", error);
    return;
  }

  if (data && data.length > 0) {

    let cloudData = data[0].data;

    // 🔥 Safety: If string, parse it
    if (typeof cloudData === "string") {
      cloudData = JSON.parse(cloudData);
    }

    studyData = cloudData;

    localStorage.setItem("studyData", JSON.stringify(studyData));

  } else {

    await saveToCloud();
  }
}


// 🔥 LOGIN
async function login() {

  const email = document.getElementById("emailInput").value;
  if (!email) {
    alert("Enter email");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: "https://medical-dashboard-lac.vercel.app"
    }
  });

  if (error) {
    console.error(error);
    alert("Login failed.");
  } else {
    alert("Check your email.");
  }
}


// 🔥 LOGOUT
async function logout() {
  await supabaseClient.auth.signOut();
  location.reload();
}


// 🔥 INIT
async function checkUser() {

  const { data: { user } } = await supabaseClient.auth.getUser();

  const statusEl = document.getElementById("authStatus");
  if (statusEl) {
    statusEl.innerText = user ? "Logged in" : "Not logged in";
  }

  if (user) {
    await loadFromCloud();
    await setupRealtime();
  }

  // 🔥 Now render everything safely
  if (typeof renderSubjects === "function") renderSubjects();
  if (typeof renderSavedPlan === "function") renderSavedPlan();
  if (typeof populateAllEveningSelectors === "function") populateAllEveningSelectors();
  if (typeof renderHeatmap === "function") renderHeatmap();
  if (typeof renderRevisionSection === "function") renderRevisionSection();
  if (typeof renderQbank === "function") renderQbank();
  if (typeof renderAnalytics === "function") renderAnalytics();
  if (typeof renderEditor === "function") renderEditor();
}

let realtimeChannel = null;

async function setupRealtime() {

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;

  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
  }

  realtimeChannel = supabaseClient
    .channel("study-data-listener")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "study_data",
        filter: `user_id=eq.${user.id}`
      },
      async (payload) => {

        console.log("Realtime update received");

        studyData = payload.new.data;

        localStorage.setItem("studyData", JSON.stringify(studyData));

        // Re-render everything
        if (typeof renderSubjects === "function") renderSubjects();
        if (typeof renderSavedPlan === "function") renderSavedPlan();
        if (typeof populateAllEveningSelectors === "function") populateAllEveningSelectors();
        if (typeof renderHeatmap === "function") renderHeatmap();
        if (typeof renderRevisionSection === "function") renderRevisionSection();
        if (typeof renderQbank === "function") renderQbank();
        if (typeof renderAnalytics === "function") renderAnalytics();
        if (typeof renderEditor === "function") renderEditor();
      }
    )
    .subscribe();
}

document.addEventListener("DOMContentLoaded", checkUser);
