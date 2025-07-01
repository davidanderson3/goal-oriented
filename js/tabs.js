export function initTabs(currentUser, db) {
  const tabButtons = document.querySelectorAll('.tab-button');
  const panels    = ['goalsPanel','calendarPanel','dailyPanel','metricsPanel','listsPanel','reportPanel'];

  tabButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      // 1) toggle active state
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // 2) show/hide panels
      const target = btn.dataset.target;
      panels.forEach(id => {
        const el = document.getElementById(id);
        el.style.display = (id === target) ? 'flex' : 'none';
      });

      // 3) update URL hash
      history.pushState(null, '', `#${target}`);

      // 4) init dynamic content
      if (target === 'dailyPanel') {
        await window.renderDailyTasks(currentUser, db);
      }
      else if (target === 'metricsPanel') {
        await window.initMetricsUI();
      }
      else if (target === 'listsPanel') {
        await window.initListsPanel(currentUser, db);
      }
      else if (target === 'reportPanel') {
        await window.renderDailyTaskReport(currentUser, db);
      }
    });
  });

  // initial activation from hash or default
  const hash    = window.location.hash.substring(1);
  const initial = (hash && panels.includes(hash))
    ? hash
    : document.querySelector('.tab-button.active')?.dataset.target || panels[0];

  tabButtons.forEach(b => b.classList.remove('active'));
  document.querySelector(`.tab-button[data-target="${initial}"]`)?.classList.add('active');
  panels.forEach(id => {
    const el = document.getElementById(id);
    el.style.display = (id === initial) ? 'flex' : 'none';
  });

  // on load, fire any needed init
  document.addEventListener('DOMContentLoaded', () => {
    if (initial === 'metricsPanel') {
      window.initMetricsUI();
    }
    else if (initial === 'listsPanel') {
      window.initListsPanel(currentUser, db);
    }
    else if (initial === 'reportPanel') {
      window.renderDailyTaskReport(currentUser, db);
    }
  });
}
