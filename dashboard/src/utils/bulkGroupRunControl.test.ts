import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BulkGroupRunControl } from './bulkGroupRunControl.ts';
import { createGroupWithAdmins, GroupAdminSetupError } from './groupAdminSetup.ts';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test('Resume applies a reduced rest and credits time already spent waiting', async context => {
  let now = 0;
  let restMs = 120000;
  context.mock.method(performance, 'now', () => now);
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const run = new BulkGroupRunControl();
  let finished = false;
  const rest = run.wait(() => restMs).then(() => { finished = true; });
  now = 30000; context.mock.timers.tick(30000);
  run.pause();
  restMs = 10000;
  now += 200000; context.mock.timers.tick(200000);
  await flush();
  assert.equal(finished, false);
  run.resume();
  await rest;
  assert.equal(finished, true);
});

test('Resume applies an increased rest without counting paused time', async context => {
  let now = 0;
  let restMs = 100;
  context.mock.method(performance, 'now', () => now);
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const run = new BulkGroupRunControl();
  let finished = false;
  const rest = run.wait(() => restMs).then(() => { finished = true; });
  now = 40; context.mock.timers.tick(40);
  run.pause(); restMs = 200;
  now += 1000; context.mock.timers.tick(1000);
  run.resume();
  now += 159; context.mock.timers.tick(159); await flush();
  assert.equal(finished, false);
  now += 1; context.mock.timers.tick(1); await rest;
  assert.equal(finished, true);
});

test('a timeout changed while paused applies to the next dispatched request', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const run = new BulkGroupRunControl();
  let timeoutMs = 5000;
  run.pause();
  const request = run.request(() => new Promise(() => {}), () => timeoutMs);
  timeoutMs = 1000;
  run.resume(); await flush();
  context.mock.timers.tick(1000);
  await assert.rejects(request, { name: 'TimeoutError' });
});

test('Stop interrupts a two-minute batch rest immediately without advancing the timer', async () => {
  const run = new BulkGroupRunControl();
  const rest = run.wait(120000);
  run.stop();
  await assert.rejects(rest, { name: 'AbortError' });
  assert.equal(run.stopped, true);
});

test('Pause freezes remaining rest time and Resume continues it', async context => {
  let now = 0;
  context.mock.method(performance, 'now', () => now);
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const advance = async (ms: number) => { now += ms; context.mock.timers.tick(ms); await flush(); };
  const run = new BulkGroupRunControl();
  let finished = false;
  const rest = run.wait(100).then(() => { finished = true; });
  await advance(40);
  run.pause();
  await advance(1000);
  assert.equal(finished, false);
  run.resume();
  await advance(59);
  assert.equal(finished, false);
  await advance(1);
  await rest;
  assert.equal(finished, true);
});

test('Stop while paused releases the pause gate and dispatches no request', async () => {
  const run = new BulkGroupRunControl();
  run.pause();
  let called = false;
  const request = run.request(async () => { called = true; }, 1000);
  run.stop();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(called, false);
});

test('Stop cancels an in-flight request even when the transport ignores the abort signal', async () => {
  const run = new BulkGroupRunControl();
  let signal: AbortSignal | undefined;
  const request = run.request(s => { signal = s; return new Promise(() => {}); }, 120000);
  await flush();
  run.stop();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(signal?.aborted, true);
});

test('Pause permits the dispatched request to finish but blocks the next API step', async () => {
  const run = new BulkGroupRunControl();
  let finish!: (value: string) => void;
  let firstSignal: AbortSignal | undefined;
  const first = run.request(signal => { firstSignal = signal; return new Promise<string>(resolve => { finish = resolve; }); }, 1000);
  await flush();
  run.pause();
  finish('created');
  assert.equal(await first, 'created');
  assert.equal(firstSignal?.aborted, false);
  let dispatched = false;
  const second = run.request(async () => { dispatched = true; return 'promoted'; }, 1000);
  await flush();
  assert.equal(dispatched, false);
  run.resume();
  assert.equal(await second, 'promoted');
});

test('paused time before dispatch does not consume the request deadline', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const run = new BulkGroupRunControl();
  run.pause();
  const request = run.request(() => new Promise(() => {}), 1000);
  context.mock.timers.tick(5000);
  await flush();
  run.resume();
  await flush();
  context.mock.timers.tick(1000);
  await assert.rejects(request, { name: 'TimeoutError' });
});

test('Stop between create and admin setup preserves the group and sends no promotion', async () => {
  const run = new BulkGroupRunControl();
  let finish!: (value: { id: string; name: string }) => void;
  let infoCalls = 0;
  const result = createGroupWithAdmins({
    createGroup: () => run.request(() => new Promise(resolve => { finish = resolve; }), 1000),
    getGroupInfo: () => run.request(async () => { infoCalls++; return { participants: [] }; }, 1000),
    promoteGroupParticipants: () => run.request(async () => { throw new Error('Unexpected promotion'); }, 1000),
  }, { sessionId: 's', name: 'Team', members: ['919111111111'], allMembersAdmin: true, signal: run.signal });
  await flush();
  run.pause();
  finish({ id: 'group@g.us', name: 'Team' });
  await flush();
  assert.equal(infoCalls, 0);
  run.stop();
  await assert.rejects(result, error => error instanceof GroupAdminSetupError && error.group.id === 'group@g.us');
});
