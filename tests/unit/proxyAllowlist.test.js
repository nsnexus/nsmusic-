import { describe, it, expect } from 'vitest';
import { isAllowedMediaHost, isAllowedMediaUrl } from '@/lib/proxyAllowlist';

// Ver A-05/A-06 em docs/audit/AUDIT_REPORT.md: os proxies de mídia eram SSRF genérico
// antes desta allowlist (Lote 1).

describe('isAllowedMediaHost', () => {
  it('aceita os domínios da allowlist', () => {
    expect(isAllowedMediaHost('musicfile.kie.ai')).toBe(true);
    expect(isAllowedMediaHost('cdn1.suno.ai')).toBe(true);
    expect(isAllowedMediaHost('cdn2.suno.ai')).toBe(true);
    expect(isAllowedMediaHost('audiopipe.suno.ai')).toBe(true);
    expect(isAllowedMediaHost('firebasestorage.googleapis.com')).toBe(true);
  });

  it('rejeita domínios fora da allowlist', () => {
    expect(isAllowedMediaHost('evil.com')).toBe(false);
    expect(isAllowedMediaHost('sub.musicfile.kie.ai')).toBe(false);
    expect(isAllowedMediaHost('musicfile.kie.ai.evil.com')).toBe(false);
    expect(isAllowedMediaHost('')).toBe(false);
    expect(isAllowedMediaHost(null)).toBe(false);
  });

  it('é case-insensitive', () => {
    expect(isAllowedMediaHost('MUSICFILE.KIE.AI')).toBe(true);
  });
});

describe('isAllowedMediaUrl', () => {
  it('aceita URL https de host permitido', () => {
    expect(isAllowedMediaUrl('https://musicfile.kie.ai/tracks/a.mp3')).toBe(true);
  });

  it('rejeita http (não https) mesmo em host permitido', () => {
    expect(isAllowedMediaUrl('http://musicfile.kie.ai/tracks/a.mp3')).toBe(false);
  });

  it('rejeita host fora da allowlist (SSRF)', () => {
    expect(isAllowedMediaUrl('https://internal.169.254.169.254/latest/meta-data')).toBe(false);
    expect(isAllowedMediaUrl('https://attacker.example.com/evil.html')).toBe(false);
  });

  it('rejeita URL malformada sem lançar exceção', () => {
    expect(isAllowedMediaUrl('not-a-url')).toBe(false);
    expect(isAllowedMediaUrl('')).toBe(false);
  });
});
