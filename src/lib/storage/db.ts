import type { BookContent, BookMeta, ReadingProgress } from '../book/types';

/**
 * Tiny promise wrapper over IndexedDB. Everything stays on this device.
 *
 *   books    — BookMeta (library listing, includes cover blob)
 *   content  — BookContent (processed tokens; loaded only when reading)
 *   progress — ReadingProgress
 *   files    — original EPUB blob, kept so books can be reprocessed when the tokenizer improves
 */

const DB_NAME = 'rsvp-reader';
const DB_VERSION = 1;
type StoreName = 'books' | 'content' | 'progress' | 'files';

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('content')) db.createObjectStore('content', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('progress')) db.createObjectStore('progress', { keyPath: 'bookId' });
      if (!db.objectStoreNames.contains('files')) db.createObjectStore('files');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await open();
  return request(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function listBooks(): Promise<BookMeta[]> {
  const db = await open();
  const books = (await request(db.transaction('books').objectStore('books').getAll())) as BookMeta[];
  return books.sort((a, b) => (b.lastOpenedAt ?? b.addedAt) - (a.lastOpenedAt ?? a.addedAt));
}

export async function listProgress(): Promise<Map<string, ReadingProgress>> {
  const db = await open();
  const all = (await request(db.transaction('progress').objectStore('progress').getAll())) as ReadingProgress[];
  return new Map(all.map((p) => [p.bookId, p]));
}

export const getBook = (id: string) => get<BookMeta>('books', id);
export const getContent = (id: string) => get<BookContent>('content', id);
export const getProgress = (id: string) => get<ReadingProgress>('progress', id);
export const getFile = (id: string) => get<Blob>('files', id);

export async function saveBook(meta: BookMeta, content: BookContent, file?: Blob): Promise<void> {
  const db = await open();
  const tx = db.transaction(['books', 'content', 'files'], 'readwrite');
  tx.objectStore('books').put(meta);
  tx.objectStore('content').put(content);
  if (file) tx.objectStore('files').put(file, meta.id);
  await done(tx);
}

export async function touchBook(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction('books', 'readwrite');
  const store = tx.objectStore('books');
  const meta = (await request(store.get(id))) as BookMeta | undefined;
  if (meta) store.put({ ...meta, lastOpenedAt: Date.now() });
  await done(tx);
}

export async function saveProgress(p: ReadingProgress): Promise<void> {
  const db = await open();
  const tx = db.transaction('progress', 'readwrite');
  tx.objectStore('progress').put(p);
  await done(tx);
}

export async function deleteBook(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(['books', 'content', 'progress', 'files'], 'readwrite');
  for (const s of ['books', 'content', 'progress', 'files'] as const) tx.objectStore(s).delete(id);
  await done(tx);
}
