import { loadDecisions, saveDecisions, saveGoalOrder, generateId, formatDaysUntil } from './helpers.js';
import { db } from './auth.js';

const openGoalIds = new Set();
const goalList = document.getElementById('goalList');
const completedList = document.getElementById('completedList');
let dragSrcEl = null;

['dragover', 'drop', 'dragenter', 'dragstart'].forEach(event => {
    document.addEventListener(event, e => {
        if (!e.target.closest('.decision') && !e.target.closest('.goal-card')) {
            e.preventDefault();
            e.stopPropagation();
        }
    });
});

document.addEventListener('dragover', e => {
    if (
        !e.target.closest('.decision') &&
        !e.target.closest('.goal-card') &&
        !e.target.closest('.daily-task-wrapper')
    ) {
        e.preventDefault();
    }
});
document.addEventListener('drop', e => {
    if (
        !e.target.closest('.decision') &&
        !e.target.closest('.goal-card') &&
        !e.target.closest('.daily-task-wrapper')
    ) {
        e.preventDefault();
    }
});

function enableTaskDrag(wrapper, task, goal, all, container) {
    wrapper.addEventListener('dragstart', e => {
        if (e.target.closest('[data-task-id]') !== wrapper) {
            e.preventDefault(); // Only allow dragging the wrapper itself
            return;
        }
        draggedId = task.id;
        e.dataTransfer.setData('text/plain', draggedId);
        wrapper.classList.add('dragging');
    });

    wrapper.addEventListener('dragend', () => {
        draggedId = null;
        wrapper.classList.remove('dragging');
    });

    wrapper.addEventListener('dragover', e => {
        e.preventDefault();
        const dragging = e.dataTransfer.getData('text/plain');
        if (dragging && dragging !== task.id) {
            wrapper.classList.add('drag-over');
        }
    });

    wrapper.addEventListener('dragleave', () => {
        wrapper.classList.remove('drag-over');
    });

    wrapper.addEventListener('drop', async e => {
        e.preventDefault();
        wrapper.classList.remove('drag-over');

        const droppedId = e.dataTransfer.getData('text/plain');
        if (!droppedId || droppedId === task.id) return;

        const updated = await loadDecisions();

        const underGoal = updated.filter(i => i.parentGoalId === goal.id && !i.completed);
        const others = updated.filter(i => i.parentGoalId !== goal.id || i.completed);

        const fromIdx = underGoal.findIndex(i => i.id === droppedId);
        const toIdx = underGoal.findIndex(i => i.id === task.id);

        if (fromIdx === -1 || toIdx === -1) return;

        const [moved] = underGoal.splice(fromIdx, 1);
        underGoal.splice(toIdx, 0, moved);

        const reordered = [...others, ...underGoal];
        await saveDecisions(reordered);
        renderGoalsAndSubitems();
    });
}

// Reusable icon‐style button factory (same as in dailyTasks)
function makeIconBtn(symbol, title, fn) {
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
    // Prevent clicks from bubbling up (and interfering with drag)
    b.addEventListener('mousedown', e => e.stopPropagation());
    b.addEventListener('click', e => e.stopPropagation());
    b.onclick = fn;
    return b;
}

/**
 * Attach ↑, ✏️, 🕒, ❌ buttons to a task-row.
 *
 * @param {{id:string,parentGoalId:string,text:string,completed:boolean,deadline?:string,hiddenUntil?:string}} item
 * @param {HTMLElement} row    the .decision-row for this task
 * @param {HTMLElement} listContainer  the parent .task-list element
 */
