// supabase.js — Medical Study OS
// Architecture: normalized tables (subjects, units, chapters, user_meta, daily_history)
// Tasks covered: #1 (smart merge), #7 (offline detection), #19 (loading skeleton)

const SUPABASE_URL = "https://alrkpctsjmvspybrgdfy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscmtwY3Rzam12c3B5YnJnZGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjAxODcsImV4cCI6MjA4NzA5NjE4N30.TLSmuCaKCnZ99QUcwL9w7yUGJHrMMj-BWXnqNG7OTwU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── OFFLINE STATE MANAGEMENT ─────────────────────────────────
let _isOnline = navigator.onLine;
let _saveQueue = [];
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
      _flushSaveQueue();
      setTimeout(() => { banner.style.display = "none"; }, 2500);
    }
  }
}

async function _flushSaveQueue() {
  if (!_isOnline || !_saveQueue.length) return;
  _saveQueue = [];
  await saveToCloud();
}

window.addEventListener("online",  () => _setOnlineStatus(true));
window.addEventListener("offline", () => _setOnlineStatus(false));

// ─── HELPERS ──────────────────────────────────────────────────
async function _getUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user;
}

function _handleSaveError(error) {
  console.error("Save error:", error);
  if (error?.message?.includes("fetch") || error?.code === "PGRST000") {
    _setOnlineStatus(false);
  }
}

// ─── SAVE TO CLOUD ────────────────────────────────────────────
// Writes studyData into the normalized tables:
//   user_meta  — settings, pointers, daily plan, ui state
//   subjects   — one row per subject
//   units      — one row per unit
//   chapters   — one row per chapter
//   daily_history — one row per day
async function saveToCloud() {
  if (!_isOnline) {
    if (!_saveQueue.includes("pending")) _saveQueue.push("pending");
    return;
  }

  const user = await _getUser();
  if (!user) return;

  const uid = user.id;

  try {
    await Promise.all([
      _saveUserMeta(uid),
      _saveSubjectsUnitsChapters(uid),
      _saveDailyHistory(uid),
    ]);
  } catch (err) {
    _handleSaveError(err);
  }
}

// ── user_meta ─────────────────────────────────────────────────
async function _saveUserMeta(uid) {
  const pointers = {};
  Object.entries(studyData.subjects || {}).forEach(([name, s]) => {
    pointers[name] = s.pointer || { unit: 0, chapter: 0 };
  });

  const payload = {
    exam_date:        studyData.examDate        || "2026-12-01",
    start_date:       studyData.startDate       || today(),
    reading_speed:    studyData.readingSpeed    || 25,
    qbank_speed:      studyData.qbankSpeed      || 30,
    user_name:        studyData.userName        || null,
    setup_complete:   studyData.setupComplete   || false,
    subject_pointers: pointers,
    ui_state:         { ...(studyData.uiState || {}), dismissedAlerts: studyData.dismissedAlerts || {} },
    daily_plan:       studyData.dailyPlan       || null,
    updated_at:       new Date().toISOString(),
  };

  const { data: existing } = await supabaseClient
    .from("user_meta").select("user_id").eq("user_id", uid).maybeSingle();

  let error;
  if (existing) {
    ({ error } = await supabaseClient.from("user_meta").update(payload).eq("user_id", uid));
  } else {
    ({ error } = await supabaseClient.from("user_meta").insert({ user_id: uid, ...payload }));
  }

  if (error) throw error;
}

