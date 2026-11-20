import * as fs from 'fs';
import * as path from 'path';

describe('web busy-state guards', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../web/index.html'), 'utf8');

  test('guards single-file actions while conversion is in progress', () => {
    expect(html).toContain("if (isProcessing) {");
    expect(html).toContain('Conversion is still in progress. Please wait for it to finish.');
  });

  test('throttles rapid repeated action clicks', () => {
    expect(html).toContain('function guardRapidAction()');
    expect(html).toContain('Please wait a moment before trying that again.');
  });

  test('surfaces friendly fallback for raw runtime-like errors', () => {
    expect(html).toContain('Something unexpected happened while processing your file. Please try again.');
  });
});
