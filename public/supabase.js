const SUPABASE_URL     = "https://alrkpctsjmvspybrgdfy.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFscmtwY3Rzam12c3B5YnJnZGZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1MjAxODcsImV4cCI6MjA4NzA5NjE4N30.TLSmuCaKCnZ99QUcwL9w7yUGJHrMMj-BWXnqNG7OTwU";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── ID Cache helpers ──────────────────────────────────────────────────────
// Stored separately from studyData so the main blob stays clean.
// Shape: { subjects: { "Name": "uuid" }, units: { "Sub::Unit": "uuid" }, chapters: { "Sub::Unit::Ch": "uuid" } }

function _getIdCache() {
  try { return JSON.parse(localStorage.getItem("_sbIds") || "{}"); }
  catch { return {}; }
}
function _setIdCache(cache) {
  localStorage.setItem("_sbIds", JSON.stringify(cache));
}

// ─── Debounced cloud save ──────────────────────────────────────────────────
// saveData() is called on every button click; debounce prevents DB flooding.
let _cloudSaveTimer = null;

async function saveToCloud() {
  if (_cloudSaveTimer) clearTimeout(_cloudSaveTimer);
  _cloudSaveTimer = setTimeout(async () => {
    _cloudSaveTimer = null;
    await _doSaveToCloud();
  }, 1500);
}

