// Read-only local smoke checks. Never prints API keys or response contents.
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { io } = require('../dashboard/node_modules/socket.io-client');
const root = path.resolve(__dirname, '..');
const key = fs.readFileSync(path.join(root, 'data/.api-key'), 'utf8').trim();
const origin = process.env.OPENWA_CHECK_ORIGIN || 'http://127.0.0.1:2886';
async function check(route) {
  const start = performance.now();
  try {
    const response = await fetch(origin + route, {
      headers: { 'X-API-Key': key }, signal: AbortSignal.timeout(15000),
    });
    const body = await response.text();
    const result = { route, status: response.status, ms: Math.round(performance.now() - start), bytes: body.length };
    console.log(JSON.stringify(result));
    if (!response.ok) process.exitCode = 1;
    return response.ok && route === '/api/sessions' ? JSON.parse(body) : undefined;
  } catch (error) {
    console.log(JSON.stringify({ route, error: error.name, ms: Math.round(performance.now() - start) }));
    process.exitCode = 1;
  }
}
async function main() {
  for (const route of ['/', '/sessions', '/bulk/', '/app-config.json',
    '/api/health', '/api/health/ready', '/api/sessions/stats/overview',
    '/api/auth/api-keys', '/api/plugins', '/api/webhooks', '/api/audit?limit=20',
    '/api/infra/status', '/api/infra/config', '/api/infra/engines',
    '/api/infra/engines/current', '/api/stats/overview', '/api/stats/messages?period=7d']) {
    await check(route);
  }
  const sessions = await check('/api/sessions');
  for (const session of sessions || []) {
    for (const suffix of ['/config', '/proxy', '/templates', '/webhooks']) {
      await check(`/api/sessions/${session.id}${suffix}`);
    }
    if (session.status === 'ready') {
      for (const suffix of ['/chats', '/contacts', '/groups']) await check(`/api/sessions/${session.id}${suffix}`);
    }
  }
  await new Promise(resolve => {
    const socket = io(origin + '/events', { auth: { apiKey: key }, reconnection: false, transports: ['websocket'] });
    const timer = setTimeout(() => finish('timeout'), 15000);
    function finish(error) {
      clearTimeout(timer);
      console.log(JSON.stringify({ websocket: error || 'connected' }));
      if (error) process.exitCode = 1;
      socket.disconnect(); resolve();
    }
    socket.once('connect', () => finish());
    socket.once('connect_error', error => finish(error.message));
  });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
