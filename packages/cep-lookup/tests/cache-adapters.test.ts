import {
  KeyValueCache,
  KeyValueDriver,
  WebStorageCache,
  WebStorageLike,
  IndexedDBCache,
  IDBFactoryLike,
  RedisCache,
  RedisLikeClient,
  CloudflareKVCache,
  KVNamespaceLike,
  encodeEntry,
} from '../src/cache';
import { CepLookup } from '../src';
import { Address, Provider } from '../src/types';

const address: Address = {
  cep: '01001000',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Sé',
  street: 'Praça da Sé',
  service: 'test',
};

const otherAddress: Address = { ...address, cep: '20040020', state: 'RJ', city: 'Rio de Janeiro' };

// --- Fakes -------------------------------------------------------------

/** In-memory driver with knobs for the failure paths. */
class FakeDriver implements KeyValueDriver {
  store = new Map<string, string>();
  failOn = new Set<string>();
  lastEvictAfterMs?: number;

  get(key: string) {
    if (this.failOn.has('get')) throw new Error('driver get failed');
    return this.store.get(key) ?? null;
  }
  set(key: string, value: string, evictAfterMs?: number) {
    if (this.failOn.has('set')) throw new Error('driver set failed');
    this.lastEvictAfterMs = evictAfterMs;
    this.store.set(key, value);
  }
  delete(key: string) {
    this.store.delete(key);
  }
  keys() {
    return [...this.store.keys()];
  }
}

class FakeStorage implements WebStorageLike {
  private map = new Map<string, string>();
  /** When set, `setItem` throws until enough entries are removed. */
  quotaLimit = Infinity;

  get length() {
    return this.map.size;
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (!this.map.has(key) && this.map.size >= this.quotaLimit) {
      const error = new Error('QuotaExceededError');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

/** Minimal IndexedDB good enough for the adapter's request/transaction dance. */
function createFakeIndexedDB(): IDBFactoryLike & { data: Map<string, any> } {
  const data = new Map<string, any>();
  const request = <T>(result: T) => {
    const req: any = { result, error: null, onsuccess: null, onerror: null };
    queueMicrotask(() => req.onsuccess?.({}));
    return req;
  };
  const store = {
    get: (key: string) => request(data.get(key)),
    put: (value: any) => request(data.set(value.key, value)),
    delete: (key: string) => request(data.delete(key)),
    clear: () => request(data.clear()),
    getAllKeys: () => request([...data.keys()]),
  };
  const db = {
    objectStoreNames: { contains: () => false },
    createObjectStore: () => store,
    transaction: () => ({ objectStore: () => store }),
    close: jest.fn(),
  };
  return {
    data,
    open: () => {
      const req: any = { result: db, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      queueMicrotask(() => {
        req.onupgradeneeded?.({});
        req.onsuccess?.({});
      });
      return req;
    },
  };
}

/** ioredis-flavoured client: variadic `SET key value PX ms`. */
function createIoredisLike() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    store,
    ttls,
    client: {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string, ...args: any[]) => {
        if (args.length && typeof args[0] !== 'string') {
          throw new TypeError('ioredis expects variadic arguments');
        }
        if (args[0] === 'PX') ttls.set(key, args[1]);
        store.set(key, value);
        return 'OK';
      },
      del: async (key: string) => store.delete(key),
      scan: async (cursor: any, _match: string, pattern: string) => {
        const matcher = new RegExp(`^${pattern.replace('*', '.*')}$`);
        return ['0', [...store.keys()].filter((k) => matcher.test(k))] as [string, string[]];
      },
    } as RedisLikeClient,
  };
}

/** node-redis-flavoured client: options object, rejects the variadic form. */
function createNodeRedisLike() {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  return {
    store,
    ttls,
    client: {
      get: async (key: string) => store.get(key) ?? null,
      set: async (key: string, value: string, options?: any) => {
        if (typeof options === 'string') throw new TypeError('node-redis expects an options object');
        if (options?.PX) ttls.set(key, options.PX);
        store.set(key, value);
        return 'OK';
      },
      del: async (key: string) => store.delete(key),
      keys: async (pattern: string) => {
        const matcher = new RegExp(`^${pattern.replace('*', '.*')}$`);
        return [...store.keys()].filter((k) => matcher.test(k));
      },
    } as RedisLikeClient,
  };
}

function createFakeKV(pageSize = 1000) {
  const store = new Map<string, string>();
  const ttls = new Map<string, number>();
  const kv: KVNamespaceLike = {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value, options) => {
      if (options?.expirationTtl !== undefined) ttls.set(key, options.expirationTtl);
      store.set(key, value);
    },
    delete: async (key) => void store.delete(key),
    list: async (options) => {
      const all = [...store.keys()].filter((k) => k.startsWith(options?.prefix ?? '')).sort();
      const start = options?.cursor ? Number(options.cursor) : 0;
      const page = all.slice(start, start + pageSize);
      const nextIndex = start + page.length;
      const complete = nextIndex >= all.length;
      return {
        keys: page.map((name) => ({ name })),
        list_complete: complete,
        cursor: complete ? undefined : String(nextIndex),
      };
    },
  };
  return { store, ttls, kv };
}

