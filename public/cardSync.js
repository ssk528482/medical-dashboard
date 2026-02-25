// cardSync.js — Supabase CRUD for flashcards + card_reviews
// Medical Study OS
// Depends on: supabase.js (exposes supabaseClient), utils.js (today())
// All functions are async and return { data, error } shaped objects
// so callers can handle failures gracefully without try/catch boilerplate.
// -----------------------------------------------------------------

// ── Internal helper ───────────────────────────────────────────────
// Returns the current user's id from the live Supabase session.
// Same auth pattern used by supabase.js throughout the app.
async function _userId() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user?.id || null;
  } catch (e) {
    return null;
  }
}

// ── SM-2 algorithm (card-level) ───────────────────────────────────
/**
 * Calculate the next SM-2 state for a card after a rating.
 * @param {{ ease_factor: number, interval_days: number }} card
 * @param {1|2|3|4} rating  1=Again 2=Hard 3=Good 4=Easy
 * @returns {{ ease_factor: number, interval_days: number, next_review_date: string }}
 */
function cardSM2(card, rating) {
  let ef       = card.ease_factor   ?? 2.5;
  let interval = card.interval_days ?? 0;

  if (rating === 1) {
    interval = 0;                                          // show again today
  } else if (rating === 2) {
    interval = Math.max(1, Math.floor(interval * 1.2));
    ef       = Math.max(1.3, ef - 0.15);
  } else if (rating === 3) {
    interval = interval < 1 ? 1 : Math.round(interval * ef);
  } else if (rating === 4) {
    interval = interval < 1 ? 4 : Math.round(interval * ef * 1.3);
    ef       = Math.min(3.0, ef + 0.1);
  }

  return {
    ease_factor:      parseFloat(ef.toFixed(4)),
    interval_days:    interval,
    next_review_date: addDays(today(), interval),          // addDays from utils.js
  };
}

// ── READ ──────────────────────────────────────────────────────────

/**
 * Fetch all cards due on or before `date` for the current user.
 * Excludes suspended cards.
 * Sorted: overdue first → due today. New cards (interval=0) come last.
 *
 * @param {string} [date]  ISO date string, defaults to today()
 * @returns {Promise<{ data: Array, error: any }>}
 */
async function fetchDueCards(date = today()) {
  const userId = await _userId();
  if (!userId) return { data: [], error: 'No user id' };

  const { data, error } = await supabaseClient
    .from('flashcards')
    .select('*')
    .eq('user_id', userId)
    .eq('is_suspended', false)
    .lte('next_review_date', date)
    .order('next_review_date', { ascending: true });

  return { data: data ?? [], error };
}

/**
 * Fetch cards with optional filters (for Browse tab).
 *
 * @param {{ subject?: string, unit?: string, chapter?: string,
 *           card_type?: string, suspended?: boolean,
 *           search?: string, limit?: number }} filters
 * @returns {Promise<{ data: Array, error: any }>}
 */
async function fetchCards(filters = {}) {
  const userId = await _userId();
  if (!userId) return { data: [], error: 'No user id' };

  let query = supabaseClient
    .from('flashcards')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (filters.subject)  query = query.eq('subject',   filters.subject);
  if (filters.unit)     query = query.eq('unit',       filters.unit);
  if (filters.chapter)  query = query.eq('chapter',    filters.chapter);
  if (filters.card_type) query = query.eq('card_type', filters.card_type);

  // suspended filter: undefined = active only, true = suspended only
  if (filters.suspended === true)       query = query.eq('is_suspended', true);
  else if (filters.suspended !== 'all') query = query.eq('is_suspended', false);

  // Full-text search on front + back text (simple ilike)
  if (filters.search && filters.search.trim()) {
    const q = `%${filters.search.trim()}%`;
    query = query.or(`front_text.ilike.${q},back_text.ilike.${q}`);
  }

  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  return { data: data ?? [], error };
}

/**
 * Get card count grouped by subject/unit/chapter (for editor badges).
 * Returns an object: { "Subject||Unit||Chapter": count }
 *
 * @returns {Promise<{ data: Object, error: any }>}
 */
