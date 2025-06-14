// js/main.js
import { initAuth } from './auth.js';
import { initWizard } from './wizard.js';
import { renderGoalsAndSubitems } from './render.js';
import { renderDailyTasks } from './daily.js';
import { db } from './auth.js';
import { showDailyLogPrompt } from './dailyLog.js';

export let currentUser = null;

window.addEventListener('DOMContentLoaded', () => {
  const uiRefs = {
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userEmail: document.getElementById('userEmail'),
    addGoalBtn: document.getElementById('addGoalBtn'),
    wizardContainer: document.getElementById('goalWizard'),
    wizardStep: document.getElementById('wizardStep'),
    nextBtn: document.getElementById('wizardNextBtn'),
    backBtn: document.getElementById('wizardBackBtn'),
    cancelBtn: document.getElementById('wizardCancelBtn'),
  };

  initAuth(uiRefs, (user) => {
    currentUser = user;
    if (user) {
      // 🔄 Full cleanup before re-rendering
      document.getElementById('goalList').innerHTML = '';
      document.getElementById('completedList').innerHTML = '';
      const dailyList = document.getElementById('dailyTasksList');
      if (dailyList) dailyList.innerHTML = '';

      // 🔄 Also clear any persistent global state
      if (window.openGoalIds) window.openGoalIds.clear?.();

      // ✅ Re-render with fresh data
      renderGoalsAndSubitems(user, db);
      showDailyLogPrompt(user, db);
      renderDailyTasks(user, db);
    }
    else {
      document.getElementById('goalList').innerHTML = '';
      document.getElementById('completedList').innerHTML = '';
      const dailyList = document.getElementById('dailyTasksList');
      if (dailyList) dailyList.innerHTML = '';
    }
  });

  initWizard(uiRefs);
});
