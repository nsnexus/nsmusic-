// Leitura de variável de ambiente que funciona nos dois runtimes: o `env` da requisição no
// Cloudflare (getRequestContext) e o process.env do build/local.
//
// Extraído de src/lib/suno.js em 24/09/2026, quando um segundo módulo precisou da mesma função sem
// criar ciclo de import. src/lib/suno.js continua reexportando `readEnvValue`, então nenhum
// chamador antigo mudou.
export function readEnvValue(env, name) {
  return String((env && env[name]) || process.env[name] || '').trim();
}