// ── subjects + units + chapters ────────────────────────────────
// Uses select-then-insert/update to avoid requiring unique constraints.
async function _saveSubjectsUnitsChapters(uid) {
  const subjects = studyData.subjects || {};

  for (const [subjectName, subject] of Object.entries(subjects)) {

    // 1. Upsert subject row
    const { data: subjRow, error: subjErr } = await supabaseClient
      .from("subjects")
      .upsert(
        { user_id: uid, name: subjectName, size: subject.size || "medium", updated_at: new Date().toISOString() },
        { onConflict: "user_id,name" }
      )
      .select("id")
      .single();
    if (subjErr) { console.error("Subject save error:", subjErr); continue; }
    const subjectId = subjRow.id;

    // 2. Find or create each unit
    const units = subject.units || [];
    for (let ui = 0; ui < units.length; ui++) {
      const unit = units[ui];

      const { data: unitRow, error: unitErr } = await supabaseClient
        .from("units")
        .upsert(
          {
            user_id:        uid,
            subject_id:     subjectId,
            subject_name:   subjectName,
            name:           unit.name,
            sort_order:     ui,
            question_count: unit.questionCount       || 0,
            qbank_total:    unit.qbankStats?.total   || 0,
            qbank_correct:  unit.qbankStats?.correct || 0,
            qbank_done:     unit.qbankDone           || false,
            collapsed:      unit.collapsed           || false,
            updated_at:     new Date().toISOString(),
          },
          { onConflict: "subject_id,name" }
        )
        .select("id")
        .single();
      if (unitErr) { console.error("Unit save error:", unitErr); continue; }
      const unitId = unitRow.id;

      // 3. Find or create each chapter
      const chapters = unit.chapters || [];
      for (let ci = 0; ci < chapters.length; ci++) {
        const ch = chapters[ci];
        const { error: chErr } = await supabaseClient
          .from("chapters")
          .upsert(
            {
              user_id:          uid,
              unit_id:          unitId,
              subject_name:     subjectName,
              unit_name:        unit.name,
              name:             ch.name,
              sort_order:       ci,
              status:           ch.status            || "not-started",
              difficulty:       ch.difficulty        || "medium",
              difficulty_factor: ch.difficultyFactor ?? 2.5,
              missed_revisions: ch.missedRevisions   || 0,
              start_page:       ch.startPage         || 0,
              end_page:         ch.endPage           || 0,
              page_count:       ch.pageCount         || 0,
              completed_on:     ch.completedOn       || null,
              last_reviewed_on: ch.lastReviewedOn    || null,
              next_revision:    ch.nextRevision      || null,
              revision_index:   ch.revisionIndex     || 0,
              revision_dates:   ch.revisionDates     || [],
              updated_at:       new Date().toISOString(),
            },
            { onConflict: "unit_id,name" }
          );
        if (chErr) console.error("Chapter save error:", chErr);
      }
    }
  }
}

// ── Generic select-then-insert/update helper ──────────────────
// matchKeys: { col: val } used to find existing row
// updateFields: fields to set on update or merge on insert
// Returns the row id, or null on failure.
async function _upsertRow(table, matchKeys, updateFields) {
  try {
    // Try to find existing row
    let query = supabaseClient.from(table).select("id");
    for (const [col, val] of Object.entries(matchKeys)) {
      query = query.eq(col, val);
    }
    const { data: existing, error: selErr } = await query.maybeSingle();
    if (selErr) throw selErr;

    if (existing) {
      // Update
      const { error: updErr } = await supabaseClient
        .from(table)
        .update({ ...updateFields, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updErr) throw updErr;
      return existing.id;
    } else {
      // Insert
      const { data: inserted, error: insErr } = await supabaseClient
        .from(table)
        .insert({ ...matchKeys, ...updateFields, updated_at: new Date().toISOString() })
        .select("id")
        .single();
      if (insErr) throw insErr;
      return inserted.id;
    }
  } catch (err) {
    console.error(`_upsertRow(${table}) error:`, err);
    return null;
  }
}

// ── daily_history ─────────────────────────────────────────────
async function _saveDailyHistory(uid) {
  const history = studyData.dailyHistory || {};
  const entries = Object.entries(history);
  if (!entries.length) return;

  // Upsert all days in one batch (Supabase supports array upsert)
  const rows = entries.map(([date, h]) => ({
    user_id:           uid,
    date:              date,
    study:             h.study             || false,
    qbank:             h.qbank             || false,
    revision:          h.revision          || false,
    evening_submitted: h.eveningSubmitted  || false,
    study_subject:     h.studySubject      || null,
    study_entries:     h.studyEntries      || [],
    qbank_entries:     h.qbankEntries      || [],
    revised_items:     h.revisedItems      || [],
    time_tracking:     h.timeTracking      || null,
    submitted_at:      h.submittedAt       || null,
  }));

  // Batch in chunks of 50 to avoid request size limits
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const { error } = await supabaseClient
      .from("daily_history")
      .upsert(chunk, { onConflict: "user_id,date" });
    if (error) console.error("Daily history save error:", error);
  }
}

