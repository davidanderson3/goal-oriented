import { loadDecisions, loadLists } from './helpers.js';

function getLastNDates(n) {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates.reverse();
}

export async function initTabReports(user, db) {
  const decisions = await loadDecisions();
  renderGoalsReport(decisions);
  await renderDailyReport(decisions, user, db);
  const lists = await loadLists();
  renderListsReport(lists);
  // Calendar and Metrics tabs currently have no data-driven reports
}

function renderGoalsReport(items) {
  const container = document.getElementById('goalsReport');
  if (!container) return;
  const goals = items.filter(i => i.type === 'goal');
  const completed = goals.filter(g => g.completed).length;
  container.innerHTML = '<h3>Goal Progress</h3><canvas></canvas>';
  const ctx = container.querySelector('canvas').getContext('2d');
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Pending'],
      datasets: [{
        data: [completed, goals.length - completed],
        backgroundColor: ['#5cb85c', '#d9534f']
      }]
    },
    options: {
      plugins: { legend: { position: 'bottom' } },
      responsive: true
    }
  });
}

async function renderDailyReport(items, user, db) {
  const container = document.getElementById('dailyReport');
  if (!container) return;
  container.innerHTML = '<h3>Daily Completions</h3><canvas></canvas>';
  const ctx = container.querySelector('canvas').getContext('2d');
  let completionMap = {};
  if (user && db) {
    const snap = await db.collection('taskCompletions').doc(user.uid).get();
    completionMap = snap.exists ? snap.data() : {};
  }
  const labels = getLastNDates(7);
  const data = labels.map(d => (completionMap[d] || []).length);
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Tasks Done',
        data,
        fill: false,
        borderColor: '#3e95cd'
      }]
    },
    options: { responsive: true }
  });
}

function renderListsReport(lists) {
  const container = document.getElementById('listsReport');
  if (!container) return;
  if (!lists.length) {
    container.textContent = 'No lists yet.';
    return;
  }
  container.innerHTML = '<h3>List Sizes</h3><canvas></canvas>';
  const ctx = container.querySelector('canvas').getContext('2d');
  const labels = lists.map(l => l.name);
  const data = lists.map(l => (l.items || []).length);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Items',
        data,
        backgroundColor: '#5bc0de'
      }]
    },
    options: {
      responsive: true,
      scales: { y: { beginAtZero: true } }
    }
  });
}
