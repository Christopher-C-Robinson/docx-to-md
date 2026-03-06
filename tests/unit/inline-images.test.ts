import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { inlineImages } from '../../src/core/assets/inlineImages';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'inline-images-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeTmpFile(name: string, content: Buffer | string): string {
  const filepath = path.join(tmpDir, name);
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, content);
  return filepath;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('inlineImages', () => {
  test('replaces a local PNG image reference with a Base64 data URI', () => {
    const imgData = Buffer.from('fake-png-bytes');
    writeTmpFile('media/image.png', imgData);

    const markdown = '![alt text](media/image.png)';
    const result = inlineImages(markdown, tmpDir);

    const expected = `![alt text](data:image/png;base64,${imgData.toString('base64')})`;
    expect(result).toBe(expected);
  });

  test('preserves the image title attribute', () => {
    const imgData = Buffer.from('fake-png-bytes');
    writeTmpFile('media/image.png', imgData);

    const markdown = '![logo](media/image.png "My Logo")';
    const result = inlineImages(markdown, tmpDir);

    const b64 = imgData.toString('base64');
    expect(result).toBe(`![logo](data:image/png;base64,${b64} "My Logo")`);
  });

  test('handles JPEG images', () => {
    const imgData = Buffer.from('fake-jpeg-bytes');
    writeTmpFile('img.jpg', imgData);

    const markdown = '![photo](img.jpg)';
    const result = inlineImages(markdown, tmpDir);

    expect(result).toContain('data:image/jpeg;base64,');
  });

  test('handles .jpeg extension as image/jpeg', () => {
    const imgData = Buffer.from('fake-jpeg-bytes');
    writeTmpFile('img.jpeg', imgData);

    const result = inlineImages('![](img.jpeg)', tmpDir);
    expect(result).toContain('data:image/jpeg;base64,');
  });

  test('handles GIF images', () => {
    const imgData = Buffer.from('fake-gif-bytes');
    writeTmpFile('anim.gif', imgData);

    const result = inlineImages('![gif](anim.gif)', tmpDir);
    expect(result).toContain('data:image/gif;base64,');
  });

  test('handles SVG images', () => {
    const imgData = Buffer.from('<svg></svg>');
    writeTmpFile('icon.svg', imgData);

    const result = inlineImages('![icon](icon.svg)', tmpDir);
    expect(result).toContain('data:image/svg+xml;base64,');
  });

  test('handles WEBP images', () => {
    const imgData = Buffer.from('webp-bytes');
    writeTmpFile('img.webp', imgData);

    const result = inlineImages('![](img.webp)', tmpDir);
    expect(result).toContain('data:image/webp;base64,');
  });

  test('leaves remote http URLs unchanged', () => {
    const markdown = '![remote](https://example.com/image.png)';
    const result = inlineImages(markdown, tmpDir);
    expect(result).toBe(markdown);
  });

  test('leaves remote https URLs unchanged', () => {
    const markdown = '![remote](https://cdn.example.com/logo.png)';
    const result = inlineImages(markdown, tmpDir);
    expect(result).toBe(markdown);
  });

  test('leaves already-inlined data URIs unchanged', () => {
    const markdown = '![inline](data:image/png;base64,abc123)';
    const result = inlineImages(markdown, tmpDir);
    expect(result).toBe(markdown);
  });

  test('leaves ftp URLs unchanged', () => {
    const markdown = '![ftp](ftp://example.com/image.png)';
    const result = inlineImages(markdown, tmpDir);
    expect(result).toBe(markdown);
  });

  test('leaves reference unchanged when image file does not exist', () => {
    const markdown = '![missing](media/nonexistent.png)';
    const result = inlineImages(markdown, tmpDir);
    expect(result).toBe(markdown);
  });

  test('leaves reference unchanged for unrecognised file extensions', () => {
    writeTmpFile('diagram.emf', Buffer.from('emf-bytes'));

    const markdown = '![diagram](diagram.emf)';
    const result = inlineImages(markdown, tmpDir);
    expect(result).toBe(markdown);
  });

  test('replaces multiple images in one markdown string', () => {
    writeTmpFile('a.png', Buffer.from('aaa'));
    writeTmpFile('b.png', Buffer.from('bbb'));

    const markdown = '![first](a.png)\n\nSome text\n\n![second](b.png)';
    const result = inlineImages(markdown, tmpDir);

    expect(result).toContain(`data:image/png;base64,${Buffer.from('aaa').toString('base64')}`);
    expect(result).toContain(`data:image/png;base64,${Buffer.from('bbb').toString('base64')}`);
    expect(result).not.toContain('a.png)');
    expect(result).not.toContain('b.png)');
  });

  test('handles an image inside a subdirectory', () => {
    const imgData = Buffer.from('img-data');
    writeTmpFile('sub/dir/image.png', imgData);

    const markdown = '![img](sub/dir/image.png)';
    const result = inlineImages(markdown, tmpDir);

    expect(result).toBe(`![img](data:image/png;base64,${imgData.toString('base64')})`);
  });

  test('handles an absolute image path', () => {
    const imgData = Buffer.from('abs-img-data');
    const imgPath = writeTmpFile('abs.png', imgData);

    const markdown = `![abs](${imgPath})`;
    const result = inlineImages(markdown, tmpDir);

    expect(result).toBe(`![abs](data:image/png;base64,${imgData.toString('base64')})`);
  });

  test('returns markdown unchanged when there are no images', () => {
    const markdown = '# Hello\n\nSome paragraph text.\n';
    const result = inlineImages(markdown, tmpDir);
    expect(result).toBe(markdown);
  });

  test('handles empty alt text', () => {
    const imgData = Buffer.from('no-alt');
    writeTmpFile('img.png', imgData);

    const result = inlineImages('![](img.png)', tmpDir);
    expect(result).toBe(`![](data:image/png;base64,${imgData.toString('base64')})`);
  });
});
