// Versão do cache de áudio — entra como `&v=` em toda URL do /api/audio/proxy montada no cliente.
//
// Por que existe: em 28/08/2026 a CDN de origem (musicfile.kie.ai) passou a responder 200 com corpo
// VAZIO para faixas que antes serviam o MP3 completo. Como o proxy mandava
// `Cache-Control: immutable, max-age=1 ano`, o navegador de quem abriu a página naquela janela
// guardou o arquivo vazio — e continuava com a prévia quebrada mesmo depois de a origem voltar ao
// normal e do proxy passar a buscar na CDN alternativa. Não havia como invalidar isso remotamente.
//
// Incrementar esta constante muda a URL e força o navegador a buscar de novo, ignorando o que já
// está cacheado. Use quando uma correção precisar alcançar quem já carregou a versão quebrada.
export const AUDIO_CACHE_VERSION = 2;
