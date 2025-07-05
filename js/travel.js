import { db } from './auth.js';

let mapInitialized = false;
let travelData = [];

function latLngToPoint(lat, lon, width, height) {
  // Equirectangular projection for simple canvas map
  const x = (lon + 180) * (width / 360);
  const y = (90 - lat) * (height / 180);
  return { x, y };
}

export async function initTravelPanel() {
  const panel = document.getElementById('travelPanel');
  if (!panel || mapInitialized) return;
  mapInitialized = true;

  const canvas = document.getElementById('travelMap');
  const list = document.getElementById('travelList');
  const ctx = canvas.getContext('2d');

  try {
    const snap = await db.collection('travel').get();
    travelData = snap.docs.map(doc => doc.data());
    if (!travelData.length) {
      throw new Error('No travel docs');
    }
    localStorage.setItem('travelData', JSON.stringify(travelData));
  } catch (err) {
    console.warn('Falling back to local KML', err);
    const res = await fetch('assets/travel/doc.kml');
    const text = await res.text();
    travelData = parseKml(text);
    localStorage.setItem('travelData', JSON.stringify(travelData));
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    list.innerHTML = '';
    travelData.forEach(p => {
      const { x, y } = latLngToPoint(p.lat, p.lon, canvas.width, canvas.height);
      ctx.fillStyle = 'red';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
      const li = document.createElement('li');
      li.textContent = `${p.name} (${p.lat.toFixed(4)}, ${p.lon.toFixed(4)})`;
      list.append(li);
    });
  }

  document.getElementById('addPlaceBtn').addEventListener('click', async () => {
    const name = prompt('Place name:');
    const lat = parseFloat(prompt('Latitude:'));
    const lon = parseFloat(prompt('Longitude:'));
    if (!name || Number.isNaN(lat) || Number.isNaN(lon)) return;
    const place = { name, lat, lon };
    travelData.push(place);
    localStorage.setItem('travelData', JSON.stringify(travelData));
    try {
      await db.collection('travel').add(place);
    } catch (err) {
      console.error('Failed to save place to Firestore', err);
    }
    render();
  });

  render();
}

function parseKml(text) {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const placemarks = Array.from(doc.querySelectorAll('Placemark'));
  return placemarks.map(pm => {
    const name = pm.querySelector('name')?.textContent || 'Unknown';
    const coords = pm.querySelector('coordinates')?.textContent.trim() || '0,0,0';
    const [lon, lat] = coords.split(',').map(parseFloat);
    return { name, lat, lon };
  });
}

window.initTravelPanel = initTravelPanel;
