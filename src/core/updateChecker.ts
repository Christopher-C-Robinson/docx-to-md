import * as https from 'https';
import type { IncomingMessage, ClientRequest } from 'http';

const RELEASES_URL =
  'https://api.github.com/repos/Christopher-C-Robinson/docx-to-md/releases/latest';

const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;

/** Cached latest version string (without "v" prefix) and the time it was fetched. */
let cachedLatestVersion: string | null = null;
let cacheTime = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export type HttpGetFn = (
  url: string,
  options: { headers: Record<string, string> },
  callback: (res: IncomingMessage) => void
) => ClientRequest;

/**
 * Parses a semver string of the form "x.y.z" (leading "v" is stripped).
 * Returns null for invalid input.
 */
export function parseSemver(version: string): [number, number, number] | null {
  const clean = version.replace(/^v/, '');
  if (!VERSION_PATTERN.test(clean)) return null;
  const parts = clean.split('.').map(Number);
  return [parts[0], parts[1], parts[2]];
}

/**
 * Returns true if `remote` is strictly newer than `local`.
 * Both arguments should be semver strings (leading "v" is tolerated).
 */
export function isNewerVersion(local: string, remote: string): boolean {
  const localParts = parseSemver(local);
  const remoteParts = parseSemver(remote);
  if (!localParts || !remoteParts) return false;
  for (let i = 0; i < 3; i++) {
    if (remoteParts[i] > localParts[i]) return true;
    if (remoteParts[i] < localParts[i]) return false;
  }
  return false;
}

/**
 * Fetches the latest release tag from GitHub Releases.
 * Returns the version string (without leading "v") or null on any failure.
 * Results are cached for CACHE_TTL_MS to avoid hammering the API.
 *
 * @param timeoutMs  Maximum milliseconds to wait for the request (default 5000).
 * @param httpGet    Overridable HTTP GET function, defaults to `https.get`.
 *                   Intended for use in unit tests only.
 */
export function fetchLatestVersion(
  timeoutMs = 5000,
  httpGet: HttpGetFn = https.get as unknown as HttpGetFn
): Promise<string | null> {
  return new Promise((resolve) => {
    const now = Date.now();
    if (cachedLatestVersion !== null && now - cacheTime < CACHE_TTL_MS) {
      resolve(cachedLatestVersion);
      return;
    }

    let settled = false;
    const settle = (value: string | null): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = httpGet(
      RELEASES_URL,
      { headers: { 'User-Agent': 'docx-to-md-update-checker/1.0' } },
      (res: IncomingMessage) => {
        if (res.statusCode !== 200) {
          res.resume();
          settle(null);
          return;
        }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { tag_name?: unknown };
            const tag = typeof json.tag_name === 'string' ? json.tag_name : '';
            const version = tag.replace(/^v/, '');
            if (VERSION_PATTERN.test(version)) {
              cachedLatestVersion = version;
              cacheTime = Date.now();
              settle(version);
            } else {
              settle(null);
            }
          } catch {
            settle(null);
          }
        });
        res.on('error', () => settle(null));
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      settle(null);
    });
    req.on('error', () => settle(null));
  });
}

/** Resets the internal cache. Intended for use in tests only. */
export function resetCache(): void {
  cachedLatestVersion = null;
  cacheTime = 0;
}

/**
 * Checks whether a newer version of the app is available on GitHub.
 * Returns the latest version string if an update is available, or null otherwise.
 * Never throws; failures are silently swallowed.
 *
 * @param currentVersion  The installed version string.
 * @param timeoutMs       Maximum milliseconds to wait for the network check.
 * @param httpGet         Overridable HTTP GET function (for unit tests only).
 */
export async function checkForUpdate(
  currentVersion: string,
  timeoutMs = 5000,
  httpGet?: HttpGetFn
): Promise<string | null> {
  try {
    const latest = await fetchLatestVersion(timeoutMs, httpGet);
    if (latest && isNewerVersion(currentVersion, latest)) {
      return latest;
    }
    return null;
  } catch {
    return null;
  }
}

