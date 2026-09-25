import { NativeSupabaseClient } from './supabase-edge.js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Cliente público do Supabase para uso no navegador com zero dependências externas.
// Se as variáveis ainda não foram configuradas, retorna null de forma segura sem quebrar o build.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? new NativeSupabaseClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
