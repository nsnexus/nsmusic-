import { NativeSupabaseClient, resolveSupabaseConfig } from './supabase-edge.js';

const config = resolveSupabaseConfig();
const supabaseUrl = config.url;
const supabaseAnonKey = config.anonKey;

// Cliente público do Supabase para uso no navegador com zero dependências externas.
// Se as variáveis ainda não foram configuradas, retorna null de forma segura sem quebrar o build.
export const supabase = (supabaseUrl && supabaseAnonKey)
  ? new NativeSupabaseClient(supabaseUrl, supabaseAnonKey)
  : null;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
