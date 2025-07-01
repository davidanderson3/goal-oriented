// File: stats.js

import { auth, db, getCurrentUser, FieldValue } from './auth.js';

/**
 * Returns today’s date key in YYYY-MM-DD using local time.
 */
function todayKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function ensureMoodConfig() {
  const user = getCurrentUser();
  if (!user) return [];
  const docRef = db.collection('users').doc(user.uid).collection('settings').doc('metricsConfig');
  const snap = await docRef.get();
  const current = snap.exists ? snap.data().metrics || [] : [];
  let updated = current;
  if (!updated.find(m => m.id === 'mood')) {
    updated = [{ id: 'mood', label: 'Mood Rating', unit: 'rating', direction: 'higher' }, ...updated];
  }
  if (!updated.find(m => m.id === 'count')) {
    updated = [...updated, { id: 'count', label: 'Count', unit: 'count', direction: 'higher' }];
  }
  if (!snap.exists) {
    await docRef.set({ metrics: updated }, { merge: true });
  }
  updated.forEach(m => {
    if (!('direction' in m)) m.direction = 'higher';
    applyUnitLabels(m);
  });
  return updated;
}




/** FIRESTORE LOADERS & SAVERS **/
async function loadMetricsConfig() {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const snap = await db
    .collection('users').doc(user.uid)
    .collection('settings').doc('metricsConfig')
    .get();
  return snap.exists ? snap.data().metrics : [];
}

async function saveMetricsConfig(metrics) {
  await safeSaveMetricsConfig(() => metrics);
}

/**
 * Safely saves metricsConfig by merging into the existing doc.
 *
 * @param {(oldCfg: Array) => Array} merger
 *   A function that receives the *existing* metrics array and returns the new one.
 */
async function safeSaveMetricsConfig(merger) {
  const user = getCurrentUser();
  if (!user) return;

  // 1) Load whatever is currently saved
  const docRef = db
    .collection('users').doc(user.uid)
    .collection('settings').doc('metricsConfig');
  const snap = await docRef.get();
  const oldMetrics = snap.exists ? snap.data().metrics || [] : [];

  // 2) Let caller produce the updated array
  const newMetrics = merger(oldMetrics.slice());

  // 3) Only write *if* something actually changed
  const same =
    oldMetrics.length === newMetrics.length &&
    oldMetrics.every((m, i) => JSON.stringify(m) === JSON.stringify(newMetrics[i]));
  if (same) return;

  // 4) Merge-write back your new array
  await docRef.set({ metrics: newMetrics }, { merge: true });
}

/**
 * Save a metric entry (with local-date key) for the current user.
 *
 * @param {string} metricId
 * @param {number|string} value
 * @param {any} extra
 */
async function recordMetric(metricId, value, extra = null) {
  const user = getCurrentUser();
  if (!user) return;

  // Use local-date key for grouping
  const ref = db
    .collection('users').doc(user.uid)
    .collection('dailyStats').doc(todayKey());

  const entry = {
    timestamp: Date.now(),
    value,
    extra
  };

  await ref.set({
    metrics: {
      [metricId]: FieldValue.arrayUnion(entry)
    }
  }, { merge: true });
}

async function loadAllStats() {
  const user = auth.currentUser;
  if (!user) return {};
  const snaps = await db
    .collection('users').doc(user.uid)
    .collection('dailyStats')
    .get();
  const out = {};
  snaps.forEach(doc => out[doc.id] = doc.data().metrics || {});
  return out;
}

function computeRank(val, allValues, direction) {
  if (!allValues.length) return '—';
  const sorted = allValues.slice().sort((a, b) => direction === 'lower' ? a - b : b - a);
  const index = sorted.findIndex(v => v === val);
  return index >= 0 ? `${index + 1}/${sorted.length}` : '—';
}




/** PERCENTILE & SUMMARY RENDER **/
function computePercentile(val, allValues) {
  const sorted = allValues.slice().sort((a, b) => a - b);
  const below = sorted.filter(v => v < val).length;
  return Math.round((below / sorted.length) * 100);
}

function applyUnitLabels(cfg) {
  cfg.unitLabel = {
    pounds: 'pounds',
    rating: 'rating out of 10',
    minutes: 'minutes',
    time_mmss: 'minutes and seconds',
    list: 'list',
    count: 'count'
  }[cfg.unit] || cfg.unit;
}