async function getCardCounts() {
  const userId = await _userId();
  if (!userId) return { data: {}, error: 'No user id' };

  // Fetch minimal fields for counting
  const { data, error } = await supabaseClient
    .from('flashcards')
    .select('subject, unit, chapter, next_review_date, is_suspended')
    .eq('user_id', userId)
    .eq('is_suspended', false);

  if (error || !data) return { data: {}, error };

  const todayStr = today();
  const counts   = {};

  data.forEach(card => {
    const key = `${card.subject}||${card.unit}||${card.chapter}`;
    if (!counts[key]) counts[key] = { total: 0, due: 0 };
    counts[key].total++;
    if (card.next_review_date <= todayStr) counts[key].due++;
  });

  return { data: counts, error: null };
}

/**
 * Get total due card count across all subjects (for nav badge + home page).
 * @returns {Promise<number>}
 */
async function getDueCardCount() {
  const userId = await _userId();
  if (!userId) return 0;

  const { count, error } = await supabaseClient
    .from('flashcards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_suspended', false)
    .lte('next_review_date', today());

  return error ? 0 : (count ?? 0);
}

/**
 * Fetch the last N reviews for analytics / leech detection.
 * @param {{ days?: number, card_id?: string }} opts
 * @returns {Promise<{ data: Array, error: any }>}
 */
async function fetchReviews(opts = {}) {
  const userId = await _userId();
  if (!userId) return { data: [], error: 'No user id' };

  let query = supabaseClient
    .from('card_reviews')
    .select('*')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: false });

  if (opts.card_id) {
    query = query.eq('card_id', opts.card_id);
  }

  if (opts.days) {
    const since = addDays(today(), -opts.days);
    query = query.gte('reviewed_at', since + 'T00:00:00Z');
  }

  const { data, error } = await query;
  return { data: data ?? [], error };
}

/**
 * Get leech cards: cards the user has rated "Again" (rating=1) 3+ times.
 * @returns {Promise<{ data: Array, error: any }>}
 */
async function fetchLeechCards() {
  const userId = await _userId();
  if (!userId) return { data: [], error: 'No user id' };

  // Get all "Again" reviews grouped by card_id
  const { data: reviews, error } = await supabaseClient
    .from('card_reviews')
    .select('card_id')
    .eq('user_id', userId)
    .eq('rating', 1);

  if (error || !reviews) return { data: [], error };

  // Count per card
  const failCounts = {};
  reviews.forEach(r => { failCounts[r.card_id] = (failCounts[r.card_id] || 0) + 1; });

  const leechIds = Object.entries(failCounts)
    .filter(([, count]) => count >= 3)
    .map(([id]) => id);

  if (!leechIds.length) return { data: [], error: null };

  const { data: cards, error: cardErr } = await supabaseClient
    .from('flashcards')
    .select('*')
    .in('id', leechIds);

  return { data: cards ?? [], error: cardErr };
}

// ── WRITE ─────────────────────────────────────────────────────────

/**
 * Insert a new card or update an existing one.
 * Pass `id` in cardObj to update; omit for insert.
 *
 * @param {Object} cardObj
 * @returns {Promise<{ data: Object|null, error: any }>}
 */
async function saveCard(cardObj) {
  const userId = await _userId();
  if (!userId) return { data: null, error: 'No user id' };

  const payload = {
    user_id:         userId,
    subject:         cardObj.subject         || '',
    unit:            cardObj.unit            || '',
    chapter:         cardObj.chapter         || '',
    card_type:       cardObj.card_type       || 'basic',
    front_text:      cardObj.front_text      || null,
    back_text:       cardObj.back_text       || null,
    front_image_url: cardObj.front_image_url || null,
    back_image_url:  cardObj.back_image_url  || null,
    tags:            cardObj.tags            || [],
    is_suspended:    cardObj.is_suspended    ?? false,
    ease_factor:     cardObj.ease_factor     ?? 2.5,
    interval_days:   cardObj.interval_days   ?? 0,
    next_review_date: cardObj.next_review_date || today(),
  };

  if (cardObj.id) {
    // Update existing
    const { data, error } = await supabaseClient
      .from('flashcards')
      .update(payload)
      .eq('id', cardObj.id)
      .eq('user_id', userId)   // safety: can only update own cards
      .select()
      .single();
    return { data, error };
  } else {
    // Insert new
    const { data, error } = await supabaseClient
      .from('flashcards')
      .insert(payload)
      .select()
      .single();
    return { data, error };
  }
}

/**
 * Batch insert multiple cards (used by AI generator).
 * @param {Array<Object>} cards
 * @returns {Promise<{ data: Array|null, error: any }>}
 */