// ─── SAVE — decomposes studyData into 6 tables ─────────────────────────────
async function _doSaveToCloud() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  const uid = user.id;

  try {
    const subjectEntries = Object.entries(studyData.subjects || {});
    const cache = _getIdCache();
    if (!cache.subjects) cache.subjects = {};
    if (!cache.units)    cache.units    = {};
    if (!cache.chapters) cache.chapters = {};

    // ── 1. Delete stale subjects (CASCADE removes their units + chapters) ──
    const currentSubjectNames = new Set(subjectEntries.map(([n]) => n));
    const staleSubjectIds = Object.entries(cache.subjects)
      .filter(([name]) => !currentSubjectNames.has(name))
      .map(([, id]) => id);
    if (staleSubjectIds.length > 0) {
      await supabaseClient.from("subjects").delete().in("id", staleSubjectIds);
      Object.keys(cache.subjects).forEach(k => {
        if (staleSubjectIds.includes(cache.subjects[k])) delete cache.subjects[k];
      });
    }

    // ── 2. Delete stale units (CASCADE removes their chapters) ────────────
    const currentUnitKeys = new Set();
    subjectEntries.forEach(([subName, s]) => {
      (s.units || []).forEach(u => currentUnitKeys.add(`${subName}::${u.name}`));
    });
    const staleUnitIds = Object.entries(cache.units)
      .filter(([key]) => !currentUnitKeys.has(key))
      .map(([, id]) => id);
    if (staleUnitIds.length > 0) {
      await supabaseClient.from("units").delete().in("id", staleUnitIds);
      Object.keys(cache.units).forEach(k => {
        if (staleUnitIds.includes(cache.units[k])) delete cache.units[k];
      });
    }

    // ── 3. Delete stale chapters ──────────────────────────────────────────
    const currentChapterKeys = new Set();
    subjectEntries.forEach(([subName, s]) => {
      (s.units || []).forEach(u => {
        (u.chapters || []).forEach(ch => currentChapterKeys.add(`${subName}::${u.name}::${ch.name}`));
      });
    });
    const staleChapterIds = Object.entries(cache.chapters)
      .filter(([key]) => !currentChapterKeys.has(key))
      .map(([, id]) => id);
    if (staleChapterIds.length > 0) {
      await supabaseClient.from("chapters").delete().in("id", staleChapterIds);
      Object.keys(cache.chapters).forEach(k => {
        if (staleChapterIds.includes(cache.chapters[k])) delete cache.chapters[k];
      });
    }

    // ── 4. Upsert subjects ────────────────────────────────────────────────
    const subjectRows = subjectEntries.map(([name, s], idx) => ({
      user_id:    uid,
      name,
      size:       s.size || "medium",
      sort_order: idx,
    }));

    const { data: subjectData, error: sErr } = await supabaseClient
      .from("subjects")
      .upsert(subjectRows, { onConflict: "user_id,name" })
      .select("id, name");
    if (sErr) console.error("Subjects upsert:", sErr);

    const subjectIdMap = { ...cache.subjects };
    (subjectData || []).forEach(row => { subjectIdMap[row.name] = row.id; });
    cache.subjects = subjectIdMap;

    // Reverse map: subject_id → subject_name
    const subIdToName = {};
    Object.entries(subjectIdMap).forEach(([name, id]) => { subIdToName[id] = name; });

    // ── 5. Upsert units ───────────────────────────────────────────────────
    const unitRows = [];
    subjectEntries.forEach(([subName, subject]) => {
      const subjectId = subjectIdMap[subName];
      if (!subjectId) return;
      (subject.units || []).forEach((unit, ui) => {
        unitRows.push({
          user_id:        uid,
          subject_id:     subjectId,
          subject_name:   subName,
          name:           unit.name,
          sort_order:     ui,
          question_count: unit.questionCount       || 0,
          qbank_total:    unit.qbankStats?.total   || 0,
          qbank_correct:  unit.qbankStats?.correct || 0,
          qbank_done:     unit.qbankDone            || false,
          qbank_locked:   unit.qbankLocked          || false,
          collapsed:      unit.collapsed            || false,
        });
      });
    });

    const { data: unitData, error: uErr } = await supabaseClient
      .from("units")
      .upsert(unitRows, { onConflict: "subject_id,name" })
      .select("id, subject_id, name");
    if (uErr) console.error("Units upsert:", uErr);

    const unitIdMap = { ...cache.units };
    (unitData || []).forEach(row => {
      const subName = subIdToName[row.subject_id];
      if (subName) unitIdMap[`${subName}::${row.name}`] = row.id;
    });
    cache.units = unitIdMap;

    // Reverse map: unit_id → composite key "SubjectName::UnitName"
    const unitIdToKey = {};
    Object.entries(unitIdMap).forEach(([key, id]) => { unitIdToKey[id] = key; });

    // ── 6. Upsert chapters (batched 300 at a time) ────────────────────────
    const chapterRows = [];
    subjectEntries.forEach(([subName, subject]) => {
      (subject.units || []).forEach((unit) => {
        const unitId = unitIdMap[`${subName}::${unit.name}`];
        if (!unitId) return;
        (unit.chapters || []).forEach((ch, ci) => {
          chapterRows.push({
            user_id:           uid,
            unit_id:           unitId,
            subject_name:      subName,
            unit_name:         unit.name,
            name:              ch.name,
            sort_order:        ci,
            status:            ch.status           || "not-started",
            difficulty:        ch.difficulty       || "medium",
            difficulty_factor: ch.difficultyFactor || 2.5,
            missed_revisions:  ch.missedRevisions  || 0,
            start_page:        ch.startPage        || 0,
            end_page:          ch.endPage          || 0,
            page_count:        ch.pageCount        || 0,
            completed_on:      ch.completedOn      || null,
            last_reviewed_on:  ch.lastReviewedOn   || null,
            next_revision:     ch.nextRevision     || null,
            revision_index:    ch.revisionIndex    || 0,
            revision_dates:    ch.revisionDates    || [],
          });
        });
      });
    });

    const newChapterCache = { ...cache.chapters };
    for (let i = 0; i < chapterRows.length; i += 300) {
      const { data: chData, error: cErr } = await supabaseClient
        .from("chapters")
        .upsert(chapterRows.slice(i, i + 300), { onConflict: "unit_id,name" })
        .select("id, unit_id, name");
      if (cErr) console.error("Chapters upsert:", cErr);
      (chData || []).forEach(row => {
        const unitKey = unitIdToKey[row.unit_id];
        if (unitKey) newChapterCache[`${unitKey}::${row.name}`] = row.id;
      });
    }
    cache.chapters = newChapterCache;

    // ── 7. Upsert user_meta + daily_history (parallel) ────────────────────
    const subjectPointers = {};
    subjectEntries.forEach(([name, s]) => {
      subjectPointers[name] = s.pointer || { unit: 0, chapter: 0 };
    });

    const histRows = Object.entries(studyData.dailyHistory || {}).map(([date, h]) => ({
      user_id:           uid,
      date,
      study:             h.study             || false,
      qbank:             h.qbank             || false,
      revision:          h.revision          || false,
      evening_submitted: h.eveningSubmitted  || false,
      study_subject:     h.studySubject || h.studyEntries?.[0]?.subject || null,
      study_entries:     h.studyEntries      || [],
      qbank_entries:     h.qbankEntries      || [],
      revised_items:     h.revisedItems      || [],
      time_tracking:     h.timeTracking      || null,
      submitted_at:      h.submittedAt       || null,
    }));

    const savePromises = [
      supabaseClient.from("user_meta").upsert({
        user_id:          uid,
        exam_date:        studyData.examDate      || "2026-12-01",
        start_date:       studyData.startDate     || today(),
        reading_speed:    studyData.readingSpeed  || 25,
        qbank_speed:      studyData.qbankSpeed    || 30,
        user_name:        studyData.userName      || null,
        setup_complete:   studyData.setupComplete || false,
        subject_pointers: subjectPointers,
        ui_state:         studyData.uiState       || {},
        daily_plan:       studyData.dailyPlan     || null,
        version:          studyData.version       || 6,
      }, { onConflict: "user_id" }),
    ];

    for (let i = 0; i < histRows.length; i += 500) {
      savePromises.push(
        supabaseClient.from("daily_history")
          .upsert(histRows.slice(i, i + 500), { onConflict: "user_id,date" })
      );
    }

    const results = await Promise.all(savePromises);
    results.forEach(r => { if (r.error) console.error("Save parallel error:", r.error); });

    // Persist updated ID cache for future saves
    _setIdCache(cache);

  } catch (err) {
    console.error("_doSaveToCloud error:", err);
  }
}