async function attachTaskButtons(item, row, listContainer) {
    const buttonWrap = row.querySelector('.button-row');
    if (!buttonWrap) return;

    // — Create buttons using our factory —
    const upBtn = makeIconBtn('⬆️', 'Move task up', async () => {
        const wrapper = row.closest('[data-task-id]');
        const prev = wrapper.previousElementSibling;
        if (prev && prev.dataset.taskId) {
            listContainer.insertBefore(wrapper, prev);
            // Persist new order:
            const ids = Array.from(listContainer.children).map(w => w.dataset.taskId);
            const all = await loadDecisions();
            const under = all.filter(d => d.parentGoalId === item.parentGoalId && !d.completed);
            const other = all.filter(d => d.parentGoalId !== item.parentGoalId || d.completed);
            const reordered = ids.map(id => under.find(t => t.id === id)).filter(Boolean);
            await saveDecisions([...other, ...reordered]);
        }
    });

    const editBtn = makeIconBtn('✏️', 'Edit task', async () => {
        const newText = prompt('Edit task:', item.text)?.trim();
        if (newText && newText !== item.text) {
            const all = await loadDecisions();
            const idx = all.findIndex(d => d.id === item.id);
            all[idx].text = newText;
            await saveDecisions(all);
            row.querySelector('.middle-group').textContent = newText;
        }
    });

    const clockBtn = makeIconBtn('🕒', 'Temporarily hide', () => {
        // (reuse your existing hide-menu logic here)
        // e.g. show options “1h,2h…” then set hiddenUntil and saveDecisions…
    });

    const delBtn = makeIconBtn('❌', 'Delete task', async () => {
        if (!confirm(`Delete task: "${item.text}"?`)) return;
        const all = await loadDecisions();
        await saveDecisions(all.filter(d => d.id !== item.id));
        row.closest('[data-task-id]').remove();
    });

    // — Append in the desired order: up, edit, postpone, delete —
    buttonWrap.append(upBtn, editBtn, clockBtn, delBtn);
}


