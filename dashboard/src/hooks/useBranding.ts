import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../services/api';

/** Panel branding an admin can change on the Branding page. Empty fields fall back to the defaults. */
export interface Branding {
  appName: string;
  versionText: string;
  showVersion: boolean;
  showHelp: boolean;
  helpText: string;
  helpLinkText: string;
  helpUrl: string;
  logoUrl: string;
  updatedAt: string | null;
}

export const DEFAULT_LOGO = '/openwa_logo.webp';
export const DEFAULT_APP_NAME = 'OpenWA';
const EMPTY: Branding = {
  appName: '',
  versionText: '',
  showVersion: true,
  showHelp: false,
  helpText: 'Need help?',
  helpLinkText: 'View Documentation',
  helpUrl: '',
  logoUrl: '',
  updatedAt: null,
};
const CACHE_KEY = 'openwa.branding';
const API_ORIGIN = API_BASE_URL.replace(/\/api$/, '');

function readCache(): Branding {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Branding>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

// One shared copy for every component; the cached copy avoids a flash of the default logo on reload.
let current: Branding = readCache();
let loading: Promise<void> | null = null;
const listeners = new Set<(b: Branding) => void>();

function applyToDocument(b: Branding) {
  const name = b.appName || DEFAULT_APP_NAME;
  // Keep page titles ("Sessions | OpenWA") in step with the chosen name.
  if (document.title.endsWith(' | OpenWA') && name !== DEFAULT_APP_NAME) {
    document.title = document.title.replace(/ \| OpenWA$/, ` | ${name}`);
  } else if (document.title === DEFAULT_APP_NAME) {
    document.title = name;
  }
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) {
    if (b.logoUrl) {
      icon.href = API_ORIGIN + b.logoUrl;
      icon.removeAttribute('type');
    } else if (!icon.href.endsWith('/favicon.svg')) {
      icon.href = '/favicon.svg';
      icon.type = 'image/svg+xml';
    }
  }
}

export function setBranding(next: Branding) {
  current = { ...EMPTY, ...next };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(current));
  } catch {
    /* private mode: the cache is only a convenience */
  }
  applyToDocument(current);
  listeners.forEach(fn => fn(current));
}

export function refreshBranding(): Promise<void> {
  if (!loading) {
    loading = fetch(`${API_BASE_URL}/settings/branding`, { credentials: 'include', signal: AbortSignal.timeout(15000) })
      .then(r => (r.ok ? (r.json() as Promise<Branding>) : Promise.reject(new Error(String(r.status)))))
      .then(setBranding)
      .catch(() => {
        /* keep the cached or default branding */
      })
      .finally(() => {
        loading = null;
      });
  }
  return loading;
}

/** Resolved values ready to render: always a usable logo, name and (optional) version label. */
export function useBranding(autoVersion?: string) {
  const [b, setB] = useState<Branding>(current);
  useEffect(() => {
    listeners.add(setB);
    setB(current);
    applyToDocument(current);
    void refreshBranding();
    return () => {
      listeners.delete(setB);
    };
  }, []);
  return {
    raw: b,
    appName: b.appName || DEFAULT_APP_NAME,
    logo: b.logoUrl ? API_ORIGIN + b.logoUrl : DEFAULT_LOGO,
    version: b.showVersion ? b.versionText || autoVersion || '' : '',
    help: b.showHelp && b.helpUrl ? { text: b.helpText, linkText: b.helpLinkText || b.helpUrl, url: b.helpUrl } : null,
  };
}
