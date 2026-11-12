import '../test-helpers/register-hooks.ts';
import { test, before, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
let rtl: typeof import('@testing-library/react');
let Page: typeof import('./BulkGroupMembers.tsx')['BulkGroupMembers'];
let client: QueryClient;
let writes: { participants: string[]; preview: boolean }[] = [];
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
before(async () => {
  const { installJsdomGlobals } = await import('../test-helpers/jsdom.ts'); await installJsdomGlobals();
  rtl = await import('@testing-library/react'); ({ BulkGroupMembers: Page } = await import('./BulkGroupMembers.tsx'));
});
beforeEach(() => {
  writes = []; client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === '/api/sessions') return json([{ id: 's1', name: 'Team Session', status: 'ready', engineLoaded: true }]);
    if (url.includes('/member-management?')) return json({ total: 2, items: [{ id: 'a@g.us', name: 'Admin Team', isAdmin: true, participantsCount: 3 }, { id: 'b@g.us', name: 'Member Team', isAdmin: false, participantsCount: 10 }] });
    if (url.endsWith('/members/bulk')) {
      const body = JSON.parse(String(init?.body)); writes.push(body);
      return json({ groupId: 'a@g.us', groupName: 'Admin Team', preview: body.preview, total: 2, skipped: 1, ready: body.preview ? 1 : 0, added: body.preview ? 0 : 1, failed: 0, results: [{ number: '919111111111', status: 'skipped', message: 'Already in group' }, { number: '919222222222', status: body.preview ? 'ready' : 'added', message: 'New member' }] });
    }
    throw new Error(`Unexpected request ${url}`);
  };
});
afterEach(() => { rtl.cleanup(); client.clear(); });
async function prepare() {
  rtl.render(createElement(QueryClientProvider, { client }, createElement(Page)));
  await rtl.screen.findByRole('option', { name: 'Team Session' });
  rtl.fireEvent.change(rtl.screen.getByLabelText('Connected Session'), { target: { value: 's1' } });
  await rtl.screen.findByText('Admin Team', { exact: true });
}
test('lists non-admin groups but blocks member addition for a selected non-admin group', async () => {
  await prepare(); rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'View Group' }));
  rtl.fireEvent.change(rtl.screen.getByLabelText('Team numbers'), { target: { value: '919111111111' } });
  assert.ok(rtl.screen.getByText('You are not an admin of this group. Bulk add is unavailable.'));
  assert.equal((rtl.screen.getByRole('button', { name: 'Add Members to Group' }) as HTMLButtonElement).disabled, true);
  assert.equal(writes.length, 0);
});
test('searches admin groups, previews unique numbers and shows the final skipped/added summary', async () => {
  await prepare();
  rtl.fireEvent.change(rtl.screen.getByLabelText('Search admin groups'), { target: { value: 'Admin Team' } });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Add Members' }));
  rtl.fireEvent.change(rtl.screen.getByLabelText('Team numbers'), { target: { value: '919111111111\n919222222222\n919222222222' } });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Check Existing Members' }));
  await rtl.screen.findByText('Preview Results — Admin Team');
  assert.deepEqual(writes[0], { participants: ['919111111111', '919222222222'], preview: true });
  rtl.fireEvent.click(rtl.screen.getByRole('button', { name: 'Add Members to Group' }));
  await rtl.screen.findByText('Result Summary — Admin Team');
  assert.equal(writes.length, 2); assert.equal(writes[1].preview, false);
  assert.ok(rtl.screen.getByText('Already in group'));
  assert.ok(rtl.screen.getByText('added', { exact: true }));
});