export async function renderGoalsAndSubitems() {
    goalList.innerHTML = '';
    completedList.innerHTML = '';
    const renderedGoalIds = new Set();
    const all = await loadDecisions();
    console.log('🔍 Total items loaded:', all.length);

    const goals = all.filter(i => i.type === 'goal' && i.id && i.parentGoalId == null);
    const goalMap = Object.fromEntries(goals.map(g => [g.id, g]));

    const snap = await db.collection('decisions').doc(firebase.auth().currentUser.uid).get();
    let goalOrder = Array.isArray(snap.data()?.goalOrder) ? snap.data().goalOrder : [];

    const missing = goals.map(g => g.id).filter(id => !goalOrder.includes(id));
    // in renderGoalsAndSubitems()
    if (missing.length > 0) {
        console.warn('🧭 Missing goals not in goalOrder:', missing);
        goalOrder = [...goalOrder, ...missing];
        // now persist it—only this field—back to Firestore
        await saveGoalOrder(goalOrder);
    }

    const sortedGoals = goalOrder.map(id => goalMap[id]).filter(Boolean);
    const now = new Date().getTime();

    // Hidden goals section
    let hiddenSection = document.getElementById('hiddenList');
    if (!hiddenSection) {
        hiddenSection = document.createElement('div');
        hiddenSection.id = 'hiddenList';
        hiddenSection.innerHTML = `
      <h2 style="margin-top: 32px;">
        <span id="toggleHidden" style="cursor: pointer;">▶</span> Hidden Goals
      </h2>
      <div id="hiddenContent" style="display: none;"></div>
    `;
        goalList.parentNode.insertBefore(hiddenSection, goalList.nextSibling);
    }

    const hiddenContent = hiddenSection.querySelector('#hiddenContent');
    hiddenContent.innerHTML = '';
    const toggleHidden = hiddenSection.querySelector('#toggleHidden');
    toggleHidden.onclick = () => {
        const isOpen = hiddenContent.style.display === 'block';
        toggleHidden.textContent = isOpen ? '▶' : '▼';
        hiddenContent.style.display = isOpen ? 'none' : 'block';
    };

    // Completed goals section
    let completedSection = document.getElementById('completedSection');
    if (!completedSection) {
        completedSection = document.createElement('div');
        completedSection.id = 'completedSection';

        const completedHeader = document.createElement('h2');
        const toggle = document.createElement('span');
        toggle.textContent = '▶';
        toggle.style.cursor = 'pointer';

        const completedContent = document.createElement('div');
        completedContent.id = 'completedContent';
        completedContent.style.display = 'none';
        completedContent.appendChild(completedList);

        toggle.onclick = () => {
            const isOpen = completedContent.style.display === 'block';
            toggle.textContent = isOpen ? '▶' : '▼';
            completedContent.style.display = isOpen ? 'none' : 'block';
        };

        completedHeader.appendChild(toggle);
        completedHeader.append(' Completed');
        completedSection.appendChild(completedHeader);
        completedSection.appendChild(completedContent);

        goalList.parentNode.appendChild(completedSection);
    }

    const completedGoals = sortedGoals
        .filter(g => g.completed && g.dateCompleted)
        .sort((a, b) => new Date(b.dateCompleted) - new Date(a.dateCompleted));

    const hiddenAndActiveGoals = sortedGoals.filter(g => !g.completed);

    hiddenAndActiveGoals.sort((a, b) => {
        const aTime = a.hiddenUntil ? new Date(a.hiddenUntil).getTime() : 0;
        const bTime = b.hiddenUntil ? new Date(b.hiddenUntil).getTime() : 0;
        return aTime - bTime;
    });

    const finalList = [...completedGoals, ...hiddenAndActiveGoals];

    finalList.forEach(goal => {
        if (renderedGoalIds.has(goal.id)) return;

        let hideUntil = 0;
        if (goal.hiddenUntil) {
            try {
                hideUntil = typeof goal.hiddenUntil === 'string'
                    ? Date.parse(goal.hiddenUntil)
                    : goal.hiddenUntil;

                if (isNaN(hideUntil)) hideUntil = 0;
            } catch {
                hideUntil = 0;
            }
        }

        const isCompleted = !!goal.completed;
        const isHidden = hideUntil && now < hideUntil;

        const wrapper = document.createElement('div');
        wrapper.className = 'decision goal-card';
        wrapper.setAttribute('draggable', 'true');
        wrapper.dataset.goalId = goal.id;

        const row = createGoalRow(goal);
        if (!row) return;

        const toggleBtn = row.querySelector('.toggle-triangle');
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'goal-children';

        const isOpen = openGoalIds.has(goal.id);
        childrenContainer.style.display = isOpen ? 'block' : 'none';
        toggleBtn.textContent = isOpen ? '▼' : '▶';
        wrapper.setAttribute('draggable', isOpen ? 'false' : 'true');

        toggleBtn.onclick = () => {
            const isVisible = childrenContainer.style.display === 'block';
            toggleBtn.textContent = isVisible ? '▶' : '▼';
            childrenContainer.style.display = isVisible ? 'none' : 'block';
            wrapper.setAttribute('draggable', isVisible ? 'true' : 'false');
            if (!isVisible) openGoalIds.add(goal.id);
            else openGoalIds.delete(goal.id);
        };

        wrapper.appendChild(row);
        wrapper.appendChild(childrenContainer);
        renderChildren(goal, all, childrenContainer);
        enableDragAndDrop(wrapper, 'goal');

        if (isCompleted) {
            if (goal.resolution?.trim()) {
                const resolutionRow = document.createElement('div');
                resolutionRow.className = 'link-line';
                resolutionRow.textContent = `✔️ ${goal.resolution}`;
                wrapper.appendChild(resolutionRow);
            }
            completedList.appendChild(wrapper);
        } else if (isHidden) {
            const label = document.createElement('div');
            label.className = 'right-aligned';
            label.textContent = `Hidden until: ${new Date(hideUntil).toLocaleString()}`;
            const unhideBtn = document.createElement('button');
            unhideBtn.type = 'button';
            unhideBtn.textContent = 'Unhide';
            unhideBtn.className = 'revisit-btn';
            unhideBtn.style.marginLeft = '10px';
            // file: render.js
            // … inside renderGoalsAndSubitems(), where you set up unhideBtn …
            // file: render.js
            unhideBtn.onclick = async () => {
                const updated = await loadDecisions();
                const idx = updated.findIndex(d => d.id === goal.id);
                if (idx === -1) return;

                // clear out the hidden flag in the data
                updated[idx].hiddenUntil = null;
                await saveDecisions(updated);

                // re-draw everything so hidden goals go back to the main list
                renderGoalsAndSubitems();
            };

            label.appendChild(unhideBtn);
            wrapper.appendChild(label);
            hiddenContent.appendChild(wrapper);
        } else {
            goalList.appendChild(wrapper);
        }

        renderedGoalIds.add(goal.id);
    });
}