// ─── LOAD — reconstructs studyData from 6 tables ──────────────────────────
async function loadFromCloud() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  const uid = user.id;

  // Parallel fetch all 5 data tables
  const [metaRes, subjectsRes, unitsRes, chaptersRes, histRes] = await Promise.all([
    supabaseClient.from("user_meta").select("*").eq("user_id", uid).maybeSingle(),
    supabaseClient.from("subjects").select("*").eq("user_id", uid).order("sort_order"),
    supabaseClient.from("units").select("*").eq("user_id", uid).order("sort_order"),
    supabaseClient.from("chapters").select("*").eq("user_id", uid).order("sort_order"),
    supabaseClient.from("daily_history").select("*").eq("user_id", uid),
  ]);

  [metaRes, subjectsRes, unitsRes, chaptersRes, histRes].forEach(r => {
    if (r.error) console.error("loadFromCloud fetch error:", r.error);
  });

  const meta     = metaRes.data;
  const subjects = subjectsRes.data || [];
  const units    = unitsRes.data    || [];
  const chapters = chaptersRes.data || [];
  const history  = histRes.data     || [];

  // No cloud data at all → push local up
  if (!meta && subjects.length === 0) {
    await _doSaveToCloud();
    return;
  }

  // If local is newer than cloud, push it up
  const localData      = JSON.parse(localStorage.getItem("studyData") || "{}");
  const cloudUpdatedAt = meta?.updated_at;
  if (localData.updatedAt && cloudUpdatedAt &&
      new Date(localData.updatedAt) > new Date(cloudUpdatedAt)) {
    await _doSaveToCloud();
    return;
  }

  // ── Rebuild ID cache from fetched data ───────────────────────────────
  const newCache = { subjects: {}, units: {}, chapters: {} };

  // ── Reconstruct subjects ─────────────────────────────────────────────
  const subjectPointers = meta?.subject_pointers || {};
  const newSubjects = {};

  subjects.forEach(row => {
    newCache.subjects[row.name] = row.id;
    newSubjects[row.name] = {
      size:    row.size || "medium",
      pointer: subjectPointers[row.name] || { unit: 0, chapter: 0 },
      units:   [],
    };
  });

  // ── Reconstruct units ────────────────────────────────────────────────
  const subIdToName = {};
  subjects.forEach(row => { subIdToName[row.id] = row.name; });

  units.forEach(row => {
    const subName = row.subject_name || subIdToName[row.subject_id];
    newCache.units[`${subName}::${row.name}`] = row.id;
    const subject = newSubjects[subName];
    if (!subject) return;
    subject.units.push({
      _unitId:       row.id,   // temp — removed after chapter matching
      name:          row.name,
      questionCount: row.question_count  || 0,
      qbankStats:    { total: row.qbank_total || 0, correct: row.qbank_correct || 0 },
      qbankDone:     row.qbank_done      || false,
      qbankLocked:   row.qbank_locked    || false,
      collapsed:     row.collapsed       || false,
      chapters:      [],
    });
  });

  // ── Reconstruct chapters ──────────────────────────────────────────────
  chapters.forEach(row => {
    const subName  = row.subject_name;
    const unitName = row.unit_name;
    newCache.chapters[`${subName}::${unitName}::${row.name}`] = row.id;

    const subject = newSubjects[subName];
    if (!subject) return;
    const unit = subject.units.find(u => u.name === unitName);
    if (!unit) return;

    unit.chapters.push({
      name:             row.name,
      status:           row.status            || "not-started",
      difficulty:       row.difficulty        || "medium",
      difficultyFactor: row.difficulty_factor || 2.5,
      missedRevisions:  row.missed_revisions  || 0,
      startPage:        row.start_page        || 0,
      endPage:          row.end_page          || 0,
      pageCount:        row.page_count        || 0,
      completedOn:      row.completed_on      || null,
      lastReviewedOn:   row.last_reviewed_on  || null,
      nextRevision:     row.next_revision     || null,
      revisionIndex:    row.revision_index    || 0,
      revisionDates:    row.revision_dates    || [],
    });
  });

  // Remove temp _unitId helper field
  Object.values(newSubjects).forEach(s => {
    s.units.forEach(u => delete u._unitId);
  });

  // ── Reconstruct daily history ────────────────────────────────────────
  const newHistory = {};
  history.forEach(row => {
    newHistory[row.date] = {
      study:            row.study             || false,
      qbank:            row.qbank             || false,
      revision:         row.revision          || false,
      eveningSubmitted: row.evening_submitted || false,
      studySubject:     row.study_subject     || null,
      studyEntries:     row.study_entries     || [],
      qbankEntries:     row.qbank_entries     || [],
      revisedItems:     row.revised_items     || [],
      timeTracking:     row.time_tracking     || null,
      submittedAt:      row.submitted_at      || null,
    };
  });

  // ── Apply to studyData ───────────────────────────────────────────────
  if (Object.keys(newSubjects).length > 0) studyData.subjects     = newSubjects;
  if (Object.keys(newHistory).length  > 0) studyData.dailyHistory = newHistory;

  if (meta) {
    studyData.examDate      = meta.exam_date      || studyData.examDate;
    studyData.startDate     = meta.start_date     || studyData.startDate;
    studyData.readingSpeed  = meta.reading_speed  || studyData.readingSpeed;
    studyData.qbankSpeed    = meta.qbank_speed    || studyData.qbankSpeed;
    studyData.userName      = meta.user_name      || studyData.userName;
    studyData.setupComplete = typeof meta.setup_complete === "boolean"
      ? meta.setup_complete : studyData.setupComplete;
    studyData.uiState       = meta.ui_state       || studyData.uiState || {};
    studyData.dailyPlan     = meta.daily_plan      || studyData.dailyPlan || null;
    studyData.version       = meta.version         || DATA_VERSION;
  }

  studyData = migrateData(studyData);
  localStorage.setItem("studyData", JSON.stringify(studyData));

  // Persist rebuilt ID cache
  _setIdCache(newCache);
}

