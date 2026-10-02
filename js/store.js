// Kustom's saved groups live in IndexedDB, which can hold real audio files
// and survives closing and reopening the app.
//
//   groups: { id, name, color, order }
//   sounds: { id, groupId, name, blob, duration, order }

const DB_NAME = 'kustom-audio';
const DB_VERSION = 1;
let connection = null;

function open() {
  connection ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('groups', { keyPath: 'id' });
      db.createObjectStore('sounds', { keyPath: 'id' }).createIndex('groupId', 'groupId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return connection;
}

/** Runs `work` against the named stores and resolves once everything is committed. */
async function transaction(names, mode, work) {
  const tx = (await open()).transaction(names, mode);
  const result = work(...names.map(name => tx.objectStore(name)));
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
  return result;
}

/** Ask the browser not to clear our data when the device runs low on space. */
let persistenceRequested = false;
function keepData() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  navigator.storage?.persist?.().catch(() => {});
}

const byOrder = (a, b) => a.order - b.order;

/** Every group, in order, each with its own sounds in order. */
export async function loadGroups() {
  const [groups, sounds] = await transaction(['groups', 'sounds'], 'readonly',
    (groupStore, soundStore) => [groupStore.getAll(), soundStore.getAll()]);

  return groups.result.sort(byOrder).map(group => ({
    ...group,
    sounds: sounds.result.filter(sound => sound.groupId === group.id).sort(byOrder),
  }));
}

export function saveGroup({ sounds, ...group }) {
  keepData();
  return transaction(['groups'], 'readwrite', store => { store.put(group); });
}

export function saveSound(sound) {
  keepData();
  return transaction(['sounds'], 'readwrite', store => { store.put(sound); });
}

export function deleteSound(id) {
  return transaction(['sounds'], 'readwrite', store => { store.delete(id); });
}

/** Deletes the group and every sound in it, all or nothing. */
export function deleteGroup(id) {
  return transaction(['groups', 'sounds'], 'readwrite', (groups, sounds) => {
    groups.delete(id);
    const cursor = sounds.index('groupId').openKeyCursor(IDBKeyRange.only(id));
    cursor.onsuccess = () => {
      if (!cursor.result) return;
      sounds.delete(cursor.result.primaryKey);
      cursor.result.continue();
    };
  });
}