// --- KeyValueCache core ------------------------------------------------

describe('KeyValueCache', () => {
  it('round-trips an address through the driver', async () => {
    const driver = new FakeDriver();
    const cache = new KeyValueCache(driver);
    await cache.set('01001000', address);
    expect(await cache.get('01001000')).toEqual(address);
  });

  it('namespaces every key it writes', async () => {
    const driver = new FakeDriver();
    const cache = new KeyValueCache(driver, { namespace: 'checkout' });
    await cache.set('01001000', address);
    expect(driver.keys()).toEqual(['checkout:01001000']);
  });

  it('preserves the negative-cache marker written by CepLookup', async () => {
    const driver = new FakeDriver();
    const cache = new KeyValueCache(driver);
    const marker = { __cepLookupNotFound: true, cep: '99999999', expiresAt: 123 } as unknown as Address;
    await cache.set('99999999', marker);
    expect(await cache.get('99999999')).toEqual(marker);
  });

  it('reports a miss for missing keys', async () => {
    expect(await new KeyValueCache(new FakeDriver()).get('nope')).toBeUndefined();
  });

  describe('ttl', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('serves entries within the ttl', async () => {
      const cache = new KeyValueCache(new FakeDriver(), { ttl: 5000 });
      await cache.set('01001000', address);
      jest.advanceTimersByTime(4999);
      expect(await cache.get('01001000')).toEqual(address);
    });

    it('treats entries past the ttl as a miss', async () => {
      const cache = new KeyValueCache(new FakeDriver(), { ttl: 5000 });
      await cache.set('01001000', address);
      jest.advanceTimersByTime(5001);
      expect(await cache.get('01001000')).toBeUndefined();
      expect(await cache.has('01001000')).toBe(false);
    });

    it('still returns expired entries through getStale, with age metadata', async () => {
      const cache = new KeyValueCache(new FakeDriver(), { ttl: 5000 });
      await cache.set('01001000', address);
      jest.advanceTimersByTime(9000);
      const stale = await cache.getStale('01001000');
      expect(stale).toEqual({ value: address, isStale: true, ageMs: 9000 });
    });

    it('marks fresh entries as not stale', async () => {
      const cache = new KeyValueCache(new FakeDriver(), { ttl: 5000 });
      await cache.set('01001000', address);
      jest.advanceTimersByTime(1000);
      expect((await cache.getStale('01001000'))?.isStale).toBe(false);
    });
  });

  it('forwards evictAfter to the driver as a physical expiry hint', async () => {
    const driver = new FakeDriver();
    const cache = new KeyValueCache(driver, { ttl: 1000, evictAfter: 60_000 });
    await cache.set('01001000', address);
    expect(driver.lastEvictAfterMs).toBe(60_000);
  });

  it('drops corrupt payloads instead of throwing', async () => {
    const driver = new FakeDriver();
    driver.store.set('cep-lookup:01001000', '{not json');
    const cache = new KeyValueCache(driver);
    expect(await cache.get('01001000')).toBeUndefined();
    expect(driver.store.has('cep-lookup:01001000')).toBe(false);
  });

  it('ignores payloads written by other code under the same key', async () => {
    const driver = new FakeDriver();
    driver.store.set('cep-lookup:01001000', JSON.stringify({ some: 'other shape' }));
    expect(await new KeyValueCache(driver).get('01001000')).toBeUndefined();
  });

  it('never lets a driver failure break a lookup', async () => {
    const driver = new FakeDriver();
    const onError = jest.fn();
    const cache = new KeyValueCache(driver, { onError });
    driver.failOn.add('set');
    await expect(cache.set('01001000', address)).resolves.toBeUndefined();
    driver.failOn.add('get');
    await expect(cache.get('01001000')).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls.map(([, op]) => op)).toEqual(['set', 'get']);
  });

  it('swallows driver failures even without an onError hook', async () => {
    const driver = new FakeDriver();
    driver.failOn.add('get');
    await expect(new KeyValueCache(driver).get('01001000')).resolves.toBeUndefined();
  });

  describe('clear', () => {
    it('deletes only namespaced keys when the driver has no native wipe', async () => {
      const driver = new FakeDriver();
      driver.store.set('unrelated:key', 'keep me');
      const cache = new KeyValueCache(driver);
      await cache.set('01001000', address);
      await cache.clear();
      expect(driver.keys()).toEqual(['unrelated:key']);
    });

    it('prefers the driver native wipe', async () => {
      const driver = new FakeDriver();
      const nativeClear = jest.fn();
      (driver as KeyValueDriver).clear = nativeClear;
      await new KeyValueCache(driver).clear();
      expect(nativeClear).toHaveBeenCalled();
    });

    it('reports an error when the driver supports neither clear nor keys', async () => {
      const onError = jest.fn();
      const minimal: KeyValueDriver = { get: () => null, set: () => {}, delete: () => {} };
      await new KeyValueCache(minimal, { onError }).clear();
      expect(onError).toHaveBeenCalledWith(expect.any(Error), 'clear');
    });
  });
});