// ─── LOAD FROM CLOUD ──────────────────────────────────────────
// Reads from all normalized tables and reconstructs studyData in memory.
// Then merges with localStorage using the smart merge (Task #1).
async function loadFromCloud() {
  const user = await _getUser();
  if (!user) return;

  _showLoadingOverlay(true);

  try {
    const uid = user.id;
    const [meta, subjects, units, chapters, history] = await Promise.all([
      supabaseClient.from("user_meta").select("*").eq("user_id", uid).maybeSingle(),
      supabaseClient.from("subjects").select("*").eq("user_id", uid),
      supabaseClient.from("units").select("*").eq("user_id", uid).order("sort_order"),
      supabaseClient.from("chapters").select("*").eq("user_id", uid).order("sort_order"),
      supabaseClient.from("daily_history").select("*").eq("user_id", uid),
    ]);

    // Check for errors
    for (const result of [meta, subjects, units, chapters, history]) {
      if (result.error) throw result.error;
    }

    // If no data exists in new tables yet, fall back gracefully
    if (!meta.data && (!subjects.data || subjects.data.length === 0)) {
      _showLoadingOverlay(false);
      await saveToCloud(); // seed the new tables from localStorage
      return;
    }

    // ── Reconstruct studyData from normalized rows ──
    const cloudData = _reconstructStudyData(
      meta.data,
      subjects.data || [],
      units.data    || [],
      chapters.data || [],
      history.data  || []
    );

    console.log("[Load] Cloud subjects:", Object.keys(cloudData.subjects || {}));
    console.log("[Load] Units per subject:", Object.fromEntries(
      Object.entries(cloudData.subjects || {}).map(([k,v]) => [k, v.units?.length || 0])
    ));

    // Cloud normalized tables are always the source of truth.
    // Do NOT run migrateData() here — that function is for upgrading the old
    // localStorage blob format and would incorrectly wrap subjects in a "General" unit.
    studyData = cloudData;
    localStorage.setItem("studyData", JSON.stringify(studyData));

  } catch (err) {
    console.error("Load error:", err);
  } finally {
    _showLoadingOverlay(false);
  }
}

