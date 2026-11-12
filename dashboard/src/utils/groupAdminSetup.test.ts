import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGroupWithAdmins, GroupAdminSetupError } from './groupAdminSetup.ts';
import type { GroupCreationApi } from './groupAdminSetup.ts';

const group = { id: '120363001@g.us', name: 'Team 1' };
const options = { sessionId: 'session-1', name: 'Team 1', members: ['919111111111'], allMembersAdmin: true };
function fixture() {
  const calls: { method: string; ids?: string[]; signal?: AbortSignal }[] = [];
  const api: GroupCreationApi = {
    async createGroup(_session, _name, ids, signal) { calls.push({ method: 'create', ids, signal }); return group; },
    async getGroupInfo(_session, _group, signal) {
      calls.push({ method: 'info', signal });
      return { participants: [
        { id: 'owner@lid', isAdmin: true, isSuperAdmin: true },
        { id: '919111111111@c.us', isAdmin: false, isSuperAdmin: false },
        { id: 'privacy-member@lid', isAdmin: false, isSuperAdmin: false },
      ] };
    },
    async promoteGroupParticipants(_session, _group, ids, signal) {
      calls.push({ method: 'promote', ids, signal });
      return { success: true, results: ids.map(id => ({ id, success: true, status: 200 })) };
    },
  };
  return { api, calls };
}
test('unchecked option creates a group with no roster read or promotion', async () => {
  const { api, calls } = fixture();
  assert.deepEqual(await createGroupWithAdmins(api, { ...options, allMembersAdmin: false }), { group });
  assert.deepEqual(calls.map(c => c.method), ['create']);
});
test('checked option promotes the actual phone/LID roster, excluding existing admins', async () => {
  const { api, calls } = fixture();
  const controller = new AbortController();
  let confirmedGroup;
  const result = await createGroupWithAdmins(api, { ...options, signal: controller.signal }, value => { confirmedGroup = value; });
  assert.equal(confirmedGroup, group);
  assert.deepEqual(result, { group, adminCount: 3 });
  assert.deepEqual(calls.map(c => c.method), ['create', 'info', 'promote']);
  assert.deepEqual(calls[2].ids, ['919111111111@c.us', 'privacy-member@lid']);
  assert.ok(calls.every(c => c.signal === controller.signal));
});
test('members who are already admins need no promotion', async () => {
  const { api, calls } = fixture();
  api.getGroupInfo = async () => ({ participants: [{ id: 'owner@lid', isAdmin: true, isSuperAdmin: true }] });
  const result = await createGroupWithAdmins(api, options);
  assert.equal(result.adminCount, 1);
  assert.ok(!calls.some(c => c.method === 'promote'));
});
test('HTTP success with partial refusal is an admin failure and retains the created group', async () => {
  const { api, calls } = fixture();
  api.promoteGroupParticipants = async () => ({ success: true, results: [
    { id: '919111111111@c.us', success: true }, { id: 'privacy-member@lid', success: false, status: 403 },
  ] });
  await assert.rejects(createGroupWithAdmins(api, options), error => {
    assert.ok(error instanceof GroupAdminSetupError);
    assert.equal(error.group.id, group.id);
    assert.match(error.message, /1 of 2/);
    assert.match(error.message, /Do not recreate/);
    return true;
  });
  assert.equal(calls.filter(c => c.method === 'create').length, 1);
});
test('missing participant confirmation does not claim all members are admins', async () => {
  const { api } = fixture();
  api.promoteGroupParticipants = async () => ({ success: true, results: [{ id: '919111111111@c.us', success: true }] });
  await assert.rejects(createGroupWithAdmins(api, options), /1 of 2/);
});
test('roster/network failures after creation report admin failure, without creating again', async () => {
  const { api, calls } = fixture();
  api.getGroupInfo = async () => { throw new Error('WhatsApp unavailable'); };
  await assert.rejects(createGroupWithAdmins(api, options), error => error instanceof GroupAdminSetupError && error.group === group);
  assert.equal(calls.filter(c => c.method === 'create').length, 1);
  assert.ok(!calls.some(c => c.method === 'promote'));
});
test('stop/timeout after creation prevents further calls and preserves known creation', async () => {
  const { api, calls } = fixture();
  const controller = new AbortController();
  await assert.rejects(createGroupWithAdmins(api, { ...options, signal: controller.signal }, () => controller.abort()), GroupAdminSetupError);
  assert.deepEqual(calls.map(c => c.method), ['create']);
});
test('creation failure never invokes admin setup or retries', async () => {
  const { api, calls } = fixture();
  let attempts = 0;
  api.createGroup = async () => { attempts++; throw new Error('Creation refused'); };
  await assert.rejects(createGroupWithAdmins(api, options), /Creation refused/);
  assert.equal(attempts, 1);
  assert.equal(calls.length, 0);
});