// --- WebStorageCache ---------------------------------------------------

describe('WebStorageCache', () => {
  it('survives a page reload (a new instance over the same storage)', async () => {
    const storage = new FakeStorage();
    await new WebStorageCache({ storage }).set('01001000', address);
    expect(await new WebStorageCache({ storage }).get('01001000')).toEqual(address);
  });

  it('evicts the oldest entries past maxSize', async () => {
    jest.useFakeTimers();
    const storage = new FakeStorage();
    const cache = new WebStorageCache({ storage, maxSize: 2 });
    await cache.set('11111111', address);
    jest.advanceTimersByTime(10);
    await cache.set('22222222', address);
    jest.advanceTimersByTime(10);
    await cache.set('33333333', address);
    expect(await cache.get('11111111')).toBeUndefined();
    expect(await cache.get('22222222')).toEqual(address);
    expect(await cache.get('33333333')).toEqual(address);
    jest.useRealTimers();
  });

  it('frees its own space and retries when the store is full', async () => {
    jest.useFakeTimers();
    const storage = new FakeStorage();
    const onError = jest.fn();
    const cache = new WebStorageCache({ storage, onError });
    for (const cep of ['11111111', '22222222', '33333333', '44444444', '55555555']) {
      await cache.set(cep, address);
      jest.advanceTimersByTime(10);
    }
    storage.quotaLimit = 5;
    await cache.set('66666666', otherAddress);
    expect(onError).not.toHaveBeenCalled();
    expect(await cache.get('66666666')).toEqual(otherAddress);
    expect(await cache.get('11111111')).toBeUndefined();
    jest.useRealTimers();
  });

  it('leaves keys owned by other code untouched on clear', async () => {
    const storage = new FakeStorage();
    storage.setItem('app:session', 'keep me');
    const cache = new WebStorageCache({ storage });
    await cache.set('01001000', address);
    await cache.clear();
    expect(storage.getItem('app:session')).toBe('keep me');
    expect(await cache.get('01001000')).toBeUndefined();
  });

  it('explains itself when no Web Storage exists', () => {
    expect(() => new WebStorageCache()).toThrow(/no Web Storage available/);
  });

  it('uses globalThis.localStorage when no storage is passed', async () => {
    const storage = new FakeStorage();
    (globalThis as any).localStorage = storage;
    try {
      await new WebStorageCache().set('01001000', address);
      expect(storage.getItem('cep-lookup:01001000')).toContain('01001000');
    } finally {
      delete (globalThis as any).localStorage;
    }
  });
});

