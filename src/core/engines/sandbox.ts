import * as fs from 'fs';

/** Maximum DOCX input size accepted before spawning any engine (50 MB). */
export const MAX_INPUT_BYTES = 50 * 1024 * 1024;

/** Maximum accumulated stderr bytes before killing the child process (1 MB). */
export const MAX_STDERR_BYTES = 1 * 1024 * 1024;

export interface ResourceLimits {
  /**
   * Virtual-memory hard limit in megabytes applied via `ulimit -v` (Linux only).
   * Set high enough to accommodate GHC / Java runtimes while still capping
   * runaway allocations from malicious documents.
   */
  memLimitMb: number;
  /**
   * CPU-time hard limit in seconds applied via `ulimit -t` (Linux only).
   * This is CPU time, not wall-clock time, so it complements the existing
   * wall-clock timeout without replacing it.
   */
  cpuLimitSecs: number;
}

/**
 * Wraps `cmd` + `args` with `prlimit` resource limits on Linux.
 * Returns the original command unchanged on non-Linux platforms so
 * behaviour is unaffected outside Docker / CI.
 *
 * **Dependency:** `prlimit` is provided by the `util-linux` package.  This
 * package is marked `Priority: required` on Debian/Ubuntu and is present in
 * the `node:20-slim` Docker base image used by this project.  Deployments on
 * other Linux distributions must ensure `util-linux` (or a package supplying
 * the `prlimit` binary) is installed.  If `prlimit` is unavailable the child
 * process will fail with ENOENT, causing the conversion to be rejected.
 *
 * Using `prlimit` applies RLIMIT_AS and RLIMIT_CPU limits without spawning a
 * shell, so file path arguments are never interpreted by a shell interpreter.
 * Signals (e.g. SIGKILL from the wall-clock timer) reach the conversion
 * binary directly because prlimit exec-replaces itself with the target
 * process.
 */
export function buildSandboxedSpawn(
  cmd: string,
  args: string[],
  limits: ResourceLimits
): [string, string[]] {
  if (process.platform !== 'linux') {
    return [cmd, args];
  }

  // prlimit --as sets the virtual-memory (RLIMIT_AS) limit in bytes;
  // --cpu sets the CPU-time (RLIMIT_CPU) limit in seconds.
  // The '--' separator ensures that cmd and args are never mistaken for
  // prlimit options, even if a path begins with '-'.
  const memBytes = limits.memLimitMb * 1024 * 1024;
  const cpuSecs = limits.cpuLimitSecs;
  return ['prlimit', [`--as=${memBytes}`, `--cpu=${cpuSecs}`, '--', cmd, ...args]];
}

/**
 * Validates that a value is safe to pass as an argument to an external
 * process or shell command.  Specifically:
 * - Rejects strings containing null bytes (which can truncate C-string
 *   handling and cause arguments to be mis-parsed at the OS level).
 * - Rejects strings containing ASCII control characters (U+0001–U+001F,
 *   U+007F) that could cause unexpected behaviour in shell or exec paths.
 *
 * This is intended as an explicit sanitisation barrier for file paths
 * that originate from the runtime environment or user-uploaded content
 * before they are forwarded to external binaries.
 */
export function validateShellSafePath(value: string): void {
  if (value.includes('\0')) {
    throw new Error('Unsafe path: contains null byte');
  }
  // Match any ASCII control character except tab (0x09) and newline/LF (0x0a).
  // Both ranges skip these two characters:
  //   \x01-\x08 covers control chars 1–8 (stops before tab at 9)
  //   \x0b-\x1f covers control chars 11–31 (starts after LF at 10)
  // Tab is sometimes legitimately present in paths; LF (0x0a) terminates
  // arguments in some systems but is also skipped here so that callers that
  // need to allow it can still do so via an additional check.
  if (/[\x01-\x08\x0b-\x1f\x7f]/.test(value)) {
    throw new Error('Unsafe path: contains control characters');
  }
}

/**
 * Checks the input file before handing it to a conversion engine:
 * - If the file does not exist the function returns silently so the engine can
 *   surface the error naturally (preserving fallback-chain behaviour).
 * - If the file exceeds `maxBytes` an error is thrown before any engine starts
 *   so no resources are wasted on an oversized or malicious input.
 */
export function validateInputFile(
  filePath: string,
  maxBytes: number = MAX_INPUT_BYTES
): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      // Non-existent file – let the engine report the error in its own way.
      return;
    }
    throw err;
  }

  if (stat.size > maxBytes) {
    throw new Error(
      `Input file exceeds the ${maxBytes}-byte size limit (actual: ${stat.size} bytes)`
    );
  }
}
