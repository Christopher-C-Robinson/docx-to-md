import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MAX_INPUT_BYTES, MAX_STDERR_BYTES, buildSandboxedSpawn, validateInputFile, validateShellSafePath } from '../../src/core/engines/sandbox';
import { PandocAdapter } from '../../src/core/engines/pandoc/adapter';
import { LibreOfficeAdapter } from '../../src/core/engines/libreoffice/adapter';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a temp file containing `size` bytes and returns its path.
 * Uses the 'docx-to-md-' prefix so that the api-server temp-file leak test
 * (which filters out entries starting with 'docx-to-md-') does not pick up
 * directories created by these tests when the full suite runs in parallel.
 */
function makeTempFile(size: number): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docx-to-md-sandbox-test-'));
  const filePath = path.join(dir, 'test.docx');
  fs.writeFileSync(filePath, Buffer.alloc(size, 0x00));
  return filePath;
}

/**
 * Temporarily overrides `process.platform` for the duration of `fn`, then
 * restores the original descriptor.
 */
function withPlatform(platform: string, fn: () => void): void {
  const orig = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
  try {
    fn();
  } finally {
    if (orig) Object.defineProperty(process, 'platform', orig);
  }
}

// ---------------------------------------------------------------------------
// validateInputFile
// ---------------------------------------------------------------------------