// ─── LOGIN / LOGOUT ────────────────────────────────────────────────────────
async function login() {
  const email = document.getElementById("emailInput")?.value;
  if (!email) { alert("Enter email"); return; }
  const { error } = await supabaseClient.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: "https://medical-dashboard-lac.vercel.app/index.html" },
  });
  if (error) alert("Login failed: " + error.message);
  else alert("Check your email for a magic link.");
}

async function logout() {
  await supabaseClient.auth.signOut();
  localStorage.removeItem("studyData");
  localStorage.removeItem("_sbIds");
  window.location.href = "login.html";
}

// ─── INIT ──────────────────────────────────────────────────────────────────
async function checkUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();

  const greetingEl = document.getElementById("userGreeting");
  const statusEl   = document.getElementById("authStatus");

  if (user) {
    if (greetingEl) {
      const name     = studyData.userName || user.email.split("@")[0];
      const hour     = new Date().getHours();
      const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
      greetingEl.textContent = `${greeting}, ${name} 👋`;
    }
    if (statusEl) statusEl.textContent = user.email;

    await loadFromCloud();
    await setupRealtime();
  } else {
    if (greetingEl) greetingEl.textContent = "Not logged in";
    if (statusEl)   statusEl.textContent   = "";
  }

  renderAll();
}

function renderAll() {
  if (typeof renderStatus               === "function") renderStatus();
  if (typeof renderSubjects             === "function") renderSubjects();
  if (typeof renderSavedPlan            === "function") renderSavedPlan();
  if (typeof populateAllEveningSelectors === "function") populateAllEveningSelectors();
  if (typeof renderHeatmap              === "function") renderHeatmap();
  if (typeof renderQbank                === "function") renderQbank();
  if (typeof renderAnalytics            === "function") renderAnalytics();
  if (typeof renderEditor               === "function") renderEditor();
  if (typeof renderProfile              === "function") renderProfile();
}

// ─── REALTIME ──────────────────────────────────────────────────────────────
// Listen to user_meta UPDATE — a save from another device triggers a full reload.
let realtimeChannel = null;

async function setupRealtime() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) return;
  if (realtimeChannel) supabaseClient.removeChannel(realtimeChannel);

  realtimeChannel = supabaseClient
    .channel("study-realtime")
    .on(
      "postgres_changes",
      {
        event:  "UPDATE",
        schema: "public",
        table:  "user_meta",
        filter: `user_id=eq.${user.id}`,
      },
      async (payload) => {
        const incoming = payload.new;
        if (!incoming) return;
        // Only reload if cloud is strictly newer than our in-memory data
        if (!studyData.updatedAt ||
            new Date(incoming.updated_at) > new Date(studyData.updatedAt)) {
          await loadFromCloud();
          renderAll();
        }
      }
    )
    .subscribe();
}

document.addEventListener("DOMContentLoaded", checkUser);