// ── Reconstruct in-memory studyData from normalized DB rows ───
function _reconstructStudyData(meta, subjectRows, unitRows, chapterRows, historyRows) {
  const data = {};

  // ── user_meta ──
  if (meta) {
    data.examDate         = meta.exam_date        || "2026-12-01";
    data.startDate        = meta.start_date        || today();
    data.readingSpeed     = meta.reading_speed     || 25;
    data.qbankSpeed       = meta.qbank_speed       || 30;
    data.userName         = meta.user_name         || null;
    data.setupComplete    = meta.setup_complete    || false;
    const uiState         = meta.ui_state          || {};
    data.dismissedAlerts  = uiState.dismissedAlerts || {};
    data.uiState          = { ...uiState };
    delete data.uiState.dismissedAlerts;
    data.dailyPlan        = meta.daily_plan        || null;
    data.updatedAt        = meta.updated_at        || null;
    const pointers        = meta.subject_pointers  || {};

    // ── subjects ──
    data.subjects = {};

    // Build lookup maps
    const unitsBySubjectId  = {};
    const chaptersByUnitId  = {};

    unitRows.forEach(u => {
      if (!unitsBySubjectId[u.subject_id]) unitsBySubjectId[u.subject_id] = [];
      unitsBySubjectId[u.subject_id].push(u);
    });
    chapterRows.forEach(ch => {
      if (!chaptersByUnitId[ch.unit_id]) chaptersByUnitId[ch.unit_id] = [];
      chaptersByUnitId[ch.unit_id].push(ch);
    });

    subjectRows.forEach(s => {
      const subjectUnits = (unitsBySubjectId[s.id] || []).sort((a, b) => a.sort_order - b.sort_order);

      const units = subjectUnits.map(u => {
        const unitChapters = (chaptersByUnitId[u.id] || []).sort((a, b) => a.sort_order - b.sort_order);

        return {
          name:          u.name,
          collapsed:     u.collapsed     || false,
          questionCount: u.question_count || 0,
          qbankDone:     u.qbank_done    || false,
          qbankStats: {
            total:   u.qbank_total   || 0,
            correct: u.qbank_correct || 0,
          },
          chapters: unitChapters.map(ch => ({
            name:             ch.name,
            status:           ch.status             || "not-started",
            difficulty:       ch.difficulty         || "medium",
            difficultyFactor: ch.difficulty_factor  ?? 2.5,
            missedRevisions:  ch.missed_revisions   || 0,
            startPage:        ch.start_page         || 0,
            endPage:          ch.end_page           || 0,
            pageCount:        ch.page_count         || 0,
            completedOn:      ch.completed_on       || null,
            lastReviewedOn:   ch.last_reviewed_on   || null,
            nextRevision:     ch.next_revision      || null,
            revisionIndex:    ch.revision_index     || 0,
            revisionDates:    ch.revision_dates     || [],
          })),
        };
      });

      data.subjects[s.name] = {
        size:    s.size || "medium",
        units,
        pointer: pointers[s.name] || { unit: 0, chapter: 0 },
      };
    });
  }

  // ── daily_history ──
  data.dailyHistory = {};
  historyRows.forEach(h => {
    data.dailyHistory[h.date] = {
      study:             h.study             || false,
      qbank:             h.qbank             || false,
      revision:          h.revision          || false,
      eveningSubmitted:  h.evening_submitted || false,
      studySubject:      h.study_subject     || null,
      studyEntries:      h.study_entries     || [],
      qbankEntries:      h.qbank_entries     || [],
      revisedItems:      h.revised_items     || [],
      timeTracking:      h.time_tracking     || null,
      submittedAt:       h.submitted_at      || null,
    };
  });

  return data;
}

// ─── LOADING OVERLAY ──────────────────────────────────────────
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
  const user = await _getUser();

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
  if (typeof renderStatus          === "function") renderStatus();
  if (typeof renderSubjects        === "function") renderSubjects();
  if (typeof renderSavedPlan       === "function") renderSavedPlan();
  if (typeof populateAllEveningSelectors === "function") populateAllEveningSelectors();
  if (typeof renderHeatmap         === "function") renderHeatmap();
  if (typeof renderQbank           === "function") renderQbank();
  if (typeof renderAnalytics       === "function") renderAnalytics();
  if (typeof renderEditor          === "function") renderEditor();
  if (typeof renderProfile         === "function") renderProfile();
}

// ─── REALTIME ─────────────────────────────────────────────────
// Listen on chapters table for the most granular real-time changes
let realtimeChannel = null;

async function setupRealtime() {
  const user = await _getUser();
  if (!user) return;
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

  realtimeChannel = supabaseClient
    .channel("normalized-data-listener")
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "user_meta",
        filter: `user_id=eq.${user.id}`
      },
      async () => {
        // Reload from cloud on any user_meta change (settings, plan, etc.)
        await loadFromCloud();
        renderAll();
      }
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "chapters",
        filter: `user_id=eq.${user.id}`
      },
      async () => {
        // Reload when any chapter changes (covers multi-device study)
        await loadFromCloud();
        renderAll();
      }
    )
    .subscribe();
}

document.addEventListener("DOMContentLoaded", checkUser);
