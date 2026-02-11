import { InMemoryCache } from '../src/cache';
import { Address } from '../src/types';

const mockAddress: Address = {
  cep: '01001000',
  state: 'SP',
  city: 'São Paulo',
  neighborhood: 'Sé',
  street: 'Praça da Sé',
  service: 'test',
};

const mockAddress2: Address = {
  cep: '20040020',
  state: 'RJ',
  city: 'Rio de Janeiro',
  neighborhood: 'Centro',
  street: 'Av. Rio Branco',
  service: 'test',
};

describe('InMemoryCache', () => {
  describe('backward compatibility (no options)', () => {
    it('should work with no constructor options', () => {
      const cache = new InMemoryCache();
      cache.set('01001000', mockAddress);
      expect(cache.get('01001000')).toEqual(mockAddress);
    });

    it('should return undefined for missing keys', () => {
      const cache = new InMemoryCache();
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should clear all entries', () => {
      const cache = new InMemoryCache();
      cache.set('01001000', mockAddress);
      cache.set('20040020', mockAddress2);
      cache.clear();
      expect(cache.get('01001000')).toBeUndefined();
      expect(cache.get('20040020')).toBeUndefined();
    });
  });

  describe('TTL', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('should return entry before TTL expires', () => {
      const cache = new InMemoryCache({ ttl: 5000 });
      cache.set('01001000', mockAddress);
      jest.advanceTimersByTime(4999);
      expect(cache.get('01001000')).toEqual(mockAddress);
    });

    it('should return undefined after TTL expires', () => {
      const cache = new InMemoryCache({ ttl: 5000 });
      cache.set('01001000', mockAddress);
      jest.advanceTimersByTime(5001);
      expect(cache.get('01001000')).toBeUndefined();
    });

    it('should evict expired entry on get()', () => {
      const cache = new InMemoryCache({ ttl: 1000 });
      cache.set('01001000', mockAddress);
      jest.advanceTimersByTime(1001);
      // get triggers eviction
      cache.get('01001000');
      // internal map should have been cleaned
      expect(cache.has('01001000')).toBe(false);
    });

    it('should report has() correctly with TTL', () => {
      const cache = new InMemoryCache({ ttl: 1000 });
      cache.set('01001000', mockAddress);
      expect(cache.has('01001000')).toBe(true);
      jest.advanceTimersByTime(1001);
      expect(cache.has('01001000')).toBe(false);
    });
  });

  describe('maxSize', () => {
    it('should evict oldest entry when maxSize is reached', () => {
      const cache = new InMemoryCache({ maxSize: 2 });
      cache.set('a', mockAddress);
      cache.set('b', mockAddress2);
      cache.set('c', { ...mockAddress, cep: '30000000' });

      expect(cache.get('a')).toBeUndefined(); // evicted
      expect(cache.get('b')).toEqual(mockAddress2);
      expect(cache.get('c')).toBeDefined();
    });

    it('should not evict if under maxSize', () => {
      const cache = new InMemoryCache({ maxSize: 5 });
      cache.set('a', mockAddress);
      cache.set('b', mockAddress2);
      expect(cache.get('a')).toEqual(mockAddress);
      expect(cache.get('b')).toEqual(mockAddress2);
    });

    it('should handle set() for existing key without counting as new', () => {
      const cache = new InMemoryCache({ maxSize: 2 });
      cache.set('a', mockAddress);
      cache.set('b', mockAddress2);
      // Update existing key - should NOT evict
      cache.set('a', { ...mockAddress, street: 'Updated' });
      expect(cache.get('a')?.street).toBe('Updated');
      expect(cache.get('b')).toEqual(mockAddress2);
    });
  });

  describe('delete and has', () => {
    it('should delete a specific entry', () => {
      const cache = new InMemoryCache();
      cache.set('01001000', mockAddress);
      cache.delete('01001000');
      expect(cache.get('01001000')).toBeUndefined();
    });

    it('should return true for has() when entry exists', () => {
      const cache = new InMemoryCache();
      cache.set('01001000', mockAddress);
      expect(cache.has('01001000')).toBe(true);
    });

    it('should return false for has() when entry does not exist', () => {
      const cache = new InMemoryCache();
      expect(cache.has('nonexistent')).toBe(false);
    });
  });
});
