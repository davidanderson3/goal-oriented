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

// Prevent all default drag/drop behavior globally
document.addEventListener('dragover', e => e.preventDefault());
document.addEventListener('drop', e => e.preventDefault());

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

export async function renderGoalsAndSubitems() {
    goalList.innerHTML = '';
    completedList.innerHTML = '';
    const renderedGoalIds = new Set();
    const all = await loadDecisions();
    console.log('🔍 Total items loaded:', all.length);

    const goals = all.filter(i => i.type === 'goal' && i.id && i.parentGoalId == null);
    const goalMap = Object.fromEntries(goals.map(g => [g.id, g]));

    const snap = await db.collection('decisions').doc(firebase.auth().currentUser.uid).get();
    const goalOrder = Array.isArray(snap.data()?.goalOrder)
        ? snap.data().goalOrder
        : goals.map(g => g.id);

    const sortedGoals = [
        ...goalOrder.map(id => goalMap[id]).filter(Boolean),
        ...goals.filter(g => !goalOrder.includes(g.id))
    ];

    const now = new Date().getTime();


    // 🔽 Hidden Goals Section
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

    // 🔽 Completed Goals Section (collapsed and sorted by most recent)
    let completedSection = document.getElementById('completedSection');
    if (!completedSection) {
        completedSection = document.createElement('div');
        completedSection.id = 'completedSection';

        const completedHeader = document.createElement('h2');
        const toggle = document.createElement('span');
        toggle.textContent = '▶'; // collapsed by default
        toggle.style.cursor = 'pointer';

        let completedContent = document.createElement('div');
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

    // Split and sort goals
    const completedGoals = sortedGoals
        .filter(g => g.completed && g.dateCompleted)
        .sort((a, b) => new Date(b.dateCompleted) - new Date(a.dateCompleted));

    const hiddenAndActiveGoals = sortedGoals.filter(g => !g.completed);

    // Sort hidden goals newest first
    // Sort hidden goals oldest first
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
            renderedGoalIds.add(goal.id);
        } else if (isHidden) {
            const label = document.createElement('div');
            label.className = 'right-aligned';
            label.textContent = `Hidden until: ${new Date(hideUntil).toLocaleString()}`;
            const unhideBtn = document.createElement('button');
            unhideBtn.type = 'button';
            unhideBtn.textContent = 'Unhide';
            unhideBtn.className = 'revisit-btn';
            unhideBtn.style.marginLeft = '10px';
            unhideBtn.onclick = async () => {
                const updated = await loadDecisions();
                const idx = updated.findIndex(d => d.id === goal.id);
                if (idx !== -1) {
                    updated[idx].hiddenUntil = null;
                    await saveDecisions(updated);
                    renderGoalsAndSubitems();
                }
            };

            label.appendChild(unhideBtn);
            wrapper.appendChild(label);
            hiddenContent.appendChild(wrapper);
            renderedGoalIds.add(goal.id);
        } else {
            goalList.appendChild(wrapper);
            renderedGoalIds.add(goal.id);
        }
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

    // 🕒 Hide select (only for incomplete items)
    if (!item.completed) {
        const clockBtn = document.createElement('button');
        clockBtn.innerHTML = '🕒';
        clockBtn.title = 'Temporarily hide';
        clockBtn.style.background = 'none';
        clockBtn.style.border = 'none';
        clockBtn.style.cursor = 'pointer';
        clockBtn.style.fontSize = '1.2em';
        clockBtn.style.position = 'relative';
        buttonWrap.appendChild(clockBtn);

        const menu = document.createElement('div');
        menu.style.position = 'absolute';
        menu.style.background = '#fff';
        menu.style.border = '1px solid #ccc';
        menu.style.borderRadius = '6px';
        menu.style.boxShadow = '0 2px 6px rgba(0,0,0,0.15)';
        menu.style.padding = '6px 0';
        menu.style.fontSize = '0.9em';
        menu.style.display = 'none';
        menu.style.zIndex = '9999';
        menu.style.minWidth = '120px';
        menu.style.boxSizing = 'border-box';


        const options = [
            { label: '1 hour', value: 1 },
            { label: '2 hour', value: 2 },
            { label: '4 hours', value: 4 },
            { label: '8 hours', value: 8 },
            { label: '1 day', value: 24 },
            { label: '4 days', value: 96 },
            { label: '1 week', value: 168 },
            { label: '1 month', value: 720 }
        ];

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.textContent = opt.label;
            btn.style.display = 'block';
            btn.style.width = '100%';
            btn.style.padding = '4px 12px';
            btn.style.border = 'none';
            btn.style.background = 'none';
            btn.style.textAlign = 'left';
            btn.style.cursor = 'pointer';
            btn.style.color = '#333';
            btn.style.background = 'white';

            btn.onmouseover = () => btn.style.background = '#f0f0f0';
            btn.onmouseout = () => btn.style.background = 'none';

            btn.onclick = async () => {
                const updated = await loadDecisions();
                const idx = updated.findIndex(d => d.id === item.id);
                if (idx !== -1) {
                    const targetTime = new Date(Date.now() + opt.value * 60 * 60 * 1000);
                    updated[idx].hiddenUntil = targetTime.toLocaleString('en-CA', { hour12: false }); // keeps local time

                    await saveDecisions(updated);
                    menu.style.display = 'none'; // 👈 hide the menu
                    renderGoalsAndSubitems();
                }
            };


            menu.appendChild(btn);
        });

        document.body.appendChild(menu);

        clockBtn.onclick = e => {
            e.stopPropagation();
            const rect = clockBtn.getBoundingClientRect();
            menu.style.top = `${rect.bottom + window.scrollY}px`;
            menu.style.left = `${rect.left + window.scrollX}px`;
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        };

        // Dismiss on outside click
        document.addEventListener('click', e => {
            if (!menu.contains(e.target) && e.target !== clockBtn) {
                menu.style.display = 'none';
            }
        });
    }



    // ❌ Delete icon button
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.innerHTML = '❌';
    deleteBtn.title = 'Delete';
    deleteBtn.style.background = 'none';
    deleteBtn.style.border = 'none';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.style.fontSize = '1.2em';
    buttonWrap.appendChild(deleteBtn);

    [editBtn, deleteBtn].forEach(btn => {
        btn.addEventListener('mousedown', e => e.stopPropagation());
        btn.addEventListener('click', e => e.stopPropagation());
    });

    deleteBtn.onclick = async () => {
        if (!confirm(`Delete goal: "${item.text}"?`)) return;
        const updated = await loadDecisions();
        const filtered = updated.filter(d => d.id !== item.id && d.parentGoalId !== item.id);
        await saveDecisions(filtered);
        renderGoalsAndSubitems();
    };

    let editing = false;

    editBtn.onclick = async () => {
        const row = editBtn.closest('.decision-row');
        const middle = row?.querySelector('.middle-group');
        const due = row?.querySelector('.due-column');

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
            const text = middle.querySelector('input')?.value.trim();
            const deadline = due.querySelector('input')?.value.trim();

            const updated = await loadDecisions();
            const idx = updated.findIndex(d => d.id === item.id);
            if (idx !== -1) {
                updated[idx].text = text;
                updated[idx].deadline = deadline;
                await saveDecisions(updated);
            }

            editing = false;
            renderGoalsAndSubitems();
        }
    };
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
        const resolution = prompt(`Mark ${goal.type === 'task' ? 'task' : 'goal'} complete: ${goal.text}`);
        if (!resolution) {
            checkbox.checked = false;
            return;
        }

        goal.completed = true;
        goal.resolution = resolution;
        goal.dateCompleted = new Date().toLocaleDateString('en-CA');

        const updated = await loadDecisions();
        const idx = updated.findIndex(d => d.id === goal.id);
        if (idx !== -1) {
            updated[idx] = goal;
            await saveDecisions(updated);
        }

        const wrapper = checkbox.closest('.goal-card, .decision.indent-1');
        if (wrapper) {
            // Remove task visually from current list
            wrapper.remove();

            if (goal.type === 'task') {
                // Re-render children for this goal only
                const container = wrapper.closest('.goal-children');
                const goalId = goal.parentGoalId;
                const parentGoal = updated.find(g => g.id === goalId);
                if (parentGoal && container) renderChildren(parentGoal, updated, container);
            } else {
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

    const buttonWrap = document.createElement('div');
    buttonWrap.className = 'button-row';
    attachEditButtons(goal, buttonWrap);

    right.appendChild(due);
    right.appendChild(buttonWrap);

    row.appendChild(left);
    row.appendChild(middle);
    row.appendChild(right);

    if (!options.hideArrow) {
        toggle.onclick = () => {
            const wrapper = row.closest('.goal-card');
            const container = wrapper?.querySelector('.goal-children');
            const isVisible = container?.style.display === 'block';
            toggle.textContent = isVisible ? '▶' : '▼';
            if (container) container.style.display = isVisible ? 'none' : 'block';
        };
    }

    return row;
}

function renderChildren(goal, all, container) {
    const children = all.filter(i => i.parentGoalId === goal.id);
    const now = new Date().getTime();

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

    container.innerHTML = '';

    const taskList = document.createElement('div');
    taskList.className = 'task-list';
    container.appendChild(taskList);

    activeTasks.forEach(task => {
        const wrapper = document.createElement('div');
        wrapper.className = 'decision indent-1';
        wrapper.setAttribute('draggable', 'true');
        wrapper.dataset.taskId = task.id;

        const row = createGoalRow(task, { hideArrow: true });
        row.style.background = '#f6fefe';
        row.style.borderLeft = '4px solid #8cd1cc';
        wrapper.appendChild(row);

        taskList.appendChild(wrapper);
        enableTaskDragAndDrop(wrapper, taskList, goal.id);
    });

    // ✅ Add task input + button
    const addRow = document.createElement('div');
    addRow.className = 'inline-add-form';
    addRow.setAttribute('role', 'presentation');
    addRow.style.display = 'flex';
    addRow.style.alignItems = 'center';
    addRow.style.gap = '8px';
    addRow.style.margin = '6px 0 10px';
    addRow.style.paddingLeft = '28px';

    const inputText = document.createElement('input');
    inputText.placeholder = 'New task...';
    inputText.style.width = '500px';
    inputText.style.fontSize = '0.95em';
    inputText.style.padding = '6px 10px';
    inputText.style.height = '32px';
    inputText.style.border = '1px solid #ccc';
    inputText.style.borderRadius = '6px';

    inputText.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            console.warn('⛔️ Blocked Enter key on task input');
            addBtn.click();
        }
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '+';
    addBtn.title = 'Add task';
    addBtn.style.height = '32px';
    addBtn.style.lineHeight = '32px';
    addBtn.style.padding = '0 12px';
    addBtn.style.margin = '0 0px 1px';
    addBtn.style.fontSize = '1em';
    addBtn.style.borderRadius = '6px';
    addBtn.style.display = 'inline-flex';
    addBtn.style.alignItems = 'center';
    addBtn.style.justifyContent = 'center';

    addBtn.onclick = async (e) => {
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
        renderChildren(goal, updated, container); // ⬅ keeps goal expanded
    };

    addRow.appendChild(inputText);
    addRow.appendChild(addBtn);
    container.appendChild(addRow);

    // ✅ Completed tasks
    completedTasks.forEach(task => {
        const wrapper = document.createElement('div');
        wrapper.className = 'decision indent-1 completed-decision-inline';
        wrapper.setAttribute('draggable', 'false');

        const row = document.createElement('div');
        row.className = 'decision-row';
        row.style.padding = '4px 8px';
        row.style.fontSize = '0.85em';
        row.style.alignItems = 'center';

        const left = document.createElement('div');
        left.className = 'check-column';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = true;
        checkbox.disabled = true;
        left.appendChild(checkbox);

        const middle = document.createElement('div');
        middle.className = 'middle-group';
        middle.style.display = 'grid';
        middle.style.gridTemplateColumns = 'minmax(200px, 1fr) minmax(180px, auto)';
        middle.style.columnGap = '16px';

        const taskText = document.createElement('div');
        taskText.textContent = task.text;
        taskText.className = 'title-column';

        const resolution = document.createElement('div');
        resolution.textContent = task.resolution ? `→ ${task.resolution}` : '';
        resolution.style.fontStyle = 'italic';
        resolution.style.color = '#666';
        resolution.style.fontSize = '0.85em';

        middle.appendChild(taskText);
        middle.appendChild(resolution);

        const right = document.createElement('div');
        right.className = 'right-group';
        right.style.gap = '4px';

        const due = document.createElement('div');
        due.className = 'due-column';
        due.textContent = task.dateCompleted || '';

        const buttonWrap = document.createElement('div');
        buttonWrap.className = 'button-row';
        attachTaskDeleteButton(task, row);

        right.appendChild(due);
        right.appendChild(buttonWrap);

        row.appendChild(left);
        row.appendChild(middle);
        row.appendChild(right);
        wrapper.appendChild(row);

        container.appendChild(wrapper);
    });
}

function attachTaskDeleteButton(item, row) {
    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button'; // 🔥 Prevents form submission
    deleteBtn.textContent = 'Delete';

    deleteBtn.className = 'remove-btn';
    deleteBtn.style.marginLeft = '8px';

    // Prevent drag interference
    deleteBtn.addEventListener('mousedown', e => e.stopPropagation());
    deleteBtn.addEventListener('click', e => e.stopPropagation());

    deleteBtn.onclick = async () => {
        if (!confirm(`Delete task: "${item.text}"?`)) return;
        const updated = await loadDecisions();
        const filtered = updated.filter(d => d.id !== item.id);
        await saveDecisions(filtered);
        renderGoalsAndSubitems();
    };

    row.querySelector('.right-group .button-row')?.appendChild(deleteBtn);
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




