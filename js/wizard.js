import { parseNaturalDate } from './helpers.js';
import { generateId, loadDecisions, saveDecisions, saveGoalOrder } from './helpers.js';
import { renderGoalsAndSubitems } from './goals.js';
import { getCurrentUser } from './auth.js';

const db = firebase.firestore();

export const wizardState = {
  step: 0,
  goalText: '',
  deadline: '',
  subtasks: [],
  editingGoalId: null
};

let wizardContainer = null;
let addGoalBtn = null;

export function initWizard(uiRefs) {
  // Early exit if key UI elements are missing
  if (!uiRefs?.wizardContainer || !uiRefs?.addGoalBtn) {
    console.warn('⚠️ initWizard skipped — missing required UI elements.');
    return;
  }

  ({
    wizardContainer,
    addGoalBtn
  } = uiRefs);

  uiRefs.addGoalBtn.onclick = () => {
    Object.assign(wizardState, {
      step: 0,
      goalText: '',
      deadline: '',
      subtasks: [],
      editingGoalId: null
    });
    wizardContainer.style.display = 'block';
    addGoalBtn.style.display = 'none';
    renderWizardStep(uiRefs.wizardStep, uiRefs.backBtn);
  };

  uiRefs.cancelBtn.onclick = () => {
    wizardContainer.style.display = 'none';
    addGoalBtn.style.display = 'inline-block';
  };

  uiRefs.backBtn.onclick = () => {
    wizardState.step--;
    renderWizardStep(uiRefs.wizardStep, uiRefs.backBtn);
  };

  uiRefs.nextBtn.onclick = async () => {
    const nextBtn = uiRefs.nextBtn;
    nextBtn.disabled = true;

    try {
      if (wizardState.step === 0) {
        const input = document.getElementById('goalTextInput');
        if (!input) {
          renderWizardStep(uiRefs.wizardStep, uiRefs.backBtn);
          return;
        }
        wizardState.goalText = input.value.trim();
        if (!wizardState.goalText) {
          alert("Goal cannot be empty.");
          return;
        }
      } else if (wizardState.step === 1) {
        const textarea = document.getElementById('taskList');
        if (!textarea) {
          renderWizardStep(uiRefs.wizardStep, uiRefs.backBtn);
          return;
        }
        wizardState.subtasks = textarea.value
          .split('\n').map(t => t.trim()).filter(Boolean);
        await saveGoalWizard();
        return;
      }

      wizardState.step++;
      renderWizardStep(uiRefs.wizardStep, uiRefs.backBtn);
    } finally {
      nextBtn.disabled = false;
    }
  };
}

function renderWizardStep(container, backBtn) {
  container.innerHTML = '';
  backBtn.style.display = wizardState.step > 0 ? 'inline-block' : 'none';

  if (wizardState.step === 0) {
    container.innerHTML = `
      <label for="goalTextInput"><strong>Goal:</strong></label>
      <input id="goalTextInput" value="${wizardState.goalText}" style="margin-left:8px; width: 80%;" />
    `;
  } else {
    container.innerHTML = `
      <label>Subtasks (optional):</label>
      <textarea id="taskList" rows="4" placeholder="One per line">${wizardState.subtasks.join('\n')}</textarea>
    `;
  }
}

async function saveGoalWizard() {
  const all = await loadDecisions();

  const isEdit = !!wizardState.editingGoalId;
  const goalId = isEdit ? wizardState.editingGoalId : generateId();

  const newGoal = {
    id: goalId,
    type: 'goal',
    text: wizardState.goalText,
    notes: '',
    completed: false,
    resolution: '',
    dateCompleted: '',
    parentGoalId: null,
    hiddenUntil: null
  };

  const newItems = [newGoal];

  wizardState.subtasks.forEach(taskText => {
    newItems.push({
      id: generateId(),
      type: 'task',
      text: taskText,
      notes: '',
      completed: false,
      resolution: '',
      dateCompleted: '',
      parentGoalId: goalId,
      hiddenUntil: null
    });
  });

  const updatedItems = isEdit
    ? all.filter(item => item.id !== goalId && item.parentGoalId !== goalId)
    : all;

  await saveDecisions([...updatedItems, ...newItems]);

  const snap = await db.collection('decisions').doc(firebase.auth().currentUser.uid).get();
  const currentGoalOrder = snap.data()?.goalOrder || [];
  const newGoalOrder = isEdit ? currentGoalOrder : [...currentGoalOrder, goalId];
  await saveGoalOrder(newGoalOrder);

  wizardState.editingGoalId = null;
  wizardContainer.style.display = 'none';
  addGoalBtn.style.display = 'inline-block';
  renderGoalsAndSubitems();
}