// --- IndexedDBCache ----------------------------------------------------

describe('IndexedDBCache', () => {
  it('round-trips an address', async () => {
    const factory = createFakeIndexedDB();
    const cache = new IndexedDBCache({ factory });
    await cache.set('01001000', address);
    expect(await cache.get('01001000')).toEqual(address);
  });

  it('opens the database once and reuses the connection', async () => {
    const factory = createFakeIndexedDB();
    const open = jest.spyOn(factory, 'open');
    const cache = new IndexedDBCache({ factory });
    await cache.set('01001000', address);
    await cache.get('01001000');
    await cache.delete('01001000');
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('clears only its own namespace', async () => {
    const factory = createFakeIndexedDB();
    factory.data.set('other:key', { key: 'other:key', raw: 'keep me' });
    const cache = new IndexedDBCache({ factory });
    await cache.set('01001000', address);
    await cache.clear();
    expect([...factory.data.keys()]).toEqual(['other:key']);
  });

  it('closes the connection on demand', async () => {
    const factory = createFakeIndexedDB();
    const cache = new IndexedDBCache({ factory });
    await cache.set('01001000', address);
    await expect(cache.close()).resolves.toBeUndefined();
    await cache.set('01001000', address);
    expect(await cache.get('01001000')).toEqual(address);
  });

  it('explains itself when no IndexedDB exists', () => {
    expect(() => new IndexedDBCache()).toThrow(/no IndexedDB available/);
  });
});

// --- RedisCache --------------------------------------------------------

describe('RedisCache', () => {
  it('round-trips an address through an ioredis-style client', async () => {
    const { client } = createIoredisLike();
    const cache = new RedisCache({ client });
    await cache.set('01001000', address);
    expect(await cache.get('01001000')).toEqual(address);
  });

  it('passes evictAfter as PX on the variadic dialect', async () => {
    const { client, ttls } = createIoredisLike();
    await new RedisCache({ client, evictAfter: 60_000 }).set('01001000', address);
    expect(ttls.get('cep-lookup:01001000')).toBe(60_000);
  });

  it('falls back to the options dialect for node-redis style clients', async () => {
    const { client, ttls } = createNodeRedisLike();
    const onError = jest.fn();
    const cache = new RedisCache({ client, evictAfter: 60_000, onError });
    await cache.set('01001000', address);
    expect(onError).not.toHaveBeenCalled();
    expect(ttls.get('cep-lookup:01001000')).toBe(60_000);
  });

  it('remembers the detected dialect instead of retrying every write', async () => {
    const { client } = createNodeRedisLike();
    const set = jest.spyOn(client, 'set');
    const cache = new RedisCache({ client, evictAfter: 60_000 });
    await cache.set('01001000', address);
    await cache.set('20040020', otherAddress);
    // 2 calls for the first write (variadic probe + options), 1 for the second.
    expect(set).toHaveBeenCalledTimes(3);
  });

  it('honours an explicit dialect without probing', async () => {
    const { client } = createNodeRedisLike();
    const set = jest.spyOn(client, 'set');
    await new RedisCache({ client, dialect: 'options', evictAfter: 60_000 }).set('01001000', address);
    expect(set).toHaveBeenCalledTimes(1);
  });

  it('clears the namespace with SCAN when available', async () => {
    const { client, store } = createIoredisLike();
    store.set('other:key', 'keep me');
    const cache = new RedisCache({ client });
    await cache.set('01001000', address);
    await cache.clear();
    expect([...store.keys()]).toEqual(['other:key']);
  });

  it('falls back to KEYS when the client has no SCAN', async () => {
    const { client, store } = createNodeRedisLike();
    const cache = new RedisCache({ client });
    await cache.set('01001000', address);
    await cache.clear();
    expect([...store.keys()]).toEqual([]);
  });

  it('reports rather than throws when the client cannot enumerate keys', async () => {
    const onError = jest.fn();
    const bare: RedisLikeClient = {
      get: async () => null,
      set: async () => 'OK',
      del: async () => 1,
    };
    await new RedisCache({ client: bare, onError }).clear();
    expect(onError).toHaveBeenCalledWith(expect.any(Error), 'clear');
  });
});

// --- CloudflareKVCache -------------------------------------------------

describe('CloudflareKVCache', () => {
  it('round-trips an address', async () => {
    const { kv } = createFakeKV();
    const cache = new CloudflareKVCache({ namespaceBinding: kv });
    await cache.set('01001000', address);
    expect(await cache.get('01001000')).toEqual(address);
  });

  it('converts evictAfter to seconds', async () => {
    const { kv, ttls } = createFakeKV();
    await new CloudflareKVCache({ namespaceBinding: kv, evictAfter: 3_600_000 }).set('01001000', address);
    expect(ttls.get('cep-lookup:01001000')).toBe(3600);
  });

  it('clamps evictAfter to the 60s minimum KV accepts', async () => {
    const { kv, ttls } = createFakeKV();
    await new CloudflareKVCache({ namespaceBinding: kv, evictAfter: 5_000 }).set('01001000', address);
    expect(ttls.get('cep-lookup:01001000')).toBe(60);
  });

  it('pages through list() when clearing', async () => {
    const { kv, store } = createFakeKV(2);
    store.set('other:key', 'keep me');
    const cache = new CloudflareKVCache({ namespaceBinding: kv });
    for (const cep of ['11111111', '22222222', '33333333', '44444444', '55555555']) {
      await cache.set(cep, address);
    }
    await cache.clear();
    expect([...store.keys()]).toEqual(['other:key']);
  });
});

// --- Integration with CepLookup ---------------------------------------

describe('adapters wired into CepLookup', () => {
  const provider: Provider = {
    name: 'mock',
    buildUrl: (cep) => `https://mock.local/${cep}`,
    transform: (raw: any) => raw as Address,
  };

  it('serves the second lookup from Web Storage without touching the network', async () => {
    const storage = new FakeStorage();
    const fetcher = jest.fn().mockResolvedValue(address);
    const cep = new CepLookup({
      providers: [provider],
      fetcher,
      cache: new WebStorageCache({ storage }),
    });
    // The engine enriches the raw provider payload (DDD from the state) before caching.
    const enriched = await cep.lookup('01001000');
    const cacheHit = jest.fn();
    cep.on('cache:hit', cacheHit);
    expect(await cep.lookup('01001000')).toEqual(enriched);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(cacheHit).toHaveBeenCalledWith({ cep: '01001000' });
  });

  it('serves a stale Redis entry when every provider is down', async () => {
    const { client, store } = createIoredisLike();
    store.set('cep-lookup:01001000', encodeEntry(address, Date.now() - 60_000));
    const cep = new CepLookup({
      providers: [provider],
      fetcher: jest.fn().mockRejectedValue(new Error('network down')),
      cache: new RedisCache({ client, ttl: 1000 }),
      staleIfError: true,
    });
    const staleEvent = jest.fn();
    cep.on('cache:stale', staleEvent);
    expect(await cep.lookup('01001000')).toEqual(address);
    expect(staleEvent).toHaveBeenCalledWith({ cep: '01001000', address });
  });
});