let metricChartInstance = null;

async function showMetricGraph(cfg) {
  const allStats = await loadAllStats();
  const labels = [];
  const data = [];
  Object.keys(allStats).sort().forEach(date => {
    const entries = (allStats[date][cfg.id] || []).filter(e => !(e.extra && e.extra.postponed));
    if (!entries.length) return;
    const latest = entries.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
    let val = latest.value;
    if (cfg.unit === 'list' && typeof val === 'string') {
      val = val.split('\n').filter(l => l.trim()).length;
    }
    labels.push(date);
    data.push(val);
  });

  const modal = document.getElementById('metricChartModal');
  const canvas = document.getElementById('metricChartCanvas');
  if (metricChartInstance) metricChartInstance.destroy();
  metricChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: cfg.label,
        data,
        fill: false,
        borderColor: '#3e95cd'
      }]
    },
    options: { responsive: true }
  });
  modal.style.display = 'flex';
}

async function renderStatsSummary() {
  const config = await loadMetricsConfig();
  config.forEach(cfg => {
    if (!('direction' in cfg)) cfg.direction = 'higher';
    applyUnitLabels(cfg);
  });
  const allStats = await loadAllStats();
  const unitByMetric = config.reduce((a, m) => (a[m.id] = m.unit, a), {});
  const valuesByMetric = {};
  Object.values(allStats).forEach(day => {
    Object.entries(day).forEach(([id, entries]) => {
      const latest = entries.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
      let v = latest.value;
      if (unitByMetric[id] === 'list' && typeof v === 'string') {
        v = v.split('\n').filter(l => l.trim()).length;
      }
      (valuesByMetric[id] = valuesByMetric[id] || []).push(v);
    });
  });
  const container = document.getElementById('genericStatsSummary');
  Object.assign(container.style, { width: '100%', maxWidth: '100%', padding: '0', margin: '0' });
  container.innerHTML = '';
  const table = document.createElement('table');
  Object.assign(table.style, { width: '100%', borderCollapse: 'collapse', marginTop: '16px' });
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  // header row
  ['Metric', 'Today’s Value', 'Rank', 'Percentile', 'Average', 'Actions'].forEach(text => {
    const th = document.createElement('th');
    th.textContent = text;
    Object.assign(th.style, { borderBottom: '2px solid #444', textAlign: 'left', padding: '8px' });
    headerRow.appendChild(th);
  });

  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  const today = todayKey();
  let visible = 0, filled = 0;
  for (const cfg of config) {
    const entries = ((allStats[today] || {})[cfg.id]) || [];
    if (entries.some(e => e.extra && e.extra.postponed)) continue;
    visible++;
    let display = '—', pct = '—', rank = '—';
    if (entries.length) {
      filled++;
      const latest = entries.reduce((a, b) => a.timestamp > b.timestamp ? a : b);
      let val;
      if (cfg.unit === 'time_mmss') {
        const m = Math.floor(latest.value), s = String(Math.round((latest.value - m) * 60)).padStart(2, '0');
        display = `${m}:${s}`; val = latest.value;
      } else if (cfg.unit === 'list' && typeof latest.value === 'string') {
        display = latest.value; val = latest.value.split('\n').filter(l => l.trim()).length;
      } else {
        display = `${latest.value}`; val = latest.value;
      }
      const allVals = valuesByMetric[cfg.id] || [];
      const raw = computePercentile(val, allVals);
      pct = `${cfg.direction === 'lower' ? 100 - raw : raw}th`;
      console.log('Averaging for', cfg.id, 'values:', valuesByMetric[cfg.id]);
      rank = computeRank(val, allVals, cfg.direction);
    }
    const row = document.createElement('tr');
    const td1 = document.createElement('td');
    td1.textContent = cfg.label;
    Object.assign(td1.style, { padding: '8px', borderBottom: '1px solid #ddd', cursor: 'pointer', textDecoration: 'underline' });
    td1.addEventListener('click', () => showMetricGraph(cfg));
    row.appendChild(td1);
    // inside renderStatsSummary(), in the Today’s Value cell:
    const td2 = document.createElement('td');
    Object.assign(td2.style, { padding: '8px', borderBottom: '1px solid #ddd' });
    const span = document.createElement('span');
    span.textContent = `${display} ${cfg.unitLabel}`;
    span.style.marginRight = '8px';
    td2.appendChild(span);
    const valueEdit = document.createElement('span');
    valueEdit.textContent = '✏️';
    valueEdit.style.cursor = 'pointer';
    valueEdit.addEventListener('click', async () => {
      td2.innerHTML = '';
      let inp;
      if (cfg.unit === 'rating') {
        inp = document.createElement('input');
        inp.type = 'number';
        inp.min = '1';
        inp.max = '10';
        inp.step = '1';
        inp.placeholder = '1–10';
      } else if (cfg.unit === 'list') {
        inp = document.createElement('textarea');
        inp.rows = 4;
        inp.style.width = '100%';
        inp.placeholder = cfg.unitLabel;
      } else {
        inp = document.createElement('input');
        inp.type = 'text';
        inp.placeholder = cfg.unitLabel;
      }
      inp.value = display;
      td2.appendChild(inp);
      const saveIcon = document.createElement('span');
      saveIcon.textContent = '💾';
      saveIcon.style.cursor = 'pointer';
      saveIcon.style.marginLeft = '8px';
      saveIcon.addEventListener('click', async () => {
        const raw = inp.value.trim();
        let v;
        if (!raw) return alert('Enter a value');
        if (cfg.unit === 'time_mmss') {
          const [m, s] = raw.split(':').map(n => parseInt(n, 10));
          if (isNaN(m) || isNaN(s)) return alert('Bad MM:SS');
          v = m + s / 60;
        } else if (cfg.unit === 'rating') {
          v = parseInt(raw, 10);
          if (isNaN(v) || v < 1 || v > 10) return alert('Enter 1–10');
        } else if (cfg.unit === 'list') {
          v = raw;
        } else {
          v = parseFloat(raw);
          if (isNaN(v)) return alert('Invalid number');
        }
        await recordMetric(cfg.id, v, null);
        await renderStatsSummary();
      });
      td2.appendChild(saveIcon);
      const cancel = document.createElement('span');
      cancel.textContent = '❌';
      cancel.style.cursor = 'pointer';
      cancel.style.marginLeft = '4px';
      cancel.addEventListener('click', () => renderStatsSummary());
      td2.appendChild(cancel);
    });
    td2.appendChild(valueEdit);
    row.appendChild(td2);

    const td3 = document.createElement('td');
    td3.textContent = rank;
    Object.assign(td3.style, { padding: '8px', borderBottom: '1px solid #ddd' });
    row.appendChild(td3);
    const td4 = document.createElement('td');
    td4.textContent = pct;
    Object.assign(td4.style, { padding: '8px', borderBottom: '1px solid #ddd' });
    row.appendChild(td4);
    const rawVals = valuesByMetric[cfg.id] || [];
    const numericVals = rawVals.filter(v => typeof v === 'number' && !isNaN(v));
    const avg = numericVals.length
      ? (numericVals.reduce((sum, v) => sum + v, 0) / numericVals.length).toFixed(2)
      : '—';
    const tdAvg = document.createElement('td');
    tdAvg.textContent = avg;
    Object.assign(tdAvg.style, { padding: '8px', borderBottom: '1px solid #ddd' });
    row.appendChild(tdAvg);

    const td6 = document.createElement('td');
    Object.assign(td6.style, { padding: '8px', borderBottom: '1px solid #ddd' });

    const postpone = document.createElement('span');
    postpone.textContent = '⏭️';
    postpone.style.cursor = 'pointer';
    postpone.addEventListener('click', async () => {
      await recordMetric(cfg.id, null, { postponed: true });
      await renderStatsSummary();
    });
    td6.appendChild(postpone);

    const configEdit = document.createElement('span');
    configEdit.textContent = '✏️';
    configEdit.style.cursor = 'pointer';
    configEdit.style.marginLeft = '8px';
    configEdit.addEventListener('click', () => renderConfigForm(cfg));
    td6.appendChild(configEdit);

    if (cfg.id !== 'mood') {
      const del = document.createElement('span');
      del.textContent = '❌';
      del.style.cursor = 'pointer';
      del.style.marginLeft = '8px';
      del.addEventListener('click', async () => {
        await saveMetricsConfig((await loadMetricsConfig()).filter(m => m.id !== cfg.id));
        await renderConfigForm();
        await renderStatsSummary();
      });
      td6.appendChild(del);
    }

    row.appendChild(td6);

    tbody.appendChild(row);
  }
  table.appendChild(tbody);
  container.appendChild(table);
  if (visible && visible === filled) {
    table.classList.add('all-complete');
    setTimeout(() => table.classList.remove('all-complete'), 2500);
  }
}



