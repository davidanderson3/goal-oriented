import { loadDecisions, saveDecisions, generateId } from './helpers.js';
import { renderDailyTasks } from './daily.js';
import { renderGoalsAndSubitems } from './goals.js';
import { initAuth } from './auth.js';
import { db } from './auth.js';
import { initWizard } from './wizard.js';
import { renderDailyTaskReport } from './report.js';
import { initMetricsUI } from './stats.js';
import { initTabs } from './tabs.js';
import { renderNotesPanel } from './notes.js';
import { initButtonStyles } from './buttonStyles.js';

window.renderNotesPanel = renderNotesPanel;
window.currentUser = null;

window.addEventListener('DOMContentLoaded', () => {
  const uiRefs = {
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userEmail: document.getElementById('userEmail'),
    signupBtn: document.getElementById('signupBtn'),
    addGoalBtn: document.getElementById('addGoalBtn'),
    wizardContainer: document.getElementById('goalWizard'),
    wizardStep: document.getElementById('wizardStep'),
    nextBtn: document.getElementById('wizardNextBtn'),
    backBtn: document.getElementById('wizardBackBtn'),
    cancelBtn: document.getElementById('wizardCancelBtn')
  };

  const splash = document.getElementById('splash');
  const goalsView = document.getElementById('goalsView');

  uiRefs.signupBtn.addEventListener('click', () => uiRefs.loginBtn.click());

  initAuth(uiRefs, async (user) => {
    window.currentUser = user;

    ['goalList', 'completedList', 'dailyTasksList'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '';
    });

    window.openGoalIds?.clear?.();

    if (!user) {
      splash.style.display = 'flex';
      goalsView.style.display = '';
      initTabs(null, db);
      renderGoalsAndSubitems();
      return;
    }

    splash.style.display = 'none';
    goalsView.style.display = '';

    initTabs(user, db);
    renderGoalsAndSubitems(user, db);
    renderDailyTasks(user, db);

    if (document.getElementById('reportBody')) {
      renderDailyTaskReport(user, db);
    }

    const backupData = await loadDecisions();
    const backupKey = `backup-${new Date().toISOString().slice(0, 10)}`;
    localStorage.setItem(backupKey, JSON.stringify(backupData));
    console.log('⚡ backup saved to localStorage');
  });

  if (uiRefs.wizardContainer && uiRefs.wizardStep) {
    initWizard(uiRefs);
  }

  initButtonStyles();
});

window.loadDecisions = loadDecisions;
window.renderDailyTasks = renderDailyTasks;
window.initMetricsUI = initMetricsUI;
