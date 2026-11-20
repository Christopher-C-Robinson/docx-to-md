import * as fs from 'fs';
import * as path from 'path';

describe('web busy-state guards', () => {
  const html = fs.readFileSync(path.join(__dirname, '../../web/index.html'), 'utf8');

  test('guards single-file actions while conversion is in progress', () => {
    expect(html).toContain("if (isProcessing) {");
    expect(html).toContain('Conversion is still in progress. Please wait for it to finish.');
  });

  test('disables single-file actions while busy and replaces silent download guards', () => {
    expect(html).toContain('function syncActionAvailability()');
    expect(html).toContain('const enabled = hasSession && !isProcessing && !isBatchRunning;');
    expect(html).toContain("if (!guardRapidAction() || !guardSessionAction('Download')) return;");
    expect(html).toContain("if (!guardRapidAction() || !guardSessionAction('Copy')) return;");
    expect(html).not.toContain('if (!sessionId || isProcessing) return;');
  });

  test('guards batch conversion while a batch run is in flight', () => {
    expect(html).toContain('Batch conversion is already in progress. Please wait.');
    expect(html).toContain('Please wait for batch conversion to finish before starting a download.');
  });

  test('throttles rapid repeated action clicks', () => {
    expect(html).toContain('function guardRapidAction()');
    expect(html).toContain('Please wait a moment before trying that again.');
  });

  test('surfaces friendly fallback for raw runtime-like errors', () => {
    expect(html).toContain('Something unexpected happened while processing your file. Please try again.');
  });
});
