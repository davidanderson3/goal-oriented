import { loadDecisions, saveDecisions, generateId } from './helpers.js';
import { renderDailyTasks } from './daily.js';
import { renderGoalsAndSubitems } from './goals.js';
import { initAuth } from './auth.js';
import { db } from './auth.js';
import { initWizard } from './wizard.js';
import { renderDailyTaskReport } from './report.js';
import { initMetricsUI } from './stats.js';
import { initTabs } from './tabs.js';
import { initButtonStyles } from './buttonStyles.js';
import { initTabReports } from './tabReports.js';

window.currentUser = null;

window.addEventListener('DOMContentLoaded', () => {
  const uiRefs = {
    loginBtn: document.getElementById('loginBtn'),
    logoutBtn: document.getElementById('logoutBtn'),
    userEmail: document.getElementById('userEmail'),
    signupBtn: document.getElementById('signupBtn'),
    splashLoginBtn: document.getElementById('splashLoginBtn'),
    previewBtn: document.getElementById('previewBtn'),
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
  if (uiRefs.splashLoginBtn) {
    uiRefs.splashLoginBtn.addEventListener('click', () => uiRefs.loginBtn.click());
  }
  if (uiRefs.previewBtn) {
    uiRefs.previewBtn.addEventListener('click', () => {
      splash.style.display = 'none';
      goalsView.scrollIntoView({ behavior: 'smooth' });
    });
  }

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
      renderDailyTasks(null, db);
      initTabReports(null, db);
      return;
    }

    splash.style.display = 'none';
    goalsView.style.display = '';

    initTabs(user, db);
    renderGoalsAndSubitems(user, db);
    renderDailyTasks(user, db);
    initTabReports(user, db);

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
