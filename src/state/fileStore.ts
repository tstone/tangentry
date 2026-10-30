// Files kept in this browser's IndexedDB, which (unlike localStorage) holds
// binary data and has room for large images.

const DB_NAME = 'tangentry'
const STORE = 'files'

let opening: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  return opening
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const request = action(db.transaction(STORE, mode).objectStore(STORE))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export const getFile = (key: string) => run<Blob | undefined>('readonly', (store) => store.get(key))
export const putFile = (key: string, file: Blob) => run('readwrite', (store) => store.put(file, key))
export const deleteFile = (key: string) => run('readwrite', (store) => store.delete(key))
