import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSupabaseEdge } from '../../src/lib/supabase-edge.js';

describe('supabase-edge client', () => {
  it('configura limit e offset corretamente usando range()', () => {
    const client = getSupabaseEdge({
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    });

    const query = client.from('orders').select('*').range(10, 19);
    expect(query.queryParams.get('limit')).toBe('10');
    expect(query.queryParams.get('offset')).toBe('10');
  });

  it('configura offset() diretamente', () => {
    const client = getSupabaseEdge({
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    });

    const query = client.from('orders').select('*').offset(50);
    expect(query.queryParams.get('offset')).toBe('50');
  });
});
