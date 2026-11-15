import { describe, it, expect } from 'vitest';
import { isIosWebView } from '@/lib/userAgent';

describe('isIosWebView', () => {
  it('detecta WebView do iPhone (sem Safari/)', () => {
    expect(isIosWebView('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148')).toBe(true);
  });
  it('não confunde Safari, Chrome e Android', () => {
    expect(isIosWebView('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isIosWebView('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0 Mobile/15E148 Safari/604.1')).toBe(false);
    expect(isIosWebView('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36')).toBe(false);
    expect(isIosWebView('')).toBe(false);
  });
});
