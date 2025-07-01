import { getCurrentUser, db } from './auth.js';

// Cache decisions in-memory to avoid repeated Firestore reads
let decisionsCache = null;

export function generateId() {
  return '_' + Math.random().toString(36).substr(2, 9);
}

export async function loadDecisions(forceRefresh = false) {
  if (decisionsCache && !forceRefresh) {
    return decisionsCache;
  }

  const currentUser = getCurrentUser();
  if (!currentUser) {
    console.warn('🚫 No current user — skipping loadDecisions');
    return [];
  }
  const snap = await db.collection('decisions').doc(currentUser.uid).get();
  const data = snap.data();
  decisionsCache = data && Array.isArray(data.items) ? data.items : [];
  return decisionsCache;
}

export async function saveDecisions(items) {
  const currentUser = getCurrentUser();
  if (!currentUser || !Array.isArray(items)) return;
  // ensure at least one valid decision exists
  if (!items.some(i => i.id && i.text)) {
    console.warn('⚠️ Refusing to save empty or invalid decisions');
    return;
  }

  // merge in the items array without overwriting other fields
  await db
    .collection('decisions')
    .doc(currentUser.uid)
    .set({ items }, { merge: true });

  // Update in-memory cache after successful save
  decisionsCache = items;
}

export async function saveGoalOrder(order) {
  const currentUser = getCurrentUser();
  if (!currentUser || !Array.isArray(order) || order.length === 0) {
    console.warn('⚠️ Refusing to save empty goalOrder');
    return;
  }

  await db
    .collection('decisions')
    .doc(currentUser.uid)
    .update({ goalOrder: order });
}

export function parseNaturalDate(input) {
  const today = new Date();
  const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const norm = input.trim().toLowerCase();
  if (norm === 'today') {
    return today.toISOString().split('T')[0];
  }
  const dow = weekdays.find(d => norm.startsWith(d));
  if (dow) {
    const target = weekdays.indexOf(dow);
    let delta = target - today.getDay();
    if (delta <= 0) delta += 7;
    const next = new Date(today);
    next.setDate(today.getDate() + delta);
    return next.toISOString().split('T')[0];
  }
  return null;
}

export function formatDaysUntil(dateStr) {
  if (!dateStr) return '';
  const now = new Date();
  const target = new Date(dateStr);
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const diffDays = Math.round((target - now) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'today';
  if (diffDays > 0) return `in ${diffDays} day${diffDays === 1 ? '' : 's'}`;
  return `overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'}`;
}

/* lists support */
const LISTS_KEY = 'myLists';

export async function loadLists() {
  const user = getCurrentUser?.();
  if (!user) {
    return JSON.parse(localStorage.getItem(LISTS_KEY) || '[]'); // anonymous → localStorage
  }

  const doc = await db.collection('lists').doc(user.uid).get();
  if (doc.exists && Array.isArray(doc.data().lists)) {
    return doc.data().lists;                                   // Firestore copy exists
  }

  // first-time sign-in: migrate legacy localStorage
  const legacy = JSON.parse(localStorage.getItem(LISTS_KEY) || '[]');
  if (legacy.length) {
    await db.collection('lists').doc(user.uid).set({ lists: legacy });
    localStorage.removeItem(LISTS_KEY);
    return legacy;
  }
  return [];
}

/* overwrite the old saveLists with this safer version */
export async function saveLists(lists) {
  // strip out any undefined values that Firestore rejects
  const sanitized = JSON.parse(JSON.stringify(lists ?? []));  // undefined → []

  const user = getCurrentUser?.();
  if (!user) {
    localStorage.setItem(LISTS_KEY, JSON.stringify(sanitized));
    return;
  }
  await db.collection('lists')
          .doc(user.uid)
          .set({ lists: sanitized }, { merge: true });
}

// ── helper: debounce async functions ────────────────────────────────
export function debounceAsync(fn, delay) {
  let timer;
  let latestArgs;
  let waiters = [];
  return (...args) => {
    latestArgs = args;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const result = await fn(...latestArgs);
        waiters.forEach(({ resolve }) => resolve(result));
      } catch (err) {
        waiters.forEach(({ reject }) => reject(err));
      } finally {
        waiters = [];
      }
    }, delay);
    return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
  };
}

// Expose a debounced saveDecisions to batch rapid updates
export const queueSaveDecisions = debounceAsync(saveDecisions, 250);



