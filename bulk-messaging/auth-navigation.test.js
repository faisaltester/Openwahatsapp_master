import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { OpenWaApiService } from './api-service.js';

function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}
beforeEach(() => {
  globalThis.localStorage = storage();
  globalThis.sessionStorage = storage();
});
test('Bulk prefers the current dashboard actor to a stale saved bulk key', () => {
  localStorage.setItem('openwa_api_key', 'dashboard-key');
  localStorage.setItem('openwa_bulk_api_key', 'old-bulk-key');
  assert.equal(new OpenWaApiService().getApiKey(), 'dashboard-key');
});
test('existing tab login migrates and works when entering Bulk', () => {
  sessionStorage.setItem('openwa_api_key', 'legacy-key');
  const api = new OpenWaApiService();
  assert.equal(api.getApiKey(), 'legacy-key');
  assert.equal(localStorage.getItem('openwa_api_key'), 'legacy-key');
});
test('an open Bulk tab drops the old dashboard key after another tab logs out', () => {
  localStorage.setItem('openwa_api_key', 'actor-one');
  const api = new OpenWaApiService();
  localStorage.removeItem('openwa_api_key');
  assert.equal(api.getApiKey(), '');
  localStorage.setItem('openwa_api_key', 'actor-two');
  assert.equal(api.getApiKey(), 'actor-two');
});
