// Leitura do Google Drive com conta de serviço, sem SDK (Edge Runtime: só fetch + WebCrypto).
//
// A conta de serviço só enxerga o que foi compartilhado com o e-mail dela — no caso, a pasta de
// posts do Instagram. Escopo somente leitura: este módulo nunca escreve nem apaga nada no Drive.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';
const SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const TIMEOUT_MS = 12000;

export const MIME_PASTA = 'application/vnd.google-apps.folder';
export const MIME_GOOGLE_DOC = 'application/vnd.google-apps.document';

// Um token por conta de serviço, reaproveitado enquanto o isolate viver.
const cacheDeToken = new Map();

export class DriveError extends Error {
  constructor(mensagem, { status = 0, motivo = '' } = {}) {
    super(mensagem);
    this.name = 'DriveError';
    this.status = status;
    this.motivo = motivo;
  }
}

/** Texto em português para o painel, sem repassar a mensagem crua do Google. */
export function explicarErroDrive(err) {
  if (err?.motivo === 'credencial') return 'A chave da conta de serviço do Google é inválida. Cole o arquivo JSON de novo.';
  if (err?.status === 401) return 'O Google recusou a conta de serviço. Gere uma chave nova e cole de novo.';
  if (err?.status === 403) return 'A conta de serviço não tem acesso. Confira se a API do Drive está ativada e se a pasta foi compartilhada com o e-mail dela.';
  if (err?.status === 404) return 'Pasta ou arquivo não encontrado. Confira se a pasta foi compartilhada com o e-mail da conta de serviço.';
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') return 'O Google Drive demorou demais para responder.';
  return 'Não foi possível falar com o Google Drive agora.';
}

/** ID de arquivo/pasta do Drive: letras, números, hífen e sublinhado. */
export function isDriveId(valor) {
  return /^[A-Za-z0-9_-]{10,120}$/.test(String(valor || ''));
}

/** Aceita o link da pasta (ou o ID puro) e devolve só o ID. */
export function extrairIdDaPasta(entrada) {
  const texto = String(entrada || '').trim();
  if (!texto) return '';
  const m = texto.match(/\/folders\/([A-Za-z0-9_-]{10,120})/) || texto.match(/[?&]id=([A-Za-z0-9_-]{10,120})/);
  if (m) return m[1];
  return isDriveId(texto) ? texto : '';
}

/** Valida o JSON da conta de serviço colado no painel e guarda só o que é usado. */
export function lerContaDeServico(entrada) {
  let obj = entrada;
  if (typeof entrada === 'string') {
    try {
      obj = JSON.parse(entrada);
    } catch (e) {
      return null;
    }
  }
  const email = String(obj?.client_email || '').trim();
  const chave = String(obj?.private_key || '');
  if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(email)) return null;
  if (!chave.includes('BEGIN PRIVATE KEY')) return null;
  return { client_email: email, private_key: chave };
}

function base64Url(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i += 1) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemParaDer(pem) {
  const limpo = String(pem).replace(/-----[A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(limpo);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) der[i] = bin.charCodeAt(i);
  return der.buffer;
}

async function obterToken(conta) {
  const emCache = cacheDeToken.get(conta.client_email);
  if (emCache && emCache.expiraEm > Date.now() + 60000) return emCache.token;

  const enc = new TextEncoder();
  const agora = Math.floor(Date.now() / 1000);
  const cabecalho = base64Url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const corpo = base64Url(enc.encode(JSON.stringify({
    iss: conta.client_email, scope: SCOPE, aud: TOKEN_URL, iat: agora, exp: agora + 3600,
  })));

  let assinatura;
  try {
    const chave = await crypto.subtle.importKey(
      'pkcs8',
      pemParaDer(conta.private_key),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    assinatura = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', chave, enc.encode(`${cabecalho}.${corpo}`));
  } catch (e) {
    throw new DriveError('Chave da conta de serviço inválida.', { motivo: 'credencial' });
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${cabecalho}.${corpo}.${base64Url(assinatura)}`,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new DriveError('Google recusou a conta de serviço.', { status: res.status === 400 ? 401 : res.status });
  }

  cacheDeToken.set(conta.client_email, { token: json.access_token, expiraEm: Date.now() + (Number(json.expires_in) || 3600) * 1000 });
  return json.access_token;
}

async function driveFetch(conta, caminho, params = {}) {
  const token = await obterToken(conta);
  const url = new URL(`${DRIVE_BASE}/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new DriveError(`Drive HTTP ${res.status}`, { status: res.status });
  return res;
}

/** Itens diretamente dentro de uma pasta, em ordem de nome. */
export async function listarPasta(conta, pastaId, { apenasPastas = false } = {}) {
  if (!isDriveId(pastaId)) throw new DriveError('ID de pasta inválido.', { status: 404 });
  let q = `'${pastaId}' in parents and trashed = false`;
  if (apenasPastas) q += ` and mimeType = '${MIME_PASTA}'`;
  const res = await driveFetch(conta, 'files', {
    q,
    fields: 'files(id,name,mimeType,size)',
    orderBy: 'name_natural',
    pageSize: 200,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const json = await res.json();
  return (json.files || []).map((f) => ({
    id: String(f.id),
    nome: String(f.name || ''),
    mime: String(f.mimeType || ''),
    tamanho: Number(f.size) || 0,
  }));
}

/** Conteúdo de um .txt (ou de um Google Docs, exportado como texto). */
export async function lerTexto(conta, arquivo) {
  if (!isDriveId(arquivo?.id)) throw new DriveError('ID de arquivo inválido.', { status: 404 });
  const res = arquivo.mime === MIME_GOOGLE_DOC
    ? await driveFetch(conta, `files/${arquivo.id}/export`, { mimeType: 'text/plain' })
    : await driveFetch(conta, `files/${arquivo.id}`, { alt: 'media', supportsAllDrives: true });
  return (await res.text()).replace(/^﻿/, '');
}

/** Metadados de um arquivo (usado pelo proxy de mídia para validar tipo e tamanho antes de baixar). */
export async function lerMetadados(conta, arquivoId) {
  if (!isDriveId(arquivoId)) throw new DriveError('ID de arquivo inválido.', { status: 404 });
  const res = await driveFetch(conta, `files/${arquivoId}`, { fields: 'id,name,mimeType,size', supportsAllDrives: true });
  const f = await res.json();
  return { id: String(f.id), nome: String(f.name || ''), mime: String(f.mimeType || ''), tamanho: Number(f.size) || 0 };
}

/** Resposta crua com os bytes do arquivo, para repassar em stream. */
export async function baixarArquivo(conta, arquivoId) {
  if (!isDriveId(arquivoId)) throw new DriveError('ID de arquivo inválido.', { status: 404 });
  return driveFetch(conta, `files/${arquivoId}`, { alt: 'media', supportsAllDrives: true });
}