describe('validateInputFile', () => {
  test('does not throw for a non-existent file (engine will report the error)', () => {
    expect(() => validateInputFile('/tmp/no-such-file-sandbox-test.docx')).not.toThrow();
  });

  test('does not throw for a file exactly at the custom limit', () => {
    const limit = 64;
    const file = makeTempFile(limit);
    try {
      expect(() => validateInputFile(file, limit)).not.toThrow();
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('throws when file exceeds the custom limit', () => {
    const limit = 32;
    const file = makeTempFile(limit + 1);
    try {
      expect(() => validateInputFile(file, limit)).toThrow(/size limit/);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('includes the actual file size in the error message', () => {
    const limit = 10;
    const actualSize = limit + 5;
    const file = makeTempFile(actualSize);
    try {
      expect(() => validateInputFile(file, limit)).toThrow(String(actualSize));
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('includes the limit in the error message', () => {
    const limit = 10;
    const file = makeTempFile(limit + 1);
    try {
      expect(() => validateInputFile(file, limit)).toThrow(String(limit));
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// buildSandboxedSpawn
// ---------------------------------------------------------------------------

describe('buildSandboxedSpawn', () => {
  const limits = { memLimitMb: 512, cpuLimitSecs: 60 };

  test('returns original command unchanged on non-Linux platforms', () => {
    withPlatform('darwin', () => {
      const [cmd, args] = buildSandboxedSpawn('pandoc', ['-f', 'docx'], limits);
      expect(cmd).toBe('pandoc');
      expect(args).toEqual(['-f', 'docx']);
    });
  });

  test('wraps command with prlimit on Linux (no shell)', () => {
    withPlatform('linux', () => {
      const [cmd, args] = buildSandboxedSpawn('pandoc', ['-f', 'docx'], limits);
      expect(cmd).toBe('prlimit');
      // '--' separator must appear so cmd is never mistaken for a prlimit option.
      expect(args).toContain('--');
      const sepIdx = args.indexOf('--');
      // Real command and its args follow the separator.
      expect(args[sepIdx + 1]).toBe('pandoc');
      expect(args.slice(sepIdx + 2)).toEqual(['-f', 'docx']);
    });
  });

  test('embeds the correct memory (bytes) and CPU (seconds) values', () => {
    withPlatform('linux', () => {
      const [, args] = buildSandboxedSpawn('soffice', [], { memLimitMb: 1024, cpuLimitSecs: 300 });
      // 1024 MB → 1 073 741 824 bytes
      expect(args).toContain(`--as=${1024 * 1024 * 1024}`);
      expect(args).toContain('--cpu=300');
    });
  });

  test('does not spawn a shell interpreter on Linux', () => {
    withPlatform('linux', () => {
      const [cmd] = buildSandboxedSpawn('pandoc', [], limits);
      expect(cmd).not.toBe('sh');
      expect(cmd).not.toBe('bash');
    });
  });
});

// ---------------------------------------------------------------------------
// PandocAdapter – file size enforcement
// ---------------------------------------------------------------------------

describe('PandocAdapter – file size enforcement', () => {
  test('rejects oversized input before spawning pandoc', async () => {
    const limit = 8;
    const file = makeTempFile(limit + 1);
    try {
      // null = no fallback adapter
      const adapter = new PandocAdapter(null);
      await expect(
        adapter.convert(file, '/tmp/out.md', { format: 'gfm', maxFileSizeBytes: limit })
      ).rejects.toThrow(/size limit/);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });

  test('size error propagates even when a fallback adapter is configured', async () => {
    // A size violation must not be silently swallowed by the fallback chain
    // because no engine can safely handle an oversized document.
    const limit = 8;
    const file = makeTempFile(limit + 1);
    const fallbackCalled = { value: false };
    const fakeAdapter = {
      name: 'mammoth' as const,
      isAvailable: async () => true,
      async convert(): Promise<never> {
        fallbackCalled.value = true;
        throw new Error('fallback should not be called');
      },
    };
    try {
      const adapter = new PandocAdapter(fakeAdapter);
      await expect(
        adapter.convert(file, '/tmp/out.md', { format: 'gfm', maxFileSizeBytes: limit })
      ).rejects.toThrow(/size limit/);
      expect(fallbackCalled.value).toBe(false);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// LibreOfficeAdapter – file size enforcement
// ---------------------------------------------------------------------------

describe('LibreOfficeAdapter – file size enforcement', () => {
  test('rejects oversized input before spawning soffice', async () => {
    const limit = 8;
    const file = makeTempFile(limit + 1);
    try {
      const adapter = new LibreOfficeAdapter();
      await expect(
        adapter.convert(file, '/tmp/out.md', { maxFileSizeBytes: limit })
      ).rejects.toThrow(/size limit/);
    } finally {
      fs.rmSync(path.dirname(file), { recursive: true, force: true });
    }
  });
});

// ---------------------------------------------------------------------------
// validateShellSafePath
// ---------------------------------------------------------------------------

describe('validateShellSafePath', () => {
  test('accepts a normal absolute path', () => {
    expect(() => validateShellSafePath('/tmp/docx-to-md-abc/output.md')).not.toThrow();
  });

  test('accepts a path with spaces and hyphens', () => {
    expect(() => validateShellSafePath('/tmp/my file-name_1.docx')).not.toThrow();
  });

  test('throws for a path containing a null byte', () => {
    expect(() => validateShellSafePath('/tmp/foo\0bar')).toThrow(/null byte/);
  });

  test('throws for a path containing a control character (0x01)', () => {
    expect(() => validateShellSafePath('/tmp/foo\x01bar')).toThrow(/control char/);
  });

  test('throws for a path containing a carriage return', () => {
    expect(() => validateShellSafePath('/tmp/foo\rbar')).toThrow(/control char/);
  });

  test('does not throw for a path containing a tab character', () => {
    expect(() => validateShellSafePath('/tmp/foo\tbar')).not.toThrow();
  });

  test('throws for a path containing a vertical tab (0x0b)', () => {
    expect(() => validateShellSafePath('/tmp/foo\x0bbar')).toThrow(/control char/);
  });

  test('throws for a path containing DEL (0x7f)', () => {
    expect(() => validateShellSafePath('/tmp/foo\x7fbar')).toThrow(/control char/);
  });
});

// ---------------------------------------------------------------------------
// Exported constants sanity check
// ---------------------------------------------------------------------------

describe('sandbox constants', () => {
  test('MAX_INPUT_BYTES is 50 MB', () => {
    expect(MAX_INPUT_BYTES).toBe(50 * 1024 * 1024);
  });

  test('MAX_STDERR_BYTES is 1 MB', () => {
    expect(MAX_STDERR_BYTES).toBe(1 * 1024 * 1024);
  });
});