async function renderConfigForm(metricToEdit = null) {
  let config = await loadMetricsConfig();
  config = await ensureMoodConfig();
  config.forEach(m => { if (!('direction' in m)) m.direction = 'higher'; applyUnitLabels(m); });

  const section = document.getElementById('metricsConfigSection');
  section.innerHTML =
    '<button id="showConfigBtn" style="margin-bottom:12px;">' +
    (metricToEdit ? '✏️ Edit Metric' : '➕ Add New Metric') +
    '</button>' +
    '<div id="configFormContainer" style="display:none;"></div>';

  const formContainer = document.getElementById('configFormContainer');
  const showBtn = document.getElementById('showConfigBtn');

  showBtn.addEventListener('click', () => {
    const labelVal = metricToEdit ? metricToEdit.label : '';
    const unitVal = metricToEdit ? metricToEdit.unit : 'pounds';
    const dirVal = metricToEdit ? metricToEdit.direction : 'higher';

    formContainer.innerHTML =
      `<form id="configForm">` +
      `<input type="text" id="metricLabel" value="${labelVal}" required style="margin-right:8px;">` +
      `<select id="metricUnit" required style="margin:0 8px;">` +
      `<option value="pounds"${unitVal === 'pounds' ? ' selected' : ''}>pounds</option>` +
      `<option value="rating"${unitVal === 'rating' ? ' selected' : ''}>rating out of 10</option>` +
      `<option value="minutes"${unitVal === 'minutes' ? ' selected' : ''}>minutes</option>` +
      `<option value="time_mmss"${unitVal === 'time_mmss' ? ' selected' : ''}>MM:SS</option>` +
      `<option value="list"${unitVal === 'list' ? ' selected' : ''}>list</option>` +
      `<option value="count"${unitVal === 'count' ? ' selected' : ''}>count</option>` +
      `</select>` +
      `<select id="metricDirection" required style="margin:0 8px;">` +
      `<option value="higher"${dirVal === 'higher' ? ' selected' : ''}>Higher is better</option>` +
      `<option value="lower"${dirVal === 'lower' ? ' selected' : ''}>Lower is better</option>` +
      `</select>` +
      `<button type="submit">${metricToEdit ? 'Save Changes' : 'Add Metric'}</button>` +
      `<button type="button" id="cancelConfig" style="margin-left:8px;">✖️</button>` +
      `</form>`;

    formContainer.style.display = 'block';
    showBtn.disabled = true;

    document.getElementById('cancelConfig').addEventListener('click', () => {
      formContainer.style.display = 'none';
      showBtn.disabled = false;
      formContainer.innerHTML = '';
    });

    document.getElementById('configForm').addEventListener('submit', async e => {
      e.preventDefault();
      const label = document.getElementById('metricLabel').value.trim();
      const unit = document.getElementById('metricUnit').value;
      const dir = document.getElementById('metricDirection').value;
      if (!label || !unit || !dir) return alert('Please enter all fields');
      const id = metricToEdit ? metricToEdit.id : label.toLowerCase().replace(/\W+/g, '_');
      const newMetric = { id, label, unit, direction: dir };
      const oldCfg = await loadMetricsConfig();
      const filtered = oldCfg.filter(m => m.id !== id);
      await saveMetricsConfig([...filtered, newMetric]);
      formContainer.style.display = 'none';
      showBtn.disabled = false;
      formContainer.innerHTML = '';
      await renderConfigForm();
      await renderStatsSummary();
    });
  });

  if (metricToEdit) showBtn.click();
}



export async function initMetricsUI() {
  await ensureMoodConfig();
  await renderStatsSummary();
  await renderConfigForm();
}

auth.onAuthStateChanged(user => {
  if (!user) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMetricsUI);
  } else {
    initMetricsUI();
  }
});

window._statsDebug = {
  loadMetricsConfig,
  renderStatsSummary,
  renderConfigForm
};

const metricModal = document.getElementById('metricChartModal');
if (metricModal) {
  metricModal.addEventListener('click', e => {
    if (e.target === metricModal) metricModal.style.display = 'none';
  });
}
