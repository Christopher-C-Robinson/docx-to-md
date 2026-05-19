import { EventEmitter } from 'events';
import type { IncomingMessage, ClientRequest } from 'http';
import {
  parseSemver,
  isNewerVersion,
  fetchLatestVersion,
  checkForUpdate,
  resetCache,
  HttpGetFn,
} from '../../src/core/updateChecker';

// ---------------------------------------------------------------------------
// parseSemver
// ---------------------------------------------------------------------------

describe('parseSemver', () => {
  test('parses a plain semver string', () => {
    expect(parseSemver('1.2.3')).toEqual([1, 2, 3]);
  });

  test('strips a leading "v"', () => {
    expect(parseSemver('v0.1.17')).toEqual([0, 1, 17]);
  });

  test('returns null for non-semver input', () => {
    expect(parseSemver('not-a-version')).toBeNull();
    expect(parseSemver('')).toBeNull();
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('1.2.3.4')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isNewerVersion
// ---------------------------------------------------------------------------

describe('isNewerVersion', () => {
  test('returns true when remote major is greater', () => {
    expect(isNewerVersion('0.1.17', '1.0.0')).toBe(true);
  });

  test('returns true when remote minor is greater', () => {
    expect(isNewerVersion('0.1.17', '0.2.0')).toBe(true);
  });

  test('returns true when remote patch is greater', () => {
    expect(isNewerVersion('0.1.17', '0.1.18')).toBe(true);
  });

  test('returns false when versions are equal', () => {
    expect(isNewerVersion('0.1.17', '0.1.17')).toBe(false);
  });

  test('returns false when local is newer', () => {
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(false);
  });

  test('handles leading "v" in both arguments', () => {
    expect(isNewerVersion('v0.1.17', 'v0.1.18')).toBe(true);
    expect(isNewerVersion('v0.1.17', 'v0.1.17')).toBe(false);
  });

  test('returns false when either argument is invalid', () => {
    expect(isNewerVersion('bad', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0', 'bad')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Helpers for building mock HTTP objects
// ---------------------------------------------------------------------------

interface MockResponse extends EventEmitter {
  statusCode: number;
  setEncoding: (enc: string) => void;
  resume: () => void;
}

interface MockRequest extends EventEmitter {
  setTimeout: (ms: number, cb: () => void) => void;
  destroy: () => void;
}

function makeMockResponse(statusCode: number): MockResponse {
  const emitter = new EventEmitter() as MockResponse;
  emitter.statusCode = statusCode;
  emitter.setEncoding = () => { /* noop */ };
  emitter.resume = () => { /* noop */ };
  return emitter;
}

function makeMockRequest(): MockRequest {
  const emitter = new EventEmitter() as MockRequest;
  emitter.setTimeout = (_ms: number, _cb: () => void) => { /* noop */ };
  emitter.destroy = () => { /* noop */ };
  return emitter;
}

/**
 * Build a mock HttpGetFn that responds with the given status code and body.
 * The data/end events are emitted asynchronously via setImmediate.
 */
function makeSuccessHttpGet(statusCode: number, body: string): HttpGetFn {
  return (_url, _opts, callback) => {
    const res = makeMockResponse(statusCode);
    const req = makeMockRequest();
    callback(res as unknown as IncomingMessage);
    setImmediate(() => {
      res.emit('data', body);
      res.emit('end');
    });
    return req as unknown as ClientRequest;
  };
}

/**
 * Build a mock HttpGetFn that emits a request error asynchronously.
 */
function makeErrorHttpGet(error: Error): HttpGetFn {
  return (_url, _opts, _callback) => {
    const req = makeMockRequest();
    setImmediate(() => {
      req.emit('error', error);
    });
    return req as unknown as ClientRequest;
  };
}

// ---------------------------------------------------------------------------
// fetchLatestVersion
// ---------------------------------------------------------------------------

describe('fetchLatestVersion', () => {
  beforeEach(() => {
    resetCache();
  });

  afterEach(() => {
    resetCache();
  });

  test('returns parsed version from a successful API response', async () => {
    const httpGet = makeSuccessHttpGet(200, '{"tag_name":"v0.2.0"}');
    const version = await fetchLatestVersion(5000, httpGet);
    expect(version).toBe('0.2.0');
  });

  test('returns null when the API returns non-200', async () => {
    const httpGet = makeSuccessHttpGet(404, '');
    const version = await fetchLatestVersion(5000, httpGet);
    expect(version).toBeNull();
  });

  test('returns null when the response body is invalid JSON', async () => {
    const httpGet = makeSuccessHttpGet(200, 'not-json{{');
    const version = await fetchLatestVersion(5000, httpGet);
    expect(version).toBeNull();
  });

  test('returns null when the tag_name is missing or invalid', async () => {
    const httpGet = makeSuccessHttpGet(200, '{"tag_name":"not-a-version"}');
    const version = await fetchLatestVersion(5000, httpGet);
    expect(version).toBeNull();
  });

  test('returns null on a network error', async () => {
    const httpGet = makeErrorHttpGet(new Error('network error'));
    const version = await fetchLatestVersion(5000, httpGet);
    expect(version).toBeNull();
  });

  test('caches successful results and does not re-request within TTL', async () => {
    let callCount = 0;
    const httpGet: HttpGetFn = (_url, _opts, callback) => {
      callCount++;
      const res = makeMockResponse(200);
      const req = makeMockRequest();
      callback(res as unknown as IncomingMessage);
      setImmediate(() => {
        res.emit('data', '{"tag_name":"v0.3.0"}');
        res.emit('end');
      });
      return req as unknown as ClientRequest;
    };

    const first = await fetchLatestVersion(5000, httpGet);
    const second = await fetchLatestVersion(5000, httpGet);

    expect(first).toBe('0.3.0');
    expect(second).toBe('0.3.0');
    expect(callCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// checkForUpdate
// ---------------------------------------------------------------------------

describe('checkForUpdate', () => {
  beforeEach(() => {
    resetCache();
  });

  afterEach(() => {
    resetCache();
  });

  test('returns the latest version string when an update is available', async () => {
    const httpGet = makeSuccessHttpGet(200, '{"tag_name":"v0.2.0"}');
    const result = await checkForUpdate('0.1.17', 5000, httpGet);
    expect(result).toBe('0.2.0');
  });

  test('returns null when the current version is up to date', async () => {
    const httpGet = makeSuccessHttpGet(200, '{"tag_name":"v0.1.17"}');
    const result = await checkForUpdate('0.1.17', 5000, httpGet);
    expect(result).toBeNull();
  });

  test('returns null when the network check fails', async () => {
    const httpGet = makeErrorHttpGet(new Error('connection refused'));
    const result = await checkForUpdate('0.1.17', 5000, httpGet);
    expect(result).toBeNull();
  });
});
