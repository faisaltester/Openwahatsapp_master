import '../test-helpers/register-hooks.ts';
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

let rtl: typeof import('@testing-library/react');
let BulkGroups: typeof import('./BulkGroups.tsx')['BulkGroups'];
let ToastProvider: typeof import('../components/Toast.tsx')['ToastProvider'];
let client: QueryClient;
let creates = 0;
let infoReads = 0;
let holdCreation = false;
let rejectCreation = false;
let requestedNames: string[] = [];
let sessionStatus = 'ready';
let confirmCreation: (() => void) | undefined;
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

before(async () => {
  const { installJsdomGlobals } = await import('../test-helpers/jsdom.ts');
  await installJsdomGlobals();
  const { i18nReady } = await import('../i18n/index.ts');
  await i18nReady;
  rtl = await import('@testing-library/react');
  ({ BulkGroups } = await import('./BulkGroups.tsx'));
  ({ ToastProvider } = await import('../components/Toast.tsx'));
});
beforeEach(() => {
  creates = 0; infoReads = 0; holdCreation = false; confirmCreation = undefined;
  rejectCreation = false; requestedNames = [];
  sessionStatus = 'ready';
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === '/api/sessions') return json([{ id: 's1', name: 'Test Session', status: sessionStatus, engineLoaded: true }]);
    if (url === '/api/infra/engines/current') return json({ engineType: 'baileys' });
    if (url === '/api/sessions/s1/groups' && init?.method === 'POST') {
      creates++;
      requestedNames.push(JSON.parse(String(init?.body)).name);
      if (rejectCreation) return new Response(JSON.stringify({ message: 'WhatsApp refused (code 429)' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      const result = { id: 'new-group@g.us', name: 'Demo 1' };
      // Intentionally ignores AbortSignal to verify the UI still releases immediately.
      if (holdCreation) return new Promise(resolve => { confirmCreation = () => resolve(json(result)); });
      return json(result);
    }
    if (url === '/api/sessions/s1/groups/new-group%40g.us') {
      infoReads++;
      return json({ participants: [{ id: 'creator@lid', isAdmin: true, isSuperAdmin: true }] });
    }
    throw new Error(`Unexpected API call: ${init?.method || 'GET'} ${url}`);
  };
});
afterEach(() => { rtl.cleanup(); client.clear(); });

async function prepare(allAdmins = false) {
  rtl.render(createElement(QueryClientProvider, { client }, createElement(ToastProvider, null, createElement(BulkGroups))));
  await rtl.waitFor(() => assert.ok(rtl.screen.getByRole('option', { name: 'Test Session (Connected)' })));
  rtl.fireEvent.change(rtl.screen.getByLabelText('Connected Session *'), { target: { value: 's1' } });
  rtl.fireEvent.change(rtl.screen.getByLabelText('Number of Groups'), { target: { value: '2' } });
  rtl.fireEvent.change(rtl.screen.getByLabelText('Groups per Batch'), { target: { value: '1' } });
  rtl.fireEvent.change(rtl.screen.getByPlaceholderText('Country code + WhatsApp number'), { target: { value: '919111111111' } });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Add' }));
  if (allAdmins) rtl.fireEvent.click(rtl.screen.getByRole('checkbox', { name: 'Make all group members admins' }));
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Create 2 Groups' }));
  await rtl.waitFor(() => assert.equal(creates, 1));
}

test('Stop during two-minute batch rest releases the UI immediately and marks remaining jobs stopped', async () => {
  await prepare();
  await rtl.screen.findByText('created', { exact: true });
  assert.equal((rtl.screen.getByRole('button', { name: 'Validate Only (Dry Run)' }) as HTMLButtonElement).disabled, true);
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Stop' }));
  await rtl.waitFor(() => assert.ok(rtl.screen.getByRole('button', { name: /Continue .* Remaining Groups/ })), { timeout: 1000 });
  assert.ok(rtl.screen.getByText('stopped', { exact: true }));
  assert.equal(creates, 1);
});

test('Pause allows timing edits and Resume continues the next group with reduced rest, without recreating the first', async () => {
  await prepare();
  await rtl.screen.findByText('created', { exact: true });
  const rest = rtl.screen.getByLabelText('Batch Rest (seconds)') as HTMLInputElement;
  assert.equal(rest.disabled, true);
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Pause' }));
  assert.equal(rest.disabled, false);
  assert.equal((rtl.screen.getByLabelText('Number of Groups') as HTMLInputElement).closest('fieldset')?.disabled, true);
  rtl.fireEvent.change(rest, { target: { value: '0' } });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Resume' }));
  await rtl.waitFor(() => assert.equal(rtl.screen.getAllByText('created', { exact: true }).length, 2));
  assert.equal(creates, 2);
  await rtl.screen.findByText('Run finished', { exact: true });
});

test('Pause changes to Resume immediately and holds admin setup until resumed', async () => {
  holdCreation = true;
  await prepare(true);
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Pause' }));
  assert.ok(rtl.screen.getByRole('button', { name: 'Resume' }));
  await rtl.act(async () => { confirmCreation?.(); });
  await rtl.screen.findByText('promoting', { exact: true });
  assert.equal(infoReads, 0);
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Resume' }));
  await rtl.screen.findByText('created', { exact: true });
  assert.equal(infoReads, 1);
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Stop' }));
  await rtl.screen.findByText('stopped', { exact: true });
  assert.equal(creates, 1);
});

test('Stop releases a hanging creation immediately; a late reply cannot start admin setup', async () => {
  holdCreation = true;
  await prepare(true);
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Stop' }));
  await rtl.waitFor(() => assert.ok(rtl.screen.getByRole('button', { name: /Continue .* Remaining Groups/ })), { timeout: 1000 });
  await rtl.act(async () => { confirmCreation?.(); });
  assert.equal(infoReads, 0);
  assert.equal(creates, 1);
  assert.equal(rtl.screen.getAllByText('stopped', { exact: true }).length, 2);
});

test('manual retry preserves original names and skips already created groups after Stop', async () => {
  await prepare();
  await rtl.screen.findByText('created', { exact: true });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Stop' }));
  const retry = await rtl.screen.findByRole('button', { name: 'Retry 1 Groups (Same Names)' });
  assert.equal((retry as HTMLButtonElement).disabled, true);
  rtl.fireEvent.change(rtl.screen.getByLabelText('Base Group Name *'), { target: { value: 'Changed' } });
  rtl.fireEvent.click(rtl.screen.getByRole('checkbox', { name: 'I checked WhatsApp: the failed / stopped groups were not created.' }));
  rtl.fireEvent.click(retry);
  await rtl.screen.findByText('Run finished', { exact: true });
  assert.deepEqual(requestedNames, ['Demo 1', 'Demo 2']);
  assert.equal(rtl.screen.getAllByText('created', { exact: true }).length, 2);
});

test('failed creation retries the same name only after manual confirmation', async () => {
  rejectCreation = true;
  await prepare();
  const retry = await rtl.screen.findByRole('button', { name: 'Retry 2 Groups (Same Names)' });
  assert.equal(creates, 1);
  rejectCreation = false;
  rtl.fireEvent.change(rtl.screen.getByLabelText('Batch Rest (seconds)'), { target: { value: '0' } });
  rtl.fireEvent.click(rtl.screen.getByRole('checkbox', { name: 'I checked WhatsApp: the failed / stopped groups were not created.' }));
  rtl.fireEvent.click(retry);
  await rtl.screen.findByText('Run finished', { exact: true });
  assert.deepEqual(requestedNames, ['Demo 1', 'Demo 1', 'Demo 2']);
});

test('a loaded engine that is reconnecting cannot be selected for group creation', async () => {
  sessionStatus = 'disconnected';
  rtl.render(createElement(QueryClientProvider, { client }, createElement(ToastProvider, null, createElement(BulkGroups))));
  await rtl.waitFor(() => assert.equal(client.getQueryCache().getAll().every(query => query.state.status === 'success'), true));
  assert.equal(rtl.screen.queryByRole('option', { name: 'Test Session (Connected)' }), null);
  assert.equal((rtl.screen.getByRole('button', { name: 'Create 10 Groups' }) as HTMLButtonElement).disabled, true);
  assert.equal(creates, 0);
});


test('the main Start action continues remaining jobs instead of recreating completed groups', async () => {
  await prepare();
  await rtl.screen.findByText('created', { exact: true });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Stop' }));
  const start = await rtl.screen.findByRole('button', { name: 'Continue 1 Remaining Groups' });
  assert.equal((start as HTMLButtonElement).disabled, true);
  rtl.fireEvent.click(rtl.screen.getByRole('checkbox', { name: 'I checked WhatsApp: the failed / stopped groups were not created.' }));
  rtl.fireEvent.click(start);
  await rtl.screen.findByText('Run finished', { exact: true });
  assert.deepEqual(requestedNames, ['Demo 1', 'Demo 2']);
});
