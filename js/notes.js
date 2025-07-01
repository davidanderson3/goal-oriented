import { db } from './auth.js';
import { generateId } from './helpers.js';
import { SAMPLE_NOTES } from "./sampleData.js";
let demoNotes = SAMPLE_NOTES.slice();


async function loadNotes() {
  const user = firebase.auth().currentUser;
  if (!user) {
    return demoNotes;
  }
  const uid = user.uid;
  const snapshot = await db
    .collection('dailyNotes')
    .doc(uid)
    .collection('notes')
    .orderBy('timestamp', 'desc')
    .limit(10)
    .get();
  return snapshot.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      text: data.text,
      timestamp: data.timestamp?.toDate().toISOString() || new Date().toISOString()
    };
  });
}

async function saveNote(text) {
  const user = firebase.auth().currentUser;
  if (!user) {
    const note = { id: generateId(), text, timestamp: new Date().toISOString() };
    demoNotes.unshift(note);
    return;
  }
  const uid = user.uid;
  await db
    .collection('dailyNotes')
    .doc(uid)
    .collection('notes')
    .add({
      text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
}

function initNotesSection() {
  const container = document.getElementById('notesPanel');
  container.innerHTML = '';

  const list = document.createElement('div');
  list.id = 'notesList';
  container.appendChild(list);

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'notesInput';
  input.placeholder = 'Enter note…';
  container.appendChild(input);

  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add Note';
  container.appendChild(addBtn);

  addBtn.addEventListener('click', async () => {
    const text = input.value.trim();
    if (!text) return;
    await saveNote(text);
    input.value = '';
    await renderNotesList(list);
  });

  return list;
}

async function renderNotesList(list) {
  const notes = await loadNotes();
  list.innerHTML = '';
  notes.forEach(note => {
    const item = document.createElement('div');
    const time = document.createElement('span');
    time.textContent = new Date(note.timestamp).toLocaleString();
    const text = document.createElement('span');
    text.textContent = note.text;
    item.append(time, document.createTextNode(' – '), text);
    list.appendChild(item);
  });
}

export async function renderNotesPanel() {
  const list = initNotesSection();
  await renderNotesList(list);
}