// noteSync.js — Supabase CRUD for the notes table
// Medical Study OS
// Depends on: supabase.js (exposes supabaseClient), utils.js (today())
// All functions return { data, error } shaped results.
// -----------------------------------------------------------------

// ── Internal helper ───────────────────────────────────────────────
async function _noteUserId() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user?.id || null;
  } catch (e) {
    return null;
  }
}

// ── READ ──────────────────────────────────────────────────────────

/**
 * Fetch a single note for a specific chapter.
 * Returns the most recently updated note if multiple exist (shouldn't happen
 * under the one-note-per-chapter model, but defensive).
 *
 * @param {string} subject
 * @param {string} unit
 * @param {string} chapter
 * @returns {Promise<{ data: Object|null, error: any }>}
 */
async function fetchNote(subject, unit, chapter, noteType) {
  const userId = await _noteUserId();
  if (!userId) return { data: null, error: 'No user id' };

  let q = supabaseClient
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .eq('subject', subject)
    .eq('unit',    unit)
    .eq('chapter', chapter);

  if (noteType) q = q.eq('note_type', noteType);

  const { data, error } = await q
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data, error };
}

/**
 * Fetch all notes for a chapter (all note types).
 * Used by the note-types picker view.
 *
 * @param {string} subject
 * @param {string} unit
 * @param {string} chapter
 * @returns {Promise<{ data: Array, error: any }>}
 */
async function fetchChapterNotes(subject, unit, chapter) {
  const userId = await _noteUserId();
  if (!userId) return { data: [], error: 'No user id' };

  const { data, error } = await supabaseClient
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .eq('subject', subject)
    .eq('unit',    unit)
    .eq('chapter', chapter)
    .order('note_type', { ascending: true });

  return { data: data ?? [], error };
}

/**
 * Fetch all notes for a unit (all chapters in that unit).
 * Ordered by chapter name alphabetically.
 *
 * @param {string} subject
 * @param {string} unit
 * @returns {Promise<{ data: Array, error: any }>}
 */
async function fetchUnitNotes(subject, unit) {
  const userId = await _noteUserId();
  if (!userId) return { data: [], error: 'No user id' };

  const { data, error } = await supabaseClient
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .eq('subject', subject)
    .eq('unit',    unit)
    .order('chapter', { ascending: true });

  return { data: data ?? [], error };
}

/**
 * Fetch all notes for a subject (all units + chapters).
 * Ordered by unit then chapter.
 *
 * @param {string} subject
 * @returns {Promise<{ data: Array, error: any }>}
 */
async function fetchSubjectNotes(subject) {
  const userId = await _noteUserId();
  if (!userId) return { data: [], error: 'No user id' };

  const { data, error } = await supabaseClient
    .from('notes')
    .select('*')
    .eq('user_id', userId)
    .eq('subject', subject)
    .order('unit',    { ascending: true })
    .order('chapter', { ascending: true });

  return { data: data ?? [], error };
}

/**
 * Fetch all notes for the current user (used for sidebar tree + coverage stats).
 * Returns lightweight records (no content) for fast loading.
 *
 * @returns {Promise<{ data: Array, error: any }>}
 */
