const API_KEY = 'openwa_api_key';

/** Share an explicitly entered dashboard login across same-origin browser tabs. */
export function getStoredApiKey(): string | null {
  const shared = localStorage.getItem(API_KEY);
  if (shared) return shared;
  // Migrate existing logins without asking the operator to paste the key again.
  const legacy = sessionStorage.getItem(API_KEY);
  if (legacy) localStorage.setItem(API_KEY, legacy);
  return legacy;
}

export function storeApiKey(key: string): void {
  const value = key.trim();
  localStorage.setItem(API_KEY, value);
  sessionStorage.setItem(API_KEY, value);
  sessionStorage.setItem('openwa_authenticated', '1');
}

export function clearStoredAuth(): void {
  localStorage.removeItem(API_KEY);
  sessionStorage.removeItem(API_KEY);
  sessionStorage.removeItem('openwa_authenticated');
  localStorage.removeItem('openwa_user_role');
  // Bulk must not retain an independent credential after an explicit dashboard logout.
  localStorage.removeItem('openwa_bulk_api_key');
  localStorage.removeItem('relaywa_key');
}
