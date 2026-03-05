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
 * Wraps `cmd` + `args` in a POSIX shell that applies `ulimit` resource limits
 * before exec-ing the real command.  Returns the original command unchanged on
 * non-Linux platforms so behaviour is unaffected outside Docker / CI.
 *
 * The `exec` replaces the shell process so signals (e.g. SIGKILL from the
 * wall-clock timer) reach the actual conversion binary directly.
 */
export function buildSandboxedSpawn(
  cmd: string,
  args: string[],
  limits: ResourceLimits
): [string, string[]] {
  if (process.platform !== 'linux') {
    return [cmd, args];
  }

  const memKb = limits.memLimitMb * 1024;
  const cpuSecs = limits.cpuLimitSecs;

  // POSIX sh built-in; works in dash/bash.
  // "$@" expands to the positional parameters ($1 … $n) passed after '--'.
  const script = `ulimit -v ${memKb} -t ${cpuSecs}; exec ${cmd} "$@"`;
  return ['sh', ['-c', script, '--', ...args]];
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
  } catch {
    // Non-existent file – let the engine report the error in its own way.
    return;
  }

  if (stat.size > maxBytes) {
    throw new Error(
      `Input file exceeds the ${maxBytes}-byte size limit (actual: ${stat.size} bytes)`
    );
  }
}
