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

// ─────────────────────────────────────────────────────────────
// 2) Save cloud function — upserts or inserts on conflict
// ─────────────────────────────────────────────────────────────

async function saveToCloud() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  if (!user) return;

  await supabaseClient
    .from("study_data")
    .upsert({
      user_id: user.id,
      data: studyData,
      updated_at: new Date().toISOString()
    });
}

// ─────────────────────────────────────────────────────────────
// 3) Load cloud function — loads stored JSON from Supabase
// ─────────────────────────────────────────────────────────────

async function loadFromCloud() {

  const { data: { user } } = await supabaseClient.auth.getUser();

  if (!user) return;

  const { data, error } = await supabaseClient
    .from("study_data")
    .select("data")
    .eq("user_id", user.id);

  if (error) {
    console.log("Load error:", error);
    return;
  }

  // 🔥 If cloud data exists, override local completely
  if (data && data.length > 0) {

    studyData = data[0].data;

    localStorage.setItem("studyData", JSON.stringify(studyData));

    console.log("Cloud data loaded and applied.");

  } else {

    // First time user → push local to cloud
    await saveToCloud();

  }

}

// ─────────────────────────────────────────────────────────────
// 4) Login / Logout / Auth State Tracking
// ─────────────────────────────────────────────────────────────

async function login() {

  const email = document.getElementById("emailInput").value;

  if (!email) {
    alert("Enter email");
    return;
  }

  await supabaseClient.auth.signInWithOtp({
    email: email,
    options: {
      emailRedirectTo: "https://medical-dashboard-lac.vercel.app"
    }
  });

  alert("Check your email for login link.");
}

async function logout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem("studyData");
  location.reload();
}

async function checkUser() {

  const { data: { user } } = await supabaseClient.auth.getUser();

  if (user) {

    const statusEl = document.getElementById("authStatus");
    if (statusEl) statusEl.innerText = "Logged in"; 
    
    await loadFromCloud(); // 🔥 WAIT for cloud

    if (typeof renderSubjects === "function") renderSubjects();
    if (typeof renderQbank === "function") renderQbank();
    if (typeof renderAnalytics === "function") renderAnalytics();

  } else {

    if (statusEl) statusEl.innerText = "Not logged in";
    
  }

}

document.addEventListener("DOMContentLoaded", checkUser);
