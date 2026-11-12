import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const bulkRoot = fileURLToPath(new URL('../bulk-messaging/', import.meta.url));
const bulkContentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.html': 'text/html; charset=utf-8',
};

/** Serve the standalone Bulk workspace beneath the Dashboard origin in development. */
function bulkWorkspacePlugin() {
  const plugin = {
    name: 'openwa-bulk-workspace',
    configureServer(server: { middlewares: { use: (path: string, handler: (req: { url?: string }, res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string | Buffer) => void }, next: () => void) => void) => void } }) {
      server.middlewares.use('/bulk', (req, res, next) => {
        const requestPath = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
        const requestedFile = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
        const filePath = resolve(bulkRoot, requestedFile);
        const isInsideBulkRoot = !relative(bulkRoot, filePath).startsWith('..');

        if (!isInsideBulkRoot || !existsSync(filePath) || !statSync(filePath).isFile()) {
          next();
          return;
        }

        res.setHeader('Content-Type', bulkContentTypes[extname(filePath)] || 'application/octet-stream');
        res.end(readFileSync(filePath));
      });

      server.middlewares.use('/app-config.json', (_req, res) => {
        const keyPath = resolve(bulkRoot, '../data/.api-key');
        const masterApiKey = existsSync(keyPath) ? readFileSync(keyPath, 'utf8').trim() : '';
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ masterApiKey, apiPrefix: '/api' }));
      });
    },
    // Vite's dev/preview middleware above can read the source workspace directly. The NestJS
    // production host serves dashboard/dist, so copy the same static workspace during every build.
    // Excluding its development dependencies keeps the desktop bundle small and prevents a nested
    // node_modules tree from being published as static files.
    closeBundle() {
      cpSync(bulkRoot, resolve(fileURLToPath(new URL('./dist/', import.meta.url)), 'bulk'), {
        recursive: true,
        filter: source => !source.includes(`${bulkRoot}node_modules`) && !source.includes(`${bulkRoot}\\node_modules`),
      });
    },
  };
  return { ...plugin, configurePreviewServer: plugin.configureServer };
}

// Single source of truth for the version shown in the dashboard: the ROOT package.json, which is
// what a release bumps and what `npm run check:versions` gates. Resolved relative to this config
// file (not process.cwd()), because the dashboard is normally built from inside `dashboard/` — where
// cwd-relative resolution picks up `dashboard/package.json` instead. That file is not touched by a
// release, so the Login screen kept rendering whatever version it happened to be pinned at while the
// gateway moved on. The sidebar hid the drift by replacing the build-time value with the live
// version from the API (see Layout.tsx); the Login screen has no session yet, so it shows this
// constant verbatim. APP_VERSION env still overrides if explicitly provided.
const { version: pkgVersion } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
) as {
  version: string;
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), bulkWorkspacePlugin()],
  appType: 'spa', // Enable SPA fallback for client-side routing
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION || pkgVersion),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  preview: { host: '127.0.0.1', port: 2886, strictPort: true },
  server: {
    port: 2886,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:2785',
        changeOrigin: true,
        secure: false,
      },
      // Proxy the WebSocket (socket.io) transport so the dashboard's real-time
      // chats/sessions streams work against the dev backend.
      '/socket.io': {
        target: 'http://127.0.0.1:2785',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
