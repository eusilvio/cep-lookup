import { KeyValueCache, KeyValueCacheOptions, KeyValueDriver } from '../kv';

/**
 * Structural subset of the IndexedDB API used by this adapter. Declared locally
 * so the library compiles without DOM lib types and so tests (or a polyfill such
 * as `fake-indexeddb`) can supply their own factory.
 */
export interface IDBRequestLike<T> {
  result: T;
  error: unknown;
  onsuccess: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
}

export interface IDBOpenRequestLike extends IDBRequestLike<IDBDatabaseLike> {
  onupgradeneeded: ((event: any) => void) | null;
}

export interface IDBObjectStoreLike {
  get(key: string): IDBRequestLike<any>;
  put(value: any): IDBRequestLike<any>;
  delete(key: string): IDBRequestLike<any>;
  clear(): IDBRequestLike<any>;
  getAllKeys(): IDBRequestLike<any[]>;
}

export interface IDBTransactionLike {
  objectStore(name: string): IDBObjectStoreLike;
}

export interface IDBDatabaseLike {
  objectStoreNames: { contains(name: string): boolean };
  createObjectStore(name: string, options?: { keyPath?: string }): IDBObjectStoreLike;
  transaction(storeName: string, mode?: 'readonly' | 'readwrite'): IDBTransactionLike;
  close(): void;
}

export interface IDBFactoryLike {
  open(name: string, version?: number): IDBOpenRequestLike;
}

export interface IndexedDBCacheOptions extends KeyValueCacheOptions {
  /** Database name. Default: `"cep-lookup"`. */
  dbName?: string;
  /** Object store name. Default: `"addresses"`. */
  storeName?: string;
  /** IndexedDB factory. Defaults to `globalThis.indexedDB`. */
  factory?: IDBFactoryLike;
}

interface StoredRecord {
  key: string;
  raw: string;
}

/** Bridges the event-based request API to promises. */
function promisifyRequest<T>(request: IDBRequestLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

function detectFactory(): IDBFactoryLike | undefined {
  const candidate = (globalThis as { indexedDB?: IDBFactoryLike }).indexedDB;
  if (!candidate || typeof candidate.open !== 'function') return undefined;
  return candidate;
}

/**
 * @class IndexedDBDriver
 * @description `KeyValueDriver` over IndexedDB. The connection is opened lazily
 * on the first operation and shared afterwards, so constructing the cache stays
 * synchronous and costs nothing until a lookup actually caches something.
 */
export class IndexedDBDriver implements KeyValueDriver {
  private connection?: Promise<IDBDatabaseLike>;

  constructor(
    private readonly factory: IDBFactoryLike,
    private readonly dbName: string,
    private readonly storeName: string
  ) {}

  private open(): Promise<IDBDatabaseLike> {
    if (!this.connection) {
      this.connection = new Promise<IDBDatabaseLike>((resolve, reject) => {
        const request = this.factory.open(this.dbName, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'key' });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
      }).catch((error) => {
        // Never memoize a failed connection: a later call may succeed (e.g. the
        // user leaves private browsing, or a blocking upgrade finishes).
        this.connection = undefined;
        throw error;
      });
    }
    return this.connection;
  }

  private async store(mode: 'readonly' | 'readwrite'): Promise<IDBObjectStoreLike> {
    const db = await this.open();
    return db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async get(key: string): Promise<string | null> {
    const store = await this.store('readonly');
    const record = (await promisifyRequest(store.get(key))) as StoredRecord | undefined;
    return record?.raw ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    const store = await this.store('readwrite');
    const record: StoredRecord = { key, raw: value };
    await promisifyRequest(store.put(record));
  }

  async delete(key: string): Promise<void> {
    const store = await this.store('readwrite');
    await promisifyRequest(store.delete(key));
  }

  async keys(): Promise<string[]> {
    const store = await this.store('readonly');
    const keys = await promisifyRequest(store.getAllKeys());
    return keys.map((key) => String(key));
  }

  /** Closes the shared connection. Idempotent. */
  async close(): Promise<void> {
    if (!this.connection) return;
    const pending = this.connection;
    this.connection = undefined;
    const db = await pending;
    db.close();
  }
}

/**
 * @class IndexedDBCache
 * @description Browser cache with room for far more entries than Web Storage,
 * and without blocking the main thread on every read. Use it when the app
 * resolves many CEPs (checkout flows, address books, admin panels); prefer
 * `WebStorageCache` for a handful of entries and simpler debugging.
 *
 * @example
 * const cache = new IndexedDBCache({ ttl: 7 * 24 * 60 * 60_000 });
 * const cep = new CepLookup({ providers, cache, staleIfError: true });
 */
export class IndexedDBCache extends KeyValueCache {
  private readonly idbDriver: IndexedDBDriver;

  constructor(options?: IndexedDBCacheOptions) {
    const factory = options?.factory ?? detectFactory();
    if (!factory) {
      throw new Error(
        'IndexedDBCache: no IndexedDB available. Pass `factory` explicitly (e.g. a polyfill) when running outside the browser.'
      );
    }
    const driver = new IndexedDBDriver(
      factory,
      options?.dbName ?? 'cep-lookup',
      options?.storeName ?? 'addresses'
    );
    super(driver, options);
    this.idbDriver = driver;
  }

  /** Releases the underlying database connection. */
  async close(): Promise<void> {
    await this.guard('close', () => this.idbDriver.close());
  }
}