function attachEditButtons(item, buttonWrap) {
    // ✏️ Edit icon button
    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.innerHTML = '✏️';
    editBtn.title = 'Edit';
    editBtn.style.background = 'none';
    editBtn.style.border = 'none';
    editBtn.style.cursor = 'pointer';
    editBtn.style.fontSize = '1.2em';
    buttonWrap.appendChild(editBtn);

    // 🕒 Hide select (only for incomplete goals)
    if (!item.completed) {
        const clockBtn = document.createElement('button');
        clockBtn.type = 'button';
        clockBtn.innerHTML = '🕒';
        clockBtn.title = 'Temporarily hide';
        clockBtn.style.background = 'none';
        clockBtn.style.border = 'none';
        clockBtn.style.cursor = 'pointer';
        clockBtn.style.fontSize = '1.2em';
        buttonWrap.appendChild(clockBtn);

        // build the hide-duration menu
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
            { label: '4 days', value: 96 },
            { label: '1 week', value: 168 },
            { label: '1 month', value: 720 }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = opt.label;
            Object.assign(btn.style, {
                display: 'block',
                width: '100%',
                padding: '4px 12px',
                border: 'none',
                background: 'white',
                color: '#333',
                textAlign: 'left',
                cursor: 'pointer'
            });
            btn.addEventListener('mouseover', () => btn.style.background = '#f0f0f0');
            btn.addEventListener('mouseout', () => btn.style.background = 'white');

            btn.addEventListener('click', async e => {
                e.stopPropagation();
                const all = await loadDecisions();
                const idx = all.findIndex(d => d.id === item.id);
                if (idx === -1) return;

                // set hiddenUntil and save
                const targetTime = new Date(Date.now() + opt.value * 3600 * 1000);
                all[idx].hiddenUntil = targetTime.toLocaleString('en-CA', { hour12: false });
                await saveDecisions(all);

                menu.style.display = 'none';
                renderGoalsAndSubitems();
            });

            menu.appendChild(btn);
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
    }

    // ❌ Delete icon button for goals
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.innerHTML = '❌';
    deleteBtn.title = 'Delete';
    deleteBtn.style.background = 'none';
    deleteBtn.style.border = 'none';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.fontSize = '1.2em';
    buttonWrap.appendChild(deleteBtn);

    // Prevent clicks from interfering with drag
    [editBtn, deleteBtn].forEach(btn => {
        btn.addEventListener('mousedown', e => e.stopPropagation());
        btn.addEventListener('click', e => e.stopPropagation());
    });

    deleteBtn.addEventListener('click', async () => {
        if (!confirm(`Delete goal: "${item.text}"?`)) return;
        const all = await loadDecisions();
        const filtered = all.filter(d => d.id !== item.id && d.parentGoalId !== item.id);
        await saveDecisions(filtered);
        renderGoalsAndSubitems();
    });

    // ——————— “Edit” → “Save” in-place ———————
    let editing = false;
    editBtn.addEventListener('click', async () => {
        const row = editBtn.closest('.decision-row');
        const middle = row.querySelector('.middle-group');
        const due = row.querySelector('.due-column');
        if (!middle || !due) return;

        if (!editing) {
            editing = true;
            editBtn.innerHTML = '💾';

            const textInput = document.createElement('input');
            textInput.value = item.text;
            textInput.style.width = '100%';

            const deadlineInput = document.createElement('input');
            deadlineInput.type = 'date';
            deadlineInput.value = item.deadline || '';
            deadlineInput.style.width = '140px';

            middle.innerHTML = '';
            middle.appendChild(textInput);
            due.innerHTML = '';
            due.appendChild(deadlineInput);
        } else {
            editing = false;
            const newText = middle.querySelector('input')?.value.trim();
            const newDeadline = due.querySelector('input')?.value.trim();

            const all = await loadDecisions();
            const idx = all.findIndex(d => d.id === item.id);
            if (idx !== -1) {
                all[idx].text = newText;
                all[idx].deadline = newDeadline;
                await saveDecisions(all);

                middle.textContent = newText;
                due.textContent = newDeadline;
                editBtn.innerHTML = '✏️';
            }
        }
    });
}

