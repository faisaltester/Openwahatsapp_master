import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getStoredApiKey, storeApiKey, clearStoredAuth } from './authStorage.ts';

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: key => { values.delete(key); },
    clear: () => { values.clear(); },
    key: index => [...values.keys()][index] ?? null,
  };
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: storage(), configurable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: storage(), configurable: true });
});
test('login survives a new tab with empty session storage', () => {
  storeApiKey(' entered-key ');
  sessionStorage.clear();
  assert.equal(getStoredApiKey(), 'entered-key');
});
test('an old tab cannot override a newer shared login', () => {
  sessionStorage.setItem('openwa_api_key', 'old-key');
  localStorage.setItem('openwa_api_key', 'new-key');
  assert.equal(getStoredApiKey(), 'new-key');
});
test('logout removes both credentials, the marker, cached role and Bulk fallback keys', () => {
  storeApiKey('entered-key');
  localStorage.setItem('openwa_bulk_api_key', 'bulk-key');
  localStorage.setItem('relaywa_key', 'legacy-bulk-key');
  localStorage.setItem('openwa_user_role', 'admin');
  clearStoredAuth();
  assert.equal(getStoredApiKey(), null);
  assert.equal(sessionStorage.getItem('openwa_authenticated'), null);
  for (const key of ['openwa_api_key', 'openwa_user_role', 'openwa_bulk_api_key', 'relaywa_key']) {
    assert.equal(localStorage.getItem(key), null);
  }
});
