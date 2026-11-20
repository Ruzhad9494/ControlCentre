// Ujian shared/lib yang tak perlukan DOM: format Malaysia (DBD 4), safeUrl/escapeHtml (TRD 6 #6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRM, formatDate, formatDateTime, initials } from '../../shared/lib/format.js';
import { safeUrl, escapeHtml } from '../../shared/lib/escape.js';

test('formatRM: RM 1,234.50 dan nilai tak sah', () => {
  assert.equal(formatRM(1234.5), 'RM 1,234.50');
  assert.equal(formatRM(-20), '-RM 20.00');
  assert.equal(formatRM('abc'), '-');
});

test('formatDate/formatDateTime: DD/MM/YYYY dan 24 jam waktu Malaysia', () => {
  assert.equal(formatDate('2026-11-19'), '19/11/2026');
  assert.equal(formatDate('2026-01-05T23:30:00Z'), '06/01/2026', 'UTC 23:30 = 07:30 esok di Malaysia');
  assert.equal(formatDateTime('2026-11-19T14:30:00+08:00'), '19/11/2026 14:30');
  assert.equal(formatDateTime('2026-11-19T00:05:00+08:00'), '19/11/2026 00:05');
  assert.equal(formatDate(''), '-');
  assert.equal(formatDate('bukan tarikh'), '-');
});

test('initials', () => {
  assert.equal(initials('Ahmad bin Ali'), 'AB');
  assert.equal(initials(''), '?');
});

test('safeUrl sekat javascript:/data:, escapeHtml', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl(' JavaScript:alert(1)'), '#');
  assert.equal(safeUrl('data:text/html,x'), '#');
  assert.equal(safeUrl('/claimpro/'), '/claimpro/');
  assert.equal(safeUrl('blob:https://cc.voltake.com/1234-abcd'), 'blob:https://cc.voltake.com/1234-abcd', 'gambar canvas');
  assert.equal(safeUrl('https://cc.voltake.com/x'), 'https://cc.voltake.com/x');
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
});