function createGoalRow(goal, options = {}) {
    const row = document.createElement('div');
    row.className = 'decision-row';

    const left = document.createElement('div');
    left.className = 'left-group';

    const toggle = document.createElement('span');
    toggle.className = 'toggle-triangle';
    toggle.style.marginRight = '6px';
    if (!options.hideArrow) {
        toggle.textContent = '▶';
        toggle.style.cursor = 'pointer';
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = goal.completed;
    checkbox.disabled = goal.completed;

    left.appendChild(toggle);
    left.appendChild(checkbox);

    checkbox.onchange = async () => {
        if (goal.type !== 'task') {
            const resolution = prompt(`Mark goal complete: ${goal.text}`);
            if (!resolution) {
                checkbox.checked = false;
                return;
            }
            goal.resolution = resolution;
        }

        goal.completed = true;
        goal.dateCompleted = new Date().toLocaleDateString('en-CA');

        const updated = await loadDecisions();
        const idx = updated.findIndex(d => d.id === goal.id);
        if (idx !== -1) {
            updated[idx] = goal;
            await saveDecisions(updated);
        }

        const wrapper = checkbox.closest('.goal-card, .decision.indent-1');
        if (wrapper) {
            wrapper.remove();

            if (goal.type === 'task') {
                const container = wrapper.closest('.goal-children');
                const goalId = goal.parentGoalId;
                const parentGoal = updated.find(g => g.id === goalId);
                if (parentGoal && container) renderChildren(parentGoal, updated, container);
            } else {
                if (goal.resolution?.trim()) {
                    const resolutionRow = document.createElement('div');
                    resolutionRow.className = 'link-line';
                    resolutionRow.textContent = `✔️ ${goal.resolution}`;
                    wrapper.appendChild(resolutionRow);
                }

                completedList.appendChild(wrapper);
            }
        }
    };

    const middle = document.createElement('div');
    middle.className = 'middle-group';
    middle.textContent = goal.text;

    const right = document.createElement('div');
    right.className = 'right-group';

    const due = document.createElement('div');
    due.className = 'due-column';
    due.textContent = goal.completed ? goal.dateCompleted : '';

    // … 
    const buttonWrap = document.createElement('div');
    buttonWrap.className = 'button-row';
    if (goal.type === 'goal') {
        attachEditButtons(goal, buttonWrap);
    }
    // …

    right.appendChild(due);
    right.appendChild(buttonWrap);
    row.appendChild(left);
    row.appendChild(middle);
    row.appendChild(right);

    return row;
}

export function renderChildren(goal, all, container) {
    const children = all.filter(i => i.parentGoalId === goal.id);
    const now = Date.now();

    // Separate active vs completed tasks, respecting hiddenUntil
    const activeTasks = children.filter(c => {
        let hideUntil = 0;
        if (c.hiddenUntil) {
            hideUntil = typeof c.hiddenUntil === 'string'
                ? new Date(c.hiddenUntil).getTime()
                : c.hiddenUntil;
            if (isNaN(hideUntil)) hideUntil = 0;
        }
        return !c.completed && (!hideUntil || now >= hideUntil);
    });
    const completedTasks = children.filter(c => c.completed);

    // Clear existing children
    container.innerHTML = '';

    // --- Active tasks ---
    // --- Active tasks ---
    const taskList = document.createElement('div');
    taskList.className = 'task-list';
    container.appendChild(taskList);

    activeTasks.forEach(task => {
        // 1️⃣ Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'decision indent-1';
        wrapper.setAttribute('draggable', 'true');
        wrapper.dataset.taskId = task.id;

        // 2️⃣ Build the row
        const row = createGoalRow(task, { hideArrow: true });
        row.style.background = '#f6fefe';
        row.style.borderLeft = '4px solid #8cd1cc';

        // 3️⃣ Wire drag‐and‐drop
        enableTaskDragAndDrop(wrapper, taskList, goal.id);

        // 4️⃣ Attach the ↑ ✏️ 🕒 ❌ buttons
        //    (uses the same makeIconBtn factory from dailyTasks)
        attachTaskButtons(task, row, taskList);

        // 5️⃣ Assemble into DOM
        wrapper.appendChild(row);
        taskList.appendChild(wrapper);
    });


    // --- Add new task form ---
    const addRow = document.createElement('div');
    addRow.className = 'inline-add-form';
    addRow.setAttribute('role', 'presentation');
    Object.assign(addRow.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        margin: '6px 0 10px',
        paddingLeft: '28px'
    });

    const inputText = document.createElement('input');
    inputText.placeholder = 'New task…';
    Object.assign(inputText.style, {
        width: '500px',
        fontSize: '0.95em',
        padding: '6px 10px',
        height: '32px',
        border: '1px solid #ccc',
        borderRadius: '6px'
    });
    inputText.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
        }
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+';
    addBtn.title = 'Add task';
    Object.assign(addBtn.style, {
        height: '32px',
        lineHeight: '32px',
        padding: '0 12px',
        margin: '0 0 1px',
        fontSize: '1em',
        borderRadius: '6px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center'
    });
    addBtn.addEventListener('click', async e => {
        e.preventDefault();
        const text = inputText.value.trim();
        if (!text) return alert('Please enter task text.');

        const newTask = {
            id: generateId(),
            text,
            completed: false,
            dateCompleted: '',
            resolution: '',
            parentGoalId: goal.id,
            type: 'task'
        };
        const updated = await loadDecisions();
        updated.push(newTask);
        await saveDecisions(updated);

        inputText.value = '';
        renderChildren(goal, updated, container);
    });

    addRow.append(inputText, addBtn);
    container.appendChild(addRow);

    // --- Completed tasks ---
    if (completedTasks.length) {
        const doneContainer = document.createElement('div');
        doneContainer.className = 'completed-task-list';
        container.appendChild(doneContainer);

        completedTasks.forEach(task => {
            const wrapper = document.createElement('div');
            wrapper.className = 'decision indent-1 completed-decision-inline';
            wrapper.setAttribute('draggable', 'false');
            wrapper.dataset.taskId = task.id;

            const row = document.createElement('div');
            row.className = 'decision-row';
            Object.assign(row.style, {
                padding: '4px 8px',
                fontSize: '0.85em',
                alignItems: 'center'
            });

            // ✔️ checkbox
            const left = document.createElement('div');
            left.className = 'check-column';
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            checkbox.disabled = true;
            left.appendChild(checkbox);

            // middle: text + resolution
            const middle = document.createElement('div');
            middle.className = 'middle-group';
            Object.assign(middle.style, {
                display: 'grid',
                gridTemplateColumns: 'minmax(200px,1fr) minmax(180px,auto)',
                columnGap: '16px'
            });
            const taskText = document.createElement('div');
            taskText.className = 'title-column';
            taskText.textContent = task.text;
            const resolution = document.createElement('div');
            resolution.textContent = task.resolution ? `→ ${task.resolution}` : '';
            Object.assign(resolution.style, {
                fontStyle: 'italic',
                color: '#666',
                fontSize: '0.85em'
            });
            middle.append(taskText, resolution);

            // right: date + buttons
            const right = document.createElement('div');
            right.className = 'right-group';
            right.style.gap = '4px';
            const due = document.createElement('div');
            due.className = 'due-column';
            due.textContent = task.dateCompleted || '';
            const buttonWrap = document.createElement('div');
            buttonWrap.className = 'button-row';
            // wire delete/edit/postpone but skip move-up if you like
            attachTaskButtons(task, row);

            right.append(due, buttonWrap);

            row.append(left, middle, right);
            wrapper.appendChild(row);
            doneContainer.appendChild(wrapper);
        });
    }
}



