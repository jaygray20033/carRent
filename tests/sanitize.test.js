// tests/sanitize.test.js — sanitizeText() plain-text XSS stripper (Day 41 §8).
import { sanitizeText } from '../src/utils/sanitize.js';

describe('sanitizeText', () => {
  it('returns an empty string for non-string input', () => {
    expect(sanitizeText(undefined)).toBe('');
    expect(sanitizeText(null)).toBe('');
    expect(sanitizeText(42)).toBe('');
    expect(sanitizeText({})).toBe('');
  });

  it('leaves plain text untouched (aside from trimming)', () => {
    expect(sanitizeText('  Xe rất tốt, tài xế thân thiện!  ')).toBe(
      'Xe rất tốt, tài xế thân thiện!'
    );
  });

  it('strips a <script> block entirely', () => {
    const out = sanitizeText('Nice car<script>alert(1)</script> thanks');
    expect(out).not.toMatch(/script/i);
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
  });

  it('removes iframe/style/embed markup', () => {
    expect(sanitizeText('<iframe src="evil"></iframe>hello')).toBe('hello');
    expect(sanitizeText('<style>body{display:none}</style>text')).toBe('text');
  });

  it('strips stray HTML tags and angle brackets', () => {
    expect(sanitizeText('<b>bold</b> and <i>italic</i>')).toBe('bold and italic');
    expect(sanitizeText('a < b and c > d')).toBe('a  b and c  d');
  });

  it('neutralises javascript: and data: URL schemes', () => {
    const out = sanitizeText('click javascript:alert(1) or data:text/html,x');
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/data:/i);
  });
});
