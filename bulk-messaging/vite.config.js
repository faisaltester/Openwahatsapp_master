import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getMasterApiKey() {
  try {
    const keyPath = path.resolve(__dirname, '../data/.api-key');
    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, 'utf8').trim();
    }
  } catch (e) {
    console.error('[Vite Proxy] Could not read .api-key:', e.message);
  }
  return '';
}

export default {
  server: {
    port: 3200,
    host: '127.0.0.1',
    proxy: {
      // Match only the API route itself and its children. A plain '/api' prefix
      // also captured the local module '/api-service.js', returning a backend
      // 404 before the Bulk app could initialize.
      '^/api(?:/|$)': {
        target: 'http://127.0.0.1:2785',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            const masterKey = getMasterApiKey();
            // Inject master API key automatically if client has not provided one
            if (!proxyReq.getHeader('x-api-key') && masterKey) {
              proxyReq.setHeader('X-Api-Key', masterKey);
            }
          });
        }
      }
    }
  },
  plugins: [
    {
      name: 'api-config-endpoint',
      configureServer(server) {
        server.middlewares.use('/app-config.json', (req, res) => {
          const masterKey = getMasterApiKey();
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(JSON.stringify({
            masterApiKey: masterKey,
            apiPrefix: '/api',
            serverTime: new Date().toISOString()
          }));
        });
      }
    }
  ]
};