function enableDragAndDrop(wrapper, type = 'goal') {
    const goalList = document.getElementById('goalList');

    wrapper.addEventListener('dragstart', e => {
        if (type === 'goal' && e.target.closest('[data-task-id]')) {
            // 💥 Don't allow goal drag when dragging a task
            e.stopPropagation();
            return;
        }

        dragSrcEl = wrapper;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', wrapper.dataset.goalId);
        wrapper.classList.add('dragging');
    });

    wrapper.addEventListener('dragover', e => {
        if (type === 'goal' && e.target.closest('[data-task-id]')) return;

        e.preventDefault();
        e.stopPropagation();
        if (type === 'goal') wrapper.classList.add('goal-drop-indicator');
    });

    wrapper.addEventListener('dragleave', () => {
        if (type === 'goal') wrapper.classList.remove('goal-drop-indicator');
    });

    wrapper.addEventListener('drop', async e => {
        if (type === 'goal' && e.target.closest('[data-task-id]')) return;

        e.preventDefault();
        e.stopPropagation();

        wrapper.classList.remove('goal-drop-indicator');

        if (dragSrcEl && dragSrcEl !== wrapper) {
            const draggedId = dragSrcEl.dataset.goalId;
            const dropTargetId = wrapper.dataset.goalId;

            if (!draggedId || !dropTargetId) return;

            const siblings = [...goalList.children];
            const draggedIndex = siblings.findIndex(el => el.dataset.goalId === draggedId);
            const dropIndex = siblings.findIndex(el => el.dataset.goalId === dropTargetId);

            if (draggedIndex > -1 && dropIndex > -1) {
                goalList.insertBefore(dragSrcEl, draggedIndex < dropIndex ? wrapper.nextSibling : wrapper);
            }

            const newOrder = [...goalList.children]
                .map(el => el.dataset.goalId)
                .filter(Boolean);

            await saveGoalOrder(newOrder);
        }

        dragSrcEl = null;
    });

    wrapper.addEventListener('dragend', () => {
        wrapper.classList.remove('dragging');
    });
}

