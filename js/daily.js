import { loadDecisions, saveDecisions, generateId, makeIconBtn } from './helpers.js';

// Shared skip intervals (same as goals)
const skipOptions = [
  { label: '1 hour', value: 1 },
  { label: '2 hours', value: 2 },
  { label: '4 hours', value: 4 },
  { label: '8 hours', value: 8 },
  { label: '1 day', value: 24 },
  { label: '2 days', value: 48 },
  { label: '3 days', value: 72 },
  { label: '4 days', value: 96 },
  { label: '1 week', value: 168 },
  { label: '2 weeks', value: 336 },
  { label: '1 month', value: 720 },
  { label: '2 months', value: 1440 },
  { label: '3 months', value: 2160 }
];

export async function renderDailyTasks(currentUser, db) {
  const panel = document.getElementById('dailyPanel');
  if (!panel || !currentUser) return;

  // — ensure our container exists
  let container = panel.querySelector('#dailyTasksList');
  if (!container) {
    container = document.createElement('div');
    container.id = 'dailyTasksList';
    container.className = 'decision-container';
    panel.appendChild(container);
  }
    // — ensure our weekly container exists
  let weeklyContainer = panel.querySelector('#weeklyTasksList');
  if (!weeklyContainer) {
    weeklyContainer = document.createElement('div');
    weeklyContainer.id = 'weeklyTasksList';
    weeklyContainer.className = 'decision-container';
    panel.appendChild(weeklyContainer);
  }


  // — Inject CSS once to remove green focus/active backgrounds on buttons
  if (!document.getElementById('dailyTasks-btn-reset-css')) {
    const style = document.createElement('style');
    style.id = 'dailyTasks-btn-reset-css';
    style.textContent = `
      .daily-task-wrapper button:focus,
      .daily-task-wrapper button:active {
        background: none !important;
        outline: none !important;
      }
      @keyframes flash {
        0%   { background-color: #ffff99; }
        100% { background-color: #eef; }
      }
      .flash {
        animation: flash 1s ease-out;
      }
    `;
    document.head.appendChild(style);
  }

  // — Clear and load all tasks
  container.innerHTML = '';
  const all = await loadDecisions();

  // — Migrate legacy “[Daily]” flags
  let migrated = false;
  for (const t of all) {
    if (t.type === 'task' && t.text.startsWith('[Daily]') && !t.recurs) {
      t.recurs = 'daily';
      migrated = true;
    }
  }
  if (migrated) {
    try { await saveDecisions(all); }
    catch (err) { console.error(err); alert('⚠️ Failed to migrate old tasks.'); }
  }

  // — Add‐new form
  const addForm = document.createElement('div');
  addForm.style = 'display:flex;gap:8px;margin-bottom:12px';
  const input = document.createElement('input');
  Object.assign(input, { type: 'text', placeholder: 'New daily task…' });
  Object.assign(input.style, { flex: '1', padding: '6px', borderRadius: '6px', border: '1px solid #ccc' });
  const addBtn = document.createElement('button');
  addBtn.textContent = '+';
  Object.assign(addBtn.style, { padding: '0 14px', borderRadius: '6px', fontWeight: 'bold', background: 'none', border: 'none' });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
  });
  addBtn.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;
    const newTask = {
      id: generateId(),
      type: 'task',
      text: `${text}`,
      recurs: 'daily',
      parentGoalId: null,
      completed: false,
      dateCompleted: '',
      resolution: '',
      dependencies: [],
      skipUntil: null
    };
    try {
      const updated = [...await loadDecisions(), newTask];
      await saveDecisions(updated);
      input.value = '';
      const wrapper = makeTaskElement(newTask);
      wrapper.classList.add('flash');
      wrapper.addEventListener('animationend', () => wrapper.classList.remove('flash'), { once: true });
      container.insertBefore(wrapper, addForm.nextSibling);
    } catch {
      alert('⚠️ Could not add task.');
    }
  };
  addForm.append(input, addBtn);
  container.appendChild(addForm);

  // — Load today’s completions
  // — Compute keys and completion sets
  const todayKey = new Date().toLocaleDateString('en-CA');
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const weekKey = monday.toISOString().split('T')[0];
  const snap = await db.collection('taskCompletions').doc(currentUser.uid).get();
  const completionMap = snap.exists ? snap.data() : {};
  const dailyDone = new Set(completionMap[todayKey] || []);
  const weeklyDone = new Set(completionMap[weekKey] || []);

  // — Add-new WEEKLY form
  (function () {
    const form = document.createElement('div');
    form.style = 'display:flex;gap:8px;margin-bottom:12px';

    const input = document.createElement('input');
    Object.assign(input, { type: 'text', placeholder: 'New weekly task…' });
    Object.assign(input.style, { flex: '1', padding: '6px', borderRadius: '6px', border: '1px solid #ccc' });

    const btn = document.createElement('button');
    btn.textContent = '+';
    Object.assign(btn.style, { padding: '0 14px', borderRadius: '6px', fontWeight: 'bold', background: 'none', border: 'none' });

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); btn.click(); }
    });

    btn.onclick = async () => {
      const text = input.value.trim();
      if (!text) return;
      const task = {
        id: generateId(),
        type: 'task',
        text: `${text}`,
        recurs: 'weekly',
        parentGoalId: null,
        completed: false,
        dateCompleted: '',
        resolution: '',
        dependencies: [],
        skipUntil: null
      };
      const updated = [...await loadDecisions(), task];
      await saveDecisions(updated);
      input.value = '';
      const wrap = makeTaskElement(task, weekKey, weeklyDone, completionMap, weeklyContainer);
      wrap.classList.add('flash');
      wrap.addEventListener('animationend', () => wrap.classList.remove('flash'), { once: true });
      weeklyContainer.appendChild(wrap);
    };

    form.append(input, btn);
    weeklyContainer.appendChild(form);
  })();

  const doneSet = new Set(completionMap[todayKey] || []);

  // — Prepare and split lists
  const nowMs = Date.now();
  const dailyAll = all.filter(t =>
    t.type === 'task' &&
    t.recurs === 'daily' &&
    (!t.skipUntil || nowMs >= new Date(t.skipUntil).getTime())
  );
  const activeList = dailyAll.filter(t => !doneSet.has(t.id));
  const doneList = dailyAll.filter(t => doneSet.has(t.id));

  // — Render active then done
  for (const t of activeList) container.appendChild(makeTaskElement(t));
  for (const t of doneList) container.appendChild(makeTaskElement(t));

  // ——— Helpers —————————————————————————

  async function onToggleTaskCompletion(task, cb, wrapper) {
    try {
      completionMap[todayKey] = completionMap[todayKey] || [];
      if (cb.checked) {
        completionMap[todayKey].push(task.id);
        doneSet.add(task.id);
      } else {
        completionMap[todayKey] = completionMap[todayKey].filter(id => id !== task.id);
        doneSet.delete(task.id);
      }
      await db.collection('taskCompletions').doc(currentUser.uid).set(completionMap);
      const rowEl = wrapper.querySelector('.daily-task');
      const labelEl = rowEl.children[1];
      rowEl.style.opacity = cb.checked ? '0.6' : '1';
      if (cb.checked) {
        labelEl.style.textDecoration = 'line-through';
        labelEl.style.color = '#777';
      } else {
        labelEl.style.textDecoration = '';
        labelEl.style.color = '';
      }
      if (cb.checked) {
        container.appendChild(wrapper);
      } else {
        const allWrappers = Array.from(container.querySelectorAll('.daily-task-wrapper'));
        const firstDone = allWrappers.find(el =>
          el.querySelector('input[type="checkbox"]').checked
        );
        container.insertBefore(wrapper, firstDone || addForm.nextSibling);
      }
    } catch (err) {
      console.error(err);
      alert('⚠️ Could not update completion. Reverting.');
      cb.checked = !cb.checked;
    }
  }

  function makeTaskElement(task) {
    const isDone = doneSet.has(task.id);
    const wrapper = document.createElement('div');
    wrapper.className = 'daily-task-wrapper';
    wrapper.draggable = true;
    wrapper.dataset.taskId = task.id;
    Object.assign(wrapper.style, {
      pointerEvents: 'auto',
      userSelect: 'none',
      touchAction: 'auto',
      minHeight: '40px',
      background: '#eef',
      position: 'relative',
      zIndex: '1'
    });

    const row = document.createElement('div');
    row.className = 'daily-task';
    Object.assign(row.style, {
      display: 'grid',
      gridTemplateColumns: '24px 1fr auto',
      alignItems: 'center',
      columnGap: '10px',
      padding: '6px 12px',
      borderRadius: '8px',
      background: '#fffaf0',
      borderLeft: '4px solid #ffbb55',
      marginBottom: '6px',
      opacity: isDone ? '0.6' : '1'
    });

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isDone;
    cb.addEventListener('change', () =>
      onToggleTaskCompletion(task, cb, wrapper)
    );

    const label = document.createElement('div');
    label.textContent = task.text.replace(/^\[Daily\]\s*/, '');
    if (isDone) {
      Object.assign(label.style, { textDecoration: 'line-through', color: '#777' });
    }
    Object.assign(label.style, {
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    });

    const btns = document.createElement('div');
    btns.style.display = 'flex';
    btns.style.gap = '8px';

    // Move up
    btns.append(makeIconBtn('⬆️', 'Move up', async () => {
      const prev = wrapper.previousElementSibling;
      if (prev && prev.classList.contains('daily-task-wrapper')) {
        container.insertBefore(wrapper, prev);
        try { await persistReorder(); }
        catch { alert('⚠️ Could not save new order.'); }
      }
    }));

    // Edit
    btns.append(makeIconBtn('✏️', 'Edit', async () => {
      const original = task.text.replace(/^\[Daily\]\s*/, '');
      const edited = prompt('Edit task:', original);
      if (!edited || edited.trim() === original) return;
      try {
        const allDecs = await loadDecisions();
        const idx = allDecs.findIndex(t => t.id === task.id);
        if (idx === -1) return;
        allDecs[idx].text = `[Daily] ${edited.trim()}`;
        await saveDecisions(allDecs);
        task.text = allDecs[idx].text;
        label.textContent = edited.trim();
      } catch {
        alert('⚠️ Could not save edit.');
      }
    }));

    // Skip interval (clock + dropdown menu)
    const clockBtn = makeIconBtn('🕒', 'Skip interval', () => toggleMenu());
    const menu = document.createElement('div');
    Object.assign(menu.style, {
      position: 'absolute', background: '#fff', border: '1px solid #ccc', borderRadius: '6px',
      boxShadow: '0 2px 6px rgba(0,0,0,0.15)', padding: '6px 0', fontSize: '0.9em',
      display: 'none', zIndex: '9999', minWidth: '120px'
    });
    document.body.appendChild(menu);
    skipOptions.forEach(opt => {
      const optBtn = document.createElement('button'); optBtn.type = 'button'; optBtn.textContent = opt.label;
      Object.assign(optBtn.style, {
        display: 'block', width: '100%', padding: '4px 12px', border: 'none', background: 'white',
        color: '#333', textAlign: 'left', cursor: 'pointer'
      });
      optBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const allDecs = await loadDecisions();
        const idx = allDecs.findIndex(d => d.id === task.id);
        if (idx === -1) return;
        allDecs[idx].skipUntil = new Date(Date.now() + opt.value * 3600000).toISOString();
        await saveDecisions(allDecs);
        menu.style.display = 'none'; wrapper.remove();
      });
      menu.appendChild(optBtn);
    });
    function toggleMenu() {
      const rect = clockBtn.getBoundingClientRect();
      menu.style.top = `${rect.bottom + window.scrollY}px`;
      menu.style.left = `${rect.left + window.scrollX}px`;
      menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    }
    document.addEventListener('click', e => {
      if (!menu.contains(e.target) && e.target !== clockBtn) menu.style.display = 'none';
    });
    btns.append(clockBtn);

    // Skip until next day
    btns.append(makeIconBtn('⏭️', 'Skip until next day', async () => {
      try {
        const allDecs = await loadDecisions();
        const idx = allDecs.findIndex(t => t.id === task.id);
        if (idx === -1) return;
        const now = new Date();
        const tm = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        allDecs[idx].skipUntil = tm.toISOString();
        await saveDecisions(allDecs);
        wrapper.remove();
      } catch { alert('⚠️ Could not skip task.'); }
    }));

    // Delete
    btns.append(makeIconBtn('❌', 'Delete', async () => {
      if (!confirm('Delete this task?')) return;
      try {
        const remaining = (await loadDecisions()).filter(t => t.id !== task.id);
        await saveDecisions(remaining);
        wrapper.remove();
      } catch {
        alert('⚠️ Could not delete task.');
      }
    }));

    row.append(cb, label, btns);
    wrapper.appendChild(row);
    return wrapper;
  }

  async function persistReorder() {
    const wrappers = Array.from(container.querySelectorAll('.daily-task-wrapper')).slice(1);
    const ids = wrappers.map(w => w.dataset.taskId);
    const others = all.filter(t => !ids.includes(t.id));
    const reordered = ids.map(id => all.find(t => t.id === id)).filter(Boolean);
    await saveDecisions([...others, ...reordered]);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('dailyPanel');
  if (panel && panel.style.display !== 'none') {
    // You still need access to currentUser and db here:
    renderDailyTasks(currentUser, db);
  }
});

window.renderDailyTasks = renderDailyTasks;
