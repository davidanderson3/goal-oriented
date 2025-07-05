// ── tasks.js ──

import { loadDecisions, saveDecisions, generateId, makeIconBtn } from './helpers.js';
import { enableTaskDragAndDrop } from './dragAndDrop.js';
import { createGoalRow } from './goals.js';

// Access the global openGoalIds set defined in goals.js
const openGoalIds = window.openGoalIds || new Set();

function setupToggle(wrapper, row, childrenContainer, id) {
    const toggle = row.querySelector('.toggle-triangle');
    if (!toggle) return;
    toggle.onclick = () => {
        const open = childrenContainer.style.display === 'block';
        toggle.textContent = open ? '▶' : '▼';
        childrenContainer.style.display = open ? 'none' : 'block';
        open ? openGoalIds.delete(id) : openGoalIds.add(id);
    };
}

/**
 * Attach ↑, ✏️, 🕒, ❌ buttons to a task-row.
 */
export function attachTaskButtons(item, row, listContainer, allDecisions) {
    const buttonWrap = row.querySelector('.button-row');
    if (!buttonWrap) return;

    // Move Up
    const upBtn = makeIconBtn('⬆️', 'Move task up', async () => {
        const wrapper = row.closest('[data-task-id]');
        const prev = wrapper.previousElementSibling;
        if (prev?.dataset.taskId) {
            listContainer.insertBefore(wrapper, prev);
            const ids = Array.from(listContainer.children).map(w => w.dataset.taskId);
            const under = allDecisions.filter(d => d.parentGoalId === item.parentGoalId && !d.completed);
            const other = allDecisions.filter(d => d.parentGoalId !== item.parentGoalId || d.completed);
            const reordered = ids.map(id => under.find(t => t.id === id)).filter(Boolean);
            const updated = [...other, ...reordered];
            await saveDecisions(updated);
            allDecisions.splice(0, allDecisions.length, ...updated);
        }
    });

    // Edit inline
    let editing = false;
    const editBtn = makeIconBtn('✏️', 'Edit task', async () => {
        const middle = row.querySelector('.middle-group');
        if (!middle) return;

        if (!editing) {
            editing = true;
            editBtn.innerHTML = '💾';

            const textInput = document.createElement('input');
            textInput.value = item.text;
            textInput.style.width = '100%';

            const notesInput = document.createElement('textarea');
            notesInput.value = item.notes || '';
            notesInput.rows = 2;
            notesInput.style.width = '100%';
            notesInput.style.marginTop = '4px';

            middle.innerHTML = '';
            middle.append(textInput, notesInput);
        } else {
            editing = false;
            const newText = middle.querySelector('input')?.value.trim();
            const newNotes = middle.querySelector('textarea')?.value.trim();
            const idx = allDecisions.findIndex(d => d.id === item.id);
            if (idx !== -1) {
                allDecisions[idx].text = newText;
                allDecisions[idx].notes = newNotes;
                await saveDecisions(allDecisions);
            }

            editBtn.innerHTML = '✏️';
            middle.innerHTML = '';
            const tDiv = document.createElement('div');
            tDiv.textContent = newText;
            middle.appendChild(tDiv);
            if (newNotes) {
                const nDiv = document.createElement('div');
                nDiv.className = 'note-text';
                nDiv.textContent = newNotes;
                middle.appendChild(nDiv);
            }
        }
    });

    // Postpone (clock + dropdown)
    const clockBtn = makeIconBtn('🕒', 'Postpone task', () => { });
    const menu = document.createElement('div');
    Object.assign(menu.style, {
        position: 'absolute',
        background: '#fff',
        border: '1px solid #ccc',
        borderRadius: '6px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
        padding: '6px 0',
        fontSize: '0.9em',
        display: 'none',
        zIndex: '9999',
        minWidth: '120px'
    });
    document.body.appendChild(menu);

    const options = [
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

    options.forEach(opt => {
        const optBtn = document.createElement('button');
        optBtn.type = 'button';
        optBtn.textContent = opt.label;
        Object.assign(optBtn.style, {
            display: 'block',
            width: '100%',
            padding: '4px 12px',
            border: 'none',
            background: 'white',
            color: '#333',
            textAlign: 'left',
            cursor: 'pointer'
        });
        optBtn.addEventListener('mouseenter', () => optBtn.style.background = '#f0f0f0');
        optBtn.addEventListener('mouseleave', () => optBtn.style.background = 'white');
        optBtn.addEventListener('click', async e => {
            e.stopPropagation();
            const idx = allDecisions.findIndex(d => d.id === item.id);
            if (idx === -1) return;
            allDecisions[idx].hiddenUntil = new Date(Date.now() + opt.value * 3600 * 1000).toISOString();
            await saveDecisions(allDecisions);
            menu.style.display = 'none';

            // Hide only the postponed task wrapper, not the entire goal
            const wrapper = row.closest('[data-task-id]');
            if (wrapper) wrapper.style.display = 'none';
        });
        menu.appendChild(optBtn);
    });

    clockBtn.addEventListener('click', e => {
        e.stopPropagation();
        const rect = clockBtn.getBoundingClientRect();
        menu.style.top = `${rect.bottom + window.scrollY}px`;
        menu.style.left = `${rect.left + window.scrollX}px`;
        menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
    });

    document.addEventListener('click', e => {
        if (!menu.contains(e.target) && e.target !== clockBtn) {
            menu.style.display = 'none';
        }
    });

    // Delete
    const delBtn = makeIconBtn('❌', 'Delete task', async () => {
        if (!confirm(`Delete task: "${item.text}"?`)) return;
        const updated = allDecisions.filter(d => d.id !== item.id);
        await saveDecisions(updated);
        allDecisions.splice(0, allDecisions.length, ...updated);
        row.closest('[data-task-id]').remove();
    });

    buttonWrap.append(upBtn, editBtn, clockBtn, delBtn);
}


/**
 * Render all tasks under a goal, including add-new and completed.
 */
export async function renderChildren(goal, all, container) {
    container.innerHTML = '';
    const now = Date.now();
    const children = all.filter(item => item.parentGoalId === goal.id);

    // ── Active sub-goals ──
    const activeGoals = children.filter(c => {
        const hideUntil = c.hiddenUntil ? Date.parse(c.hiddenUntil) || 0 : 0;
        return c.type === 'goal' && !c.completed && (!hideUntil || now >= hideUntil);
    });
    activeGoals.forEach(g => {
        const wrap = document.createElement('div');
        wrap.className = 'decision goal-card indent-1';
        wrap.dataset.goalId = g.id;

        const row = createGoalRow(g, { hideScheduled: true, stayPut: true });
        wrap.appendChild(row);

        const childContainer = document.createElement('div');
        childContainer.className = 'goal-children';
        childContainer.style.display = openGoalIds.has(g.id) ? 'block' : 'none';
        wrap.appendChild(childContainer);
        renderChildren(g, all, childContainer);

        setupToggle(wrap, row, childContainer, g.id);
        container.appendChild(wrap);
    });

    // ── Active tasks ──
    const activeTasks = children.filter(c => {
        const hideUntil = c.hiddenUntil ? Date.parse(c.hiddenUntil) || 0 : 0;
        return c.type === 'task' && !c.completed && (!hideUntil || now >= hideUntil);
    });
    const taskList = document.createElement('div');
    taskList.className = 'task-list';
    container.appendChild(taskList);

    activeTasks.forEach(task => {
        const wrapper = document.createElement('div');
        wrapper.className = 'decision indent-1';
        wrapper.dataset.taskId = task.id;
        wrapper.setAttribute('draggable', 'true');
        enableTaskDragAndDrop(wrapper, taskList, goal.id);

        const row = createGoalRow(task, { hideArrow: true, hideScheduled: true });
        wrapper.appendChild(row);
        taskList.append(wrapper);

        // Attach task buttons
        attachTaskButtons(task, row, taskList, all);

        const cb = row.querySelector('input[type="checkbox"]');
        cb.addEventListener('change', async () => {
            task.completed = cb.checked;
            task.dateCompleted = cb.checked ? new Date().toISOString() : '';
            const idx = all.findIndex(d => d.id === task.id);
            if (idx !== -1) all[idx] = task;
            await saveDecisions(all);
            renderChildren(goal, all, container);
        });
    });

    // New-task form
    const addForm = document.createElement('div');
    addForm.className = 'inline-add-form';
    Object.assign(addForm.style, {
        display: 'flex', alignItems: 'center',
        gap: '8px', margin: '6px 0 10px',
        paddingLeft: '28px'
    });

    const inputText = document.createElement('input');
    inputText.placeholder = 'New task…';
    Object.assign(inputText.style, {
        width: '500px', fontSize: '0.95em',
        padding: '6px 10px', height: '32px',
        border: '1px solid #ccc', borderRadius: '6px'
    });
    inputText.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); }
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+';
    addBtn.title = 'Add task';
    Object.assign(addBtn.style, {
        height: '32px', lineHeight: '32px',
        padding: '0 12px', fontSize: '1em',
        borderRadius: '6px', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center'
    });
    addBtn.addEventListener('click', async () => {
        const text = inputText.value.trim();
        if (!text) return alert('Please enter task text.');
        const newTask = {
            id: generateId(),
            text,
            notes: '',
            completed: false,
            dateCompleted: '',
            parentGoalId: goal.id,
            type: 'task'
        };
        all.push(newTask);
        await saveDecisions(all);
        inputText.value = '';
        renderChildren(goal, all, container);
    });

    addForm.append(inputText, addBtn);
    container.appendChild(addForm);

    // Completed items
    const done = children.filter(c => c.completed);
    if (done.length) {
        const doneContainer = document.createElement('div');
        doneContainer.className = 'completed-task-list';
        container.appendChild(doneContainer);

        done.forEach(item => {
            if (item.type === 'task') {
                const wrapper = document.createElement('div');
                wrapper.className = 'decision indent-1 completed-decision-inline';
                wrapper.dataset.taskId = item.id;
                wrapper.setAttribute('draggable', 'false');

                const row = document.createElement('div');
                row.className = 'decision-row';
                Object.assign(row.style, {
                    padding: '4px 8px',
                    fontSize: '0.85em',
                    alignItems: 'center'
                });

                const left = document.createElement('div');
                left.className = 'check-column';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = true;
                cb.addEventListener('change', async () => {
                    item.completed = cb.checked;
                    item.dateCompleted = cb.checked ? new Date().toISOString() : '';
                    const idx = all.findIndex(d => d.id === item.id);
                    if (idx !== -1) all[idx] = item;
                    await saveDecisions(all);
                    renderChildren(goal, all, container);
                });
                left.appendChild(cb);

                const middle = document.createElement('div');
                middle.className = 'middle-group';
                Object.assign(middle.style, {
                    display: 'grid',
                    gridTemplateColumns: 'minmax(200px,1fr) minmax(180px,auto)',
                    columnGap: '16px'
                });
                const title = document.createElement('div');
                title.className = 'title-column';
                title.textContent = item.text;
                if (item.notes) {
                    const n = document.createElement('div');
                    n.className = 'note-text';
                    n.textContent = item.notes;
                    title.appendChild(n);
                }
                const res = document.createElement('div');
                res.textContent = item.resolution ? `→ ${item.resolution}` : '';
                Object.assign(res.style, {
                    fontStyle: 'italic', color: '#666', fontSize: '0.85em'
                });
                middle.append(title, res);

                const right = document.createElement('div');
                right.className = 'right-group';
                right.style.gap = '4px';
                const due = document.createElement('div');
                due.className = 'due-column';
                due.textContent = item.dateCompleted || '';
                const btnWrap = document.createElement('div');
                btnWrap.className = 'button-row';
                attachTaskButtons(item, row, doneContainer, all);

                right.append(due, btnWrap);
                row.append(left, middle, right);
                wrapper.append(row);
                doneContainer.append(wrapper);
            } else if (item.type === 'goal') {
                const wrap = document.createElement('div');
                wrap.className = 'decision indent-1 completed-decision-inline';
                wrap.dataset.goalId = item.id;
                wrap.setAttribute('draggable', 'false');

                const row = createGoalRow(item, { hideScheduled: true, stayPut: true });
                Object.assign(row.style, {
                    padding: '4px 8px',
                    fontSize: '0.85em',
                    alignItems: 'center'
                });
                wrap.appendChild(row);
                doneContainer.appendChild(wrap);
            }
        });
    }
}

