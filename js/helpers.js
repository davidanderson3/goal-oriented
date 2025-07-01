import { getCurrentUser, db } from './auth.js';

// Demo data for visitors who aren't signed in
// Includes goals, tasks, daily items, completed examples, and scheduled items
const SAMPLE_DECISIONS = [
  {
    id: 'demo-goal',
    type: 'goal',
    text: 'Welcome to Goal Oriented',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: null,
  },
  {
    id: 'demo-task-1',
    type: 'task',
    text: 'Explore the demo tasks',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: 'demo-goal',
  },
  {
    id: 'demo-task-2',
    type: 'task',
    text: 'Sign up to save your own goals',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: 'demo-goal',
  },
  {
    id: 'demo-task-3',
    type: 'task',
    text: 'Try editing and reordering tasks',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: 'demo-goal',
  },
  {
    id: 'demo-goal-2',
    type: 'goal',
    text: 'Grow your side project',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: null,
  },
  {
    id: 'demo-task-2a',
    type: 'task',
    text: 'Outline your MVP features',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: 'demo-goal-2',
  },
  {
    id: 'demo-task-2b',
    type: 'task',
    text: 'Launch a landing page',
    completed: true,
    resolution: '',
    dateCompleted: '2025-06-20',
    parentGoalId: 'demo-goal-2',
  },
  {
    id: 'demo-task-2c',
    type: 'task',
    text: 'Get your first users',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: 'demo-goal-2',
  },
  {
    id: 'demo-goal-3',
    type: 'goal',
    text: 'Completed sample goal',
    completed: true,
    resolution: '',
    dateCompleted: '2025-06-15',
    parentGoalId: null,
  },
  {
    id: 'demo-task-3a',
    type: 'task',
    text: 'This is done!',
    completed: true,
    resolution: '',
    dateCompleted: '2025-06-14',
    parentGoalId: 'demo-goal-3',
  },
  {
    id: 'demo-task-3b',
    type: 'task',
    text: 'So is this',
    completed: true,
    resolution: '',
    dateCompleted: '2025-06-15',
    parentGoalId: 'demo-goal-3',
  },
  {
    id: 'demo-goal-4',
    type: 'goal',
    text: 'Future conference talk',
    completed: false,
    resolution: '',
    dateCompleted: '',
    scheduled: '2025-07-10',
    parentGoalId: null,
  },
  {
    id: 'demo-task-4a',
    type: 'task',
    text: 'Write an outline',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: 'demo-goal-4',
  },
  {
    id: 'demo-task-4b',
    type: 'task',
    text: 'Create slides',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: 'demo-goal-4',
  },
  {
    id: 'daily-task-1',
    type: 'task',
    text: 'Review tasks each morning',
    completed: false,
    resolution: '',
    dateCompleted: '',
    recurs: 'daily',
    parentGoalId: null,
  },
  {
    id: 'daily-task-2',
    type: 'task',
    text: 'Plan your week on Monday',
    completed: false,
    resolution: '',
    dateCompleted: '',
    recurs: 'weekly',
    parentGoalId: null,
  },
  {
    id: 'daily-task-3',
    type: 'task',
    text: 'Share progress on Friday',
    completed: false,
    resolution: '',
    dateCompleted: '',
    recurs: 'weekly',
    parentGoalId: null,
  }
];

const SAMPLE_LISTS = [
  {
    name: 'Books to Read',
    columns: [
      { name: 'Title', type: 'link' },
      { name: 'Author', type: 'text' }
    ],
    items: [
      { Title: 'https://example.com/book1', Title_label: 'Deep Work', Author: 'Cal Newport' },
      { Title: 'https://example.com/book2', Title_label: 'Atomic Habits', Author: 'James Clear' }
    ]
  },
  {
    name: 'Groceries',
    columns: [
      { name: 'Item', type: 'text' },
      { name: 'Qty', type: 'number' }
    ],
    items: [
      { Item: 'Apples', Qty: '3' },
      { Item: 'Milk', Qty: '1' },
      { Item: 'Eggs', Qty: '12' }
    ]
  }
];

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
    console.warn('🚫 No current user — returning sample data');
    decisionsCache = SAMPLE_DECISIONS;
    return decisionsCache;
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
    const stored = JSON.parse(localStorage.getItem(LISTS_KEY) || 'null');
    if (Array.isArray(stored) && stored.length) {
      return stored; // anonymous → localStorage
    }
    return SAMPLE_LISTS.slice();
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

// Reusable icon-style button factory
export function makeIconBtn(symbol, title, fn) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = symbol;
  b.title = title;
  Object.assign(b.style, {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '1.1em',
    padding: '0'
  });
  b.addEventListener('mousedown', e => e.stopPropagation());
  b.addEventListener('click', e => e.stopPropagation());
  b.onclick = fn;
  return b;
}