function enableTaskDragAndDrop(wrapper, taskList, goalId) {
    wrapper.addEventListener('dragstart', e => {
        e.stopPropagation();
        dragSrcEl = wrapper;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', wrapper.dataset.taskId);
        wrapper.classList.add('dragging');
        console.log('Dragging task:', wrapper.dataset.taskId);
    });

    wrapper.addEventListener('dragover', e => {
        e.preventDefault(); // 🔥 prevents page reload
        e.stopPropagation();
        wrapper.classList.add('drag-over');
    });

    wrapper.addEventListener('dragleave', () => {
        wrapper.classList.remove('drag-over');
    });

    wrapper.addEventListener('drop', async e => {
        e.preventDefault(); // 🔥 prevents page reload
        e.stopPropagation();
        wrapper.classList.remove('drag-over');

        const droppedId = e.dataTransfer.getData('text/plain');
        const targetId = wrapper.dataset.taskId;

        if (!droppedId || droppedId === targetId) return;

        console.log(`Dropped task: ${droppedId} on ${targetId}`);

        const children = [...taskList.children].filter(el => el.dataset.taskId);
        const fromIdx = children.findIndex(el => el.dataset.taskId === droppedId);
        const toIdx = children.findIndex(el => el.dataset.taskId === targetId);

        if (fromIdx === -1 || toIdx === -1) return;

        const draggedEl = children[fromIdx];
        taskList.insertBefore(draggedEl, fromIdx < toIdx ? wrapper.nextSibling : wrapper);

        const newOrder = [...taskList.children]
            .map(el => el.dataset.taskId)
            .filter(Boolean);

        const updated = await loadDecisions();
        const underGoal = updated.filter(i => i.parentGoalId === goalId && !i.completed);
        const others = updated.filter(i => i.parentGoalId !== goalId || i.completed);

        const reordered = newOrder.map(id => underGoal.find(t => t.id === id)).filter(Boolean);

        await saveDecisions([...others, ...reordered]);
        console.log('Saved new order for goal', goalId, newOrder);

        // Just update this goal's children
        const parentContainer = wrapper.closest('.goal-children');
        const parentGoal = updated.find(g => g.id === goalId);
        if (parentContainer && parentGoal) {
            renderChildren(parentGoal, updated, parentContainer);
        }

    });

    wrapper.addEventListener('dragend', () => {
        wrapper.classList.remove('dragging');
    });
}




