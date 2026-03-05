import { sanitizeMediaPath } from '../../src/core/assets/manager';
import * as path from 'path';

describe('Path Sanitization (zip-slip prevention)', () => {
  const BASE = '/tmp/safe-media';
  const RESOLVED_BASE = path.resolve(BASE);

  test('normal filename is allowed', () => {
    const result = sanitizeMediaPath('image.png', BASE);
    expect(result).toBe(path.join(RESOLVED_BASE, 'image.png'));
  });

  test('path traversal with ../ is rejected', () => {
    expect(() => sanitizeMediaPath('../../etc/passwd', BASE)).not.toThrow();
    // After normalization, the traversal should be removed; check result stays in base
    const result = sanitizeMediaPath('../../etc/passwd', BASE);
    expect(path.relative(RESOLVED_BASE, result).startsWith('..')).toBe(false);
  });

  test('deeply nested path is flattened to basename', () => {
    const result = sanitizeMediaPath('foo/bar/baz/image.png', BASE);
    expect(result).toBe(path.join(RESOLVED_BASE, 'image.png'));
  });

  test('special characters in filename are replaced', () => {
    const result = sanitizeMediaPath('my file (1).png', BASE);
    expect(result).toBe(path.join(RESOLVED_BASE, 'my_file__1_.png'));
  });

  test('result is always inside the base directory', () => {
    const paths = ['../outside.txt', '../../etc/passwd', '/absolute/path.png', 'normal.jpg'];
    for (const p of paths) {
      const result = sanitizeMediaPath(p, BASE);
      expect(path.relative(RESOLVED_BASE, result).startsWith('..')).toBe(false);
    }
  });
});
