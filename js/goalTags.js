import { loadDecisions, queueSaveDecisions as saveDecisions } from './helpers.js';

/* ============================
   Full Function Implementation
   ============================ */

/**
 * Render the tags UI for a given goal.
 * Clears any existing tag container in the row and rebuilds it.
 * @param {Object} goal - The goal object, must include .id and optional .tags array.
 * @param {HTMLElement} rowEl - The goal's row element (from createGoalRow).
 */
export async function renderGoalTags(goal, rowEl) {
    // Ensure tags array exists
    if (!Array.isArray(goal.tags)) goal.tags = [];

    // Remove existing container if any
    const existing = rowEl.querySelector('.goal-tag-container');
    if (existing) existing.remove();

    // Build container
    const container = document.createElement('div');
    container.className = 'goal-tag-container';
    container.style.display = 'flex';
    container.style.flexWrap = 'wrap';
    container.style.marginTop = '4px';
    rowEl.appendChild(container);

    // Add each tag chip
    goal.tags.forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'goal-tag';
        chip.textContent = tag + ' ✕';
        chip.style.cursor = 'pointer';
        chip.style.margin = '2px';
        chip.style.padding = '2px 6px';
        chip.style.borderRadius = '12px';
        chip.style.background = '#eef';
        chip.onclick = async () => {
            await removeTagFromGoal(goal.id, tag);
            // re-render after removal
            const updated = (await loadDecisions()).find(d => d.id === goal.id);
            renderGoalTags(updated, rowEl);
        };
        container.appendChild(chip);
    });

    // Add button to add new tag
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'goal-tag-add-btn';
    addBtn.textContent = '🏷️';
    addBtn.title = 'Add tag';
    addBtn.style.margin = '2px';
    addBtn.style.padding = '2px 6px';
    addBtn.style.border = 'none';
    addBtn.style.background = 'none';
    addBtn.style.cursor = 'pointer';
    addBtn.onclick = async () => {
        const newTag = prompt('Enter new tag:');
        if (newTag && newTag.trim()) {
            await addTagToGoal(goal.id, newTag.trim());
            const updated = (await loadDecisions()).find(d => d.id === goal.id);
            renderGoalTags(updated, rowEl);
        }
    };
    container.appendChild(addBtn);
}

/**
 * Add a tag to a goal and persist.
 * @param {string} goalId 
 * @param {string} tag 
 */
export async function addTagToGoal(goalId, tag) {
    const all = await loadDecisions();
    const goal = all.find(d => d.id === goalId);
    if (!goal) throw new Error('Goal not found: ' + goalId);
    goal.tags = Array.isArray(goal.tags) ? goal.tags : [];
    if (!goal.tags.includes(tag)) goal.tags.push(tag);
    await saveDecisions(all);
}

/**
 * Remove a tag from a goal and persist.
 * @param {string} goalId 
 * @param {string} tag 
 */
export async function removeTagFromGoal(goalId, tag) {
    const all = await loadDecisions();
    const goal = all.find(d => d.id === goalId);
    if (!goal) throw new Error('Goal not found: ' + goalId);
    goal.tags = (goal.tags || []).filter(t => t !== tag);
    await saveDecisions(all);
}


/* ======================
   Supporting Helpers
   ====================== */

/**
 * Call this once after loading goals to wire up tag rendering.
 * For example, in your render.js after you build each goal row:
 *
 * import { renderGoalTags } from './goalTags.js';
 * // ...
 * const row = createGoalRow(goal, options);
 * wrapper.appendChild(row);
 * renderGoalTags(goal, row);
 */
export function initializeGoalTagSupport() {
    // This is just documentation; no runtime code needed here.
}