async function saveBatchCards(cards) {
  const userId = await _userId();
  if (!userId) return { data: null, error: 'No user id' };

  const payload = cards.map(c => ({
    user_id:          userId,
    subject:          c.subject          || '',
    unit:             c.unit             || '',
    chapter:          c.chapter          || '',
    card_type:        c.card_type        || 'basic',
    front_text:       c.front_text       || null,
    back_text:        c.back_text        || null,
    front_image_url:  c.front_image_url  || null,
    back_image_url:   c.back_image_url   || null,
    tags:             c.tags             || [],
    is_suspended:     false,
    ease_factor:      2.5,
    interval_days:    0,
    next_review_date: today(),
  }));

  const { data, error } = await supabaseClient
    .from('flashcards')
    .insert(payload)
    .select();

  return { data, error };
}

/**
 * Save a review event and update the card's SM-2 state atomically.
 *
 * @param {string}   cardId
 * @param {1|2|3|4} rating
 * @param {Object}   currentCard  - must have ease_factor, interval_days
 * @returns {Promise<{ data: Object|null, error: any }>}
 */
async function saveReview(cardId, rating, currentCard) {
  const userId = await _userId();
  if (!userId) return { data: null, error: 'No user id' };

  const next = cardSM2(currentCard, rating);

  // 1. Insert review log
  const { error: reviewErr } = await supabaseClient
    .from('card_reviews')
    .insert({
      card_id:         cardId,
      user_id:         userId,
      rating:          rating,
      interval_days:   next.interval_days,
      ease_factor:     next.ease_factor,
      next_review_date: next.next_review_date,
    });

  if (reviewErr) return { data: null, error: reviewErr };

  // 2. Update the card itself
  const { data, error: cardErr } = await supabaseClient
    .from('flashcards')
    .update({
      ease_factor:      next.ease_factor,
      interval_days:    next.interval_days,
      next_review_date: next.next_review_date,
    })
    .eq('id', cardId)
    .eq('user_id', userId)
    .select()
    .single();

  return { data, error: cardErr };
}

/**
 * Toggle a card's suspended state.
 * @param {string}  cardId
 * @param {boolean} suspend
 * @returns {Promise<{ data: Object|null, error: any }>}
 */
async function setSuspended(cardId, suspend) {
  const userId = await _userId();
  if (!userId) return { data: null, error: 'No user id' };

  const { data, error } = await supabaseClient
    .from('flashcards')
    .update({ is_suspended: suspend })
    .eq('id', cardId)
    .eq('user_id', userId)
    .select()
    .single();

  return { data, error };
}

/**
 * Delete a card (cascades to card_reviews via FK).
 * @param {string} cardId
 * @returns {Promise<{ error: any }>}
 */
async function deleteCard(cardId) {
  const userId = await _userId();
  if (!userId) return { error: 'No user id' };

  const { error } = await supabaseClient
    .from('flashcards')
    .delete()
    .eq('id', cardId)
    .eq('user_id', userId);

  return { error };
}

/**
 * Reset a leech card: delete all its reviews and reset SM-2 to defaults.
 * @param {string} cardId
 * @returns {Promise<{ error: any }>}
 */
async function resetLeechCard(cardId) {
  const userId = await _userId();
  if (!userId) return { error: 'No user id' };

  // Delete reviews (RLS ensures only own reviews)
  await supabaseClient
    .from('card_reviews')
    .delete()
    .eq('card_id', cardId)
    .eq('user_id', userId);

  // Reset SM-2
  const { error } = await supabaseClient
    .from('flashcards')
    .update({
      ease_factor:      2.5,
      interval_days:    0,
      next_review_date: today(),
      is_suspended:     false,
    })
    .eq('id', cardId)
    .eq('user_id', userId);

  return { error };
}

// ── Exports (globals, matching existing codebase pattern) ─────────
// Available everywhere after this script loads:
//   cardSM2(card, rating)
//   fetchDueCards(date?)
//   fetchCards(filters?)
//   getCardCounts()
//   getDueCardCount()
//   fetchReviews(opts?)
//   fetchLeechCards()
//   saveCard(cardObj)
//   saveBatchCards(cards)
//   saveReview(cardId, rating, currentCard)
//   setSuspended(cardId, suspend)
//   deleteCard(cardId)
//   resetLeechCard(cardId)