async function fetchAllNotesMeta() {
  const userId = await _noteUserId();
  if (!userId) return { data: [], error: 'No user id' };

  const { data, error } = await supabaseClient
    .from('notes')
    .select('id, subject, unit, chapter, note_type, title, color, tags, updated_at')
    .eq('user_id', userId)
    .order('subject',   { ascending: true })
    .order('unit',      { ascending: true })
    .order('chapter',   { ascending: true })
    .order('note_type', { ascending: true })
    .order('updated_at', { ascending: false }); // newest first for dedup

  if (error || !data) return { data: [], error };

  // Deduplicate: keep only the most recently updated note per subject+unit+chapter+note_type
  const seen = new Set();
  const unique = data.filter(n => {
    const key = `${n.subject}||${n.unit}||${n.chapter}||${n.note_type || 'general'}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { data: unique, error };
}

/**
 * Full-text search across all notes (title + content).
 * Uses Postgres tsvector index (defined in SQL schema).
 *
 * @param {string} query
 * @returns {Promise<{ data: Array, error: any }>}
 */
async function searchNotes(query) {
  const userId = await _noteUserId();
  if (!userId) return { data: [], error: 'No user id' };

  const q = query.trim();
  if (!q) return fetchAllNotesMeta();

  // Supabase textSearch uses the GIN index we created on tsvector
  const { data, error } = await supabaseClient
    .from('notes')
    .select('id, subject, unit, chapter, title, color, tags, updated_at, content')
    .eq('user_id', userId)
    .textSearch('content', q, { type: 'websearch', config: 'english' });

  // Also do a simple ilike on title for partial matches
  const { data: titleData } = await supabaseClient
    .from('notes')
    .select('id, subject, unit, chapter, title, color, tags, updated_at, content')
    .eq('user_id', userId)
    .ilike('title', `%${q}%`);

  // Merge and deduplicate by subject+unit+chapter (keep latest updated)
  const merged = [...(data ?? []), ...(titleData ?? [])];
  const seen   = new Map();
  merged.forEach(n => {
    const key = `${n.subject}||${n.unit}||${n.chapter}`;
    if (!seen.has(key) || new Date(n.updated_at) > new Date(seen.get(key).updated_at)) {
      seen.set(key, n);
    }
  });
  const unique = Array.from(seen.values());

  return { data: unique, error };
}

/**
 * Get a coverage map: { "Subject||Unit||Chapter": true } for notes that exist.
 * Used by editor.js to show filled/outline note icons.
 *
 * @returns {Promise<{ data: Object, error: any }>}
 */
async function getNotesCoverageMap() {
  const userId = await _noteUserId();
  if (!userId) return { data: {}, error: 'No user id' };

  const { data, error } = await supabaseClient
    .from('notes')
    .select('subject, unit, chapter')
    .eq('user_id', userId);

  if (error || !data) return { data: {}, error };

  const map = {};
  data.forEach(n => {
    map[`${n.subject}||${n.unit}||${n.chapter}`] = true;
  });

  return { data: map, error: null };
}

/**
 * Get notes coverage % per subject (for analytics page).
 * Returns: { "Pathology": { total: 12, withNote: 8, pct: 67 }, ... }
 * Cross-references against studyData subjects from localStorage.
 *
 * @returns {Promise<{ data: Object, error: any }>}
 */
async function getNotesCoverageStats() {
  const { data: coverageMap, error } = await getNotesCoverageMap();
  if (error) return { data: {}, error };

  const sd       = JSON.parse(localStorage.getItem('studyData') || '{}');
  const subjects = sd.subjects || {};
  const stats    = {};

  Object.entries(subjects).forEach(([subjectName, subjectData]) => {
    let total    = 0;
    let withNote = 0;

    (subjectData.units || []).forEach(unit => {
      (unit.chapters || []).forEach(chapter => {
        total++;
        const key = `${subjectName}||${unit.name}||${chapter.name}`;
        if (coverageMap[key]) withNote++;
      });
    });

    stats[subjectName] = {
      total,
      withNote,
      pct: total > 0 ? Math.round((withNote / total) * 100) : 0,
    };
  });

  return { data: stats, error: null };
}

// ── WRITE ─────────────────────────────────────────────────────────

/**
 * Insert a new note or update an existing one.
 * Pass `id` in noteObj to update; omit for insert.
 *
 * @param {Object} noteObj
 * @returns {Promise<{ data: Object|null, error: any }>}
 */
async function saveNote(noteObj) {
  const userId = await _noteUserId();
  if (!userId) return { data: null, error: 'No user id' };

  const payload = {
    user_id:   userId,
    subject:   noteObj.subject   || '',
    unit:      noteObj.unit      || '',
    chapter:   noteObj.chapter   || '',
    note_type: noteObj.note_type || 'general',
    title:     noteObj.title     || null,
    content:   noteObj.content   || null,
    images:    noteObj.images    || [],
    color:     noteObj.color     || 'default',
    tags:      noteObj.tags      || [],
  };

  if (noteObj.id) {
    // Update existing by id
    const { data, error } = await supabaseClient
      .from('notes')
      .update(payload)
      .eq('id', noteObj.id)
      .eq('user_id', userId)
      .select()
      .single();
    return { data, error };
  } else {
    // Try to find an existing note for this subject/unit/chapter first
    // to avoid duplicates (handles race conditions from auto-save)
    const { data: existing } = await supabaseClient
      .from('notes')
      .select('id')
      .eq('user_id',   userId)
      .eq('subject',   payload.subject)
      .eq('unit',      payload.unit)
      .eq('chapter',   payload.chapter)
      .eq('note_type', payload.note_type)
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      // Update the existing record instead of inserting
      const { data, error } = await supabaseClient
        .from('notes')
        .update(payload)
        .eq('id', existing.id)
        .eq('user_id', userId)
        .select()
        .single();
      return { data, error };
    } else {
      // Insert new
      const { data, error } = await supabaseClient
        .from('notes')
        .insert(payload)
        .select()
        .single();
      return { data, error };
    }
  }
}

/**
 * Delete a note by id.
 * @param {string} noteId
 * @returns {Promise<{ error: any }>}
 */
async function deleteNote(noteId) {
  const userId = await _noteUserId();
  if (!userId) return { error: 'No user id' };

  const { error } = await supabaseClient
    .from('notes')
    .delete()
    .eq('id', noteId)
    .eq('user_id', userId);

  return { error };
}

// ── Exports (globals, matching existing codebase pattern) ─────────
// Available everywhere after this script loads:
//   fetchNote(subject, unit, chapter, noteType?)
//   fetchChapterNotes(subject, unit, chapter)
//   fetchUnitNotes(subject, unit)
//   fetchSubjectNotes(subject)
//   fetchAllNotesMeta()
//   searchNotes(query)
//   getNotesCoverageMap()
//   getNotesCoverageStats()
//   saveNote(noteObj)
//   deleteNote(noteId)
