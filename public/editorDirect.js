// editorDirect.js — Direct Supabase operations for editor (NO localStorage)
// This file provides functions that write DIRECTLY to Supabase without touching localStorage

// ═══════════════════════════════════════════════════════════════
// DIRECT SUPABASE OPERATIONS (No localStorage)
// ═══════════════════════════════════════════════════════════════

// ─── ADD SUBJECT ───────────────────────────────────────────────
async function addSubjectDirect(name, size = "medium") {
  const user = await _getUser();
  if (!user) {
    alert("Not logged in");
    return false;
  }

  try {
    const { data, error } = await supabaseClient
      .from("subjects")
      .insert({
        user_id: user.id,
        name: name,
        size: size,
        updated_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (error) throw error;

    console.log(`[Direct] Added subject "${name}"`);
    
    // Also update in-memory studyData for immediate UI update
    if (!studyData.subjects[name]) {
      studyData.subjects[name] = { size, units: [], pointer: { unit: 0, chapter: 0 } };
    }
    
    return true;
  } catch (err) {
    console.error("Error adding subject:", err);
    alert("Failed to add subject: " + err.message);
    return false;
  }
}

// ─── DELETE SUBJECT ────────────────────────────────────────────
async function deleteSubjectDirect(name) {
  if (!confirm(`Delete "${name}" and all its units/chapters?`)) return false;

  const user = await _getUser();
  if (!user) {
    alert("Not logged in");
    return false;
  }

  try {
    // Delete from Supabase (cascade will delete units and chapters)
    const { error } = await supabaseClient
      .from("subjects")
      .delete()
      .eq("user_id", user.id)
      .eq("name", name);

    if (error) throw error;

    console.log(`[Direct] Deleted subject "${name}"`);
    
    // Also update in-memory studyData
    delete studyData.subjects[name];
    
    return true;
  } catch (err) {
    console.error("Error deleting subject:", err);
    alert("Failed to delete subject: " + err.message);
    return false;
  }
}

// ─── ADD UNIT ──────────────────────────────────────────────────
async function addUnitDirect(subjectName, unitName, questionCount = 0) {
  const user = await _getUser();
  if (!user) {
    alert("Not logged in");
    return false;
  }

  try {
    // First get the subject_id
    const { data: subject, error: subjErr } = await supabaseClient
      .from("subjects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", subjectName)
      .single();

    if (subjErr) throw subjErr;

    // Get current max sort_order for this subject
    const { data: units } = await supabaseClient
      .from("units")
      .select("sort_order")
      .eq("subject_id", subject.id)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder = (units && units[0]) ? units[0].sort_order + 1 : 0;

    // Insert the unit
    const { error } = await supabaseClient
      .from("units")
      .insert({
        user_id: user.id,
        subject_id: subject.id,
        subject_name: subjectName,
        name: unitName,
        sort_order: nextSortOrder,
        question_count: questionCount,
        qbank_total: 0,
        qbank_correct: 0,
        qbank_done: false,
        collapsed: false,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    console.log(`[Direct] Added unit "${unitName}" to "${subjectName}"`);
    
    // Update in-memory studyData
    if (studyData.subjects[subjectName]) {
      studyData.subjects[subjectName].units.push(makeUnitObj(unitName, questionCount));
    }
    
    return true;
  } catch (err) {
    console.error("Error adding unit:", err);
    alert("Failed to add unit: " + err.message);
    return false;
  }
}

// ─── DELETE UNIT ───────────────────────────────────────────────
async function deleteUnitDirect(subjectName, unitIndex) {
  if (!confirm("Delete this unit and all its chapters?")) return false;

  const user = await _getUser();
  if (!user) {
    alert("Not logged in");
    return false;
  }

  try {
    const subject = studyData.subjects[subjectName];
    if (!subject || !subject.units[unitIndex]) {
      alert("Unit not found");
      return false;
    }

    const unitName = subject.units[unitIndex].name;

    // Get subject_id
    const { data: subjData, error: subjErr } = await supabaseClient
      .from("subjects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", subjectName)
      .single();

    if (subjErr) throw subjErr;

    // Delete unit from Supabase (cascade will delete chapters)
    const { error } = await supabaseClient
      .from("units")
      .delete()
      .eq("subject_id", subjData.id)
      .eq("name", unitName);

    if (error) throw error;

    console.log(`[Direct] Deleted unit "${unitName}" from "${subjectName}"`);
    
    // Update in-memory studyData
    studyData.subjects[subjectName].units.splice(unitIndex, 1);
    fixPointer(subjectName);
    
    return true;
  } catch (err) {
    console.error("Error deleting unit:", err);
    alert("Failed to delete unit: " + err.message);
    return false;
  }
}

// ─── ADD CHAPTER ───────────────────────────────────────────────
async function addChapterDirect(subjectName, unitIndex, chapterName, startPage = 0, endPage = 0) {
  const user = await _getUser();
  if (!user) {
    alert("Not logged in");
    return false;
  }

  try {
    const subject = studyData.subjects[subjectName];
    if (!subject || !subject.units[unitIndex]) {
      alert("Unit not found");
      return false;
    }

    const unitName = subject.units[unitIndex].name;

    // Get subject_id
    const { data: subjData, error: subjErr } = await supabaseClient
      .from("subjects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", subjectName)
      .single();

    if (subjErr) throw subjErr;

    // Get unit_id
    const { data: unitData, error: unitErr } = await supabaseClient
      .from("units")
      .select("id")
      .eq("subject_id", subjData.id)
      .eq("name", unitName)
      .single();

    if (unitErr) throw unitErr;

    // Get current max sort_order for this unit
    const { data: chapters } = await supabaseClient
      .from("chapters")
      .select("sort_order")
      .eq("unit_id", unitData.id)
      .order("sort_order", { ascending: false })
      .limit(1);

    const nextSortOrder = (chapters && chapters[0]) ? chapters[0].sort_order + 1 : 0;

    const sp = parseInt(startPage) || 0;
    const ep = parseInt(endPage) || 0;
    const pageCount = (sp > 0 && ep >= sp) ? (ep - sp + 1) : 0;

    // Insert chapter
    const { error } = await supabaseClient
      .from("chapters")
      .insert({
        user_id: user.id,
        unit_id: unitData.id,
        subject_name: subjectName,
        unit_name: unitName,
        name: chapterName,
        sort_order: nextSortOrder,
        status: "not-started",
        difficulty: "medium",
        difficulty_factor: 2.5,
        missed_revisions: 0,
        start_page: sp,
        end_page: ep,
        page_count: pageCount,
        completed_on: null,
        last_reviewed_on: null,
        next_revision: null,
        revision_index: 0,
        revision_dates: [],
        updated_at: new Date().toISOString()
      });

    if (error) throw error;

    console.log(`[Direct] Added chapter "${chapterName}" to "${unitName}"`);
    
    // Update in-memory studyData
    studyData.subjects[subjectName].units[unitIndex].chapters.push(
      makeChapterObj(chapterName, sp, ep)
    );
    
    return true;
  } catch (err) {
    console.error("Error adding chapter:", err);
    alert("Failed to add chapter: " + err.message);
    return false;
  }
}

// ─── DELETE CHAPTER ────────────────────────────────────────────
async function deleteChapterDirect(subjectName, unitIndex, chapterIndex) {
  const user = await _getUser();
  if (!user) {
    alert("Not logged in");
    return false;
  }

  try {
    const subject = studyData.subjects[subjectName];
    if (!subject || !subject.units[unitIndex] || !subject.units[unitIndex].chapters[chapterIndex]) {
      alert("Chapter not found");
      return false;
    }

    const unitName = subject.units[unitIndex].name;
    const chapterName = subject.units[unitIndex].chapters[chapterIndex].name;

    // Get unit_id
    const { data: subjData } = await supabaseClient
      .from("subjects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", subjectName)
      .single();

    const { data: unitData } = await supabaseClient
      .from("units")
      .select("id")
      .eq("subject_id", subjData.id)
      .eq("name", unitName)
      .single();

    // Delete chapter
    const { error } = await supabaseClient
      .from("chapters")
      .delete()
      .eq("unit_id", unitData.id)
      .eq("name", chapterName);

    if (error) throw error;

    console.log(`[Direct] Deleted chapter "${chapterName}"`);
    
    // Update in-memory studyData
    studyData.subjects[subjectName].units[unitIndex].chapters.splice(chapterIndex, 1);
    fixPointer(subjectName);
    
    return true;
  } catch (err) {
    console.error("Error deleting chapter:", err);
    alert("Failed to delete chapter: " + err.message);
    return false;
  }
}

// ─── UPDATE CHAPTER ────────────────────────────────────────────
async function updateChapterDirect(subjectName, unitIndex, chapterIndex, updates) {
  const user = await _getUser();
  if (!user) return false;

  try {
    const subject = studyData.subjects[subjectName];
    const unitName = subject.units[unitIndex].name;
    const chapterName = subject.units[unitIndex].chapters[chapterIndex].name;

    // Get IDs
    const { data: subjData } = await supabaseClient
      .from("subjects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", subjectName)
      .single();

    const { data: unitData } = await supabaseClient
      .from("units")
      .select("id")
      .eq("subject_id", subjData.id)
      .eq("name", unitName)
      .single();

    // Update chapter
    const { error } = await supabaseClient
      .from("chapters")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("unit_id", unitData.id)
      .eq("name", chapterName);

    if (error) throw error;

    // Update in-memory
    Object.assign(studyData.subjects[subjectName].units[unitIndex].chapters[chapterIndex], updates);
    
    return true;
  } catch (err) {
    console.error("Error updating chapter:", err);
    return false;
  }
}

// ─── UPDATE UNIT QUESTION COUNT ────────────────────────────────
async function updateUnitQuestionCountDirect(subjectName, unitIndex, questionCount) {
  const user = await _getUser();
  if (!user) {
    alert("Not logged in");
    return false;
  }

  try {
    const subject = studyData.subjects[subjectName];
    if (!subject || !subject.units[unitIndex]) {
      alert("Unit not found");
      return false;
    }

    const unitName = subject.units[unitIndex].name;

    // Get subject_id
    const { data: subjData, error: subjErr } = await supabaseClient
      .from("subjects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", subjectName)
      .single();

    if (subjErr) throw subjErr;

    // Update unit question count
    const { error } = await supabaseClient
      .from("units")
      .update({
        question_count: questionCount,
        updated_at: new Date().toISOString()
      })
      .eq("subject_id", subjData.id)
      .eq("name", unitName);

    if (error) throw error;

    console.log(`[Direct] Updated question count for "${unitName}" to ${questionCount}`);
    
    // Update in-memory studyData
    studyData.subjects[subjectName].units[unitIndex].questionCount = questionCount;
    
    return true;
  } catch (err) {
    console.error("Error updating question count:", err);
    alert("Failed to update question count: " + err.message);
    return false;
  }
}

// ─── UPDATE UNIT QBANK STATS ───────────────────────────────────
async function updateUnitQbankStatsDirect(subjectName, unitIndex, qbankStats, qbankDone = false, questionCount = null) {
  const user = await _getUser();
  if (!user) {
    alert("Not logged in");
    return false;
  }

  try {
    const subject = studyData.subjects[subjectName];
    if (!subject || !subject.units[unitIndex]) {
      alert("Unit not found");
      return false;
    }

    const unitName = subject.units[unitIndex].name;

    // Get subject_id
    const { data: subjData, error: subjErr } = await supabaseClient
      .from("subjects")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", subjectName)
      .single();

    if (subjErr) throw subjErr;

    // Prepare update data
    const updateData = {
      qbank_total: qbankStats.total,
      qbank_correct: qbankStats.correct,
      qbank_done: qbankDone,
      updated_at: new Date().toISOString()
    };

    // Add questionCount if provided
    if (questionCount !== null) {
      updateData.question_count = questionCount;
    }

    // Update unit qbank stats
    const { error } = await supabaseClient
      .from("units")
      .update(updateData)
      .eq("subject_id", subjData.id)
      .eq("name", unitName);

    if (error) throw error;

    console.log(`[Direct] Updated qbank stats for "${unitName}"`);
    
    // Update in-memory studyData
    studyData.subjects[subjectName].units[unitIndex].qbankStats = qbankStats;
    studyData.subjects[subjectName].units[unitIndex].qbankDone = qbankDone;
    if (questionCount !== null) {
      studyData.subjects[subjectName].units[unitIndex].questionCount = questionCount;
    }
    
    return true;
  } catch (err) {
    console.error("Error updating qbank stats:", err);
    alert("Failed to update qbank stats: " + err.message);
    return false;
  }
}

// ─── BULK IMPORT (OPTIMIZED) ───────────────────────────────────
async function bulkImportSubjectsDirect(bulkSubjects) {
  const user = await _getUser();
  if (!user) {
    alert("Not logged in");
    return false;
  }

  try {
    const uid = user.id;
    const now = new Date().toISOString();
    
    // Prepare all data in batches
    const subjectsToInsert = [];
    const unitsToInsert = [];
    const chaptersToInsert = [];
    
    for (const [subjectName, subjectData] of Object.entries(bulkSubjects)) {
      // Check if subject already exists
      const { data: existingSubject } = await supabaseClient
        .from("subjects")
        .select("id")
        .eq("user_id", uid)
        .eq("name", subjectName)
        .single();
      
      let subjectId;
      
      if (existingSubject) {
        // Subject exists, use existing ID
        subjectId = existingSubject.id;
      } else {
        // New subject, prepare for batch insert
        subjectsToInsert.push({
          user_id: uid,
          name: subjectName,
          size: subjectData.size,
          updated_at: now
        });
      }
    }
    
    // Insert all new subjects at once
    let insertedSubjects = [];
    if (subjectsToInsert.length > 0) {
      const { data, error } = await supabaseClient
        .from("subjects")
        .insert(subjectsToInsert)
        .select("id, name");
      
      if (error) throw error;
      insertedSubjects = data;
    }
    
    // Get all subject IDs (existing + newly inserted)
    const { data: allSubjects } = await supabaseClient
      .from("subjects")
      .select("id, name")
      .eq("user_id", uid)
      .in("name", Object.keys(bulkSubjects));
    
    const subjectIdMap = {};
    allSubjects.forEach(s => {
      subjectIdMap[s.name] = s.id;
    });
    
    // Prepare units for batch insert
    for (const [subjectName, subjectData] of Object.entries(bulkSubjects)) {
      const subjectId = subjectIdMap[subjectName];
      
      // Get current max sort_order for this subject
      const { data: existingUnits } = await supabaseClient
        .from("units")
        .select("sort_order")
        .eq("subject_id", subjectId)
        .order("sort_order", { ascending: false })
        .limit(1);
      
      let sortOrder = (existingUnits && existingUnits[0]) ? existingUnits[0].sort_order + 1 : 0;
      
      subjectData.units.forEach(unit => {
        unitsToInsert.push({
          user_id: uid,
          subject_id: subjectId,
          subject_name: subjectName,
          name: unit.name,
          sort_order: sortOrder++,
          question_count: unit.questionCount || 0,
          qbank_total: 0,
          qbank_correct: 0,
          qbank_done: false,
          collapsed: false,
          updated_at: now
        });
      });
    }
    
    // Insert all units at once
    const { data: insertedUnits, error: unitsError } = await supabaseClient
      .from("units")
      .insert(unitsToInsert)
      .select("id, subject_name, name");
    
    if (unitsError) throw unitsError;
    
    // Create unit ID map
    const unitIdMap = {};
    insertedUnits.forEach(u => {
      const key = `${u.subject_name}||${u.name}`;
      unitIdMap[key] = u.id;
    });
    
    // Prepare chapters for batch insert
    for (const [subjectName, subjectData] of Object.entries(bulkSubjects)) {
      subjectData.units.forEach(unit => {
        const unitKey = `${subjectName}||${unit.name}`;
        const unitId = unitIdMap[unitKey];
        
        let chapterSortOrder = 0;
        unit.chapters.forEach(chapter => {
          const sp = parseInt(chapter.startPage) || 0;
          const ep = parseInt(chapter.endPage) || 0;
          const pageCount = (sp > 0 && ep >= sp) ? (ep - sp + 1) : 0;
          
          chaptersToInsert.push({
            user_id: uid,
            unit_id: unitId,
            subject_name: subjectName,
            unit_name: unit.name,
            name: chapter.name,
            sort_order: chapterSortOrder++,
            status: "not-started",
            difficulty: "medium",
            difficulty_factor: 2.5,
            missed_revisions: 0,
            start_page: sp,
            end_page: ep,
            page_count: pageCount,
            completed_on: null,
            last_reviewed_on: null,
            next_revision: null,
            revision_index: 0,
            revision_dates: [],
            updated_at: now
          });
        });
      });
    }
    
    // Insert all chapters at once
    if (chaptersToInsert.length > 0) {
      const { error: chaptersError } = await supabaseClient
        .from("chapters")
        .insert(chaptersToInsert);
      
      if (chaptersError) throw chaptersError;
    }
    
    console.log(`[Bulk Import] Inserted ${subjectsToInsert.length} subjects, ${unitsToInsert.length} units, ${chaptersToInsert.length} chapters`);
    return true;
    
  } catch (err) {
    console.error("Bulk import error:", err);
    throw err;
  }
}

// ─── LOAD DIRECTLY FROM SUPABASE ──────────────────────────────
async function loadEditorDataDirect() {
  const user = await _getUser();
  if (!user) return;

  _showLoadingOverlay(true);

  try {
    const uid = user.id;
    const [subjects, units, chapters] = await Promise.all([
      supabaseClient.from("subjects").select("*").eq("user_id", uid),
      supabaseClient.from("units").select("*").eq("user_id", uid).order("sort_order"),
      supabaseClient.from("chapters").select("*").eq("user_id", uid).order("sort_order"),
    ]);

    // Check for errors
    if (subjects.error) throw subjects.error;
    if (units.error) throw units.error;
    if (chapters.error) throw chapters.error;

    // Rebuild studyData.subjects from scratch
    studyData.subjects = {};

    // Group units by subject
    const unitsBySubject = {};
    (units.data || []).forEach(u => {
      if (!unitsBySubject[u.subject_name]) unitsBySubject[u.subject_name] = [];
      unitsBySubject[u.subject_name].push(u);
    });

    // Group chapters by unit
    const chaptersByUnit = {};
    (chapters.data || []).forEach(ch => {
      if (!chaptersByUnit[ch.unit_id]) chaptersByUnit[ch.unit_id] = [];
      chaptersByUnit[ch.unit_id].push(ch);
    });

    // Build subjects
    (subjects.data || []).forEach(s => {
      const subjectUnits = unitsBySubject[s.name] || [];
      
      studyData.subjects[s.name] = {
        size: s.size,
        pointer: studyData.subjects[s.name]?.pointer || { unit: 0, chapter: 0 },
        units: subjectUnits.map(u => ({
          name: u.name,
          collapsed: u.collapsed,
          qbankStats: { total: u.qbank_total, correct: u.qbank_correct },
          qbankDone: u.qbank_done,
          questionCount: u.question_count,
          chapters: (chaptersByUnit[u.id] || []).map(ch => ({
            name: ch.name,
            status: ch.status,
            completedOn: ch.completed_on,
            revisionDates: ch.revision_dates || [],
            revisionIndex: ch.revision_index,
            nextRevision: ch.next_revision,
            difficultyFactor: ch.difficulty_factor,
            difficulty: ch.difficulty,
            missedRevisions: ch.missed_revisions,
            lastReviewedOn: ch.last_reviewed_on,
            startPage: ch.start_page,
            endPage: ch.end_page,
            pageCount: ch.page_count
          }))
        }))
      };
    });

    console.log("[Direct Load] Loaded editor data from Supabase");
    
    // Save to localStorage so other pages (like create.html) can access it
    localStorage.setItem("studyData", JSON.stringify(studyData));
    
  } catch (err) {
    console.error("Error loading editor data:", err);
    alert("Failed to load data: " + err.message);
  } finally {
    _showLoadingOverlay(false);
  }
}
