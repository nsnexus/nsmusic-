import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';

/**
 * Gera a chave única no bucket R2 para o vídeo do pedido.
 */
export function generateR2Key(orderId) {
  return `videos/${orderId}-${Date.now()}.mp4`;
}

/**
 * Constrói a URL pública final a partir do domínio configurado e da chave do R2.
 */
export function constructPublicUrl(publicBaseUrl, key) {
  const base = (publicBaseUrl || '').replace(/\/+$/, '');
  const cleanKey = (key || '').replace(/^\/+/, '');
  return `${base}/${cleanKey}`;
}

let cachedS3Client = null;
let cachedConfigHash = '';

function getS3Client(config) {
  const accountId = config.R2_ACCOUNT_ID;
  const accessKey = config.R2_ACCESS_KEY_ID;
  const secretKey = config.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKey || !secretKey) {
    throw new Error('Credenciais do Cloudflare R2 não configuradas no ambiente');
  }

  const hash = `${accountId}:${accessKey}`;
  if (cachedS3Client && cachedConfigHash === hash) {
    return cachedS3Client;
  }

  cachedS3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
  });
  cachedConfigHash = hash;

  return cachedS3Client;
}

/**
 * Faz upload do arquivo MP4 para o Cloudflare R2.
 *
 * @param {string} filePath - Caminho do arquivo .mp4 local
 * @param {string} orderId - ID do pedido
 * @param {Object} [config] - Variáveis de ambiente opcionais
 * @returns {Promise<string>} URL pública do vídeo
 */
export async function uploadVideoToR2(filePath, orderId, config = process.env) {
  if (!filePath) {
    throw new Error('Caminho do arquivo de vídeo obrigatório');
  }
  if (!orderId) {
    throw new Error('ID do pedido obrigatório');
  }

  // 1. Se qualquer chave R2 S3 foi fornecida, valida e utiliza S3 nativo
  const hasR2Config = ('R2_ACCOUNT_ID' in config) || ('R2_ACCESS_KEY_ID' in config) || ('R2_SECRET_ACCESS_KEY' in config);
  if (hasR2Config) {
    const s3 = getS3Client(config);
    const stat = await fsPromises.stat(filePath);
    if (stat.size === 0) {
      throw new Error('Arquivo de vídeo está vazio (0 bytes)');
    }

    const bucketName = config.R2_BUCKET_NAME || 'nsmusic-media';
    const publicBaseUrl = config.R2_PUBLIC_URL || 'https://pub-e90fb1c45fb048ee8e1136c9ee7a1463.r2.dev';
    const key = generateR2Key(orderId);
    const fileStream = fs.createReadStream(filePath);

    console.log(`[R2Uploader] Iniciando upload para R2 via S3 (${stat.size} bytes) -> key: ${key}`);

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: fileStream,
      ContentType: 'video/mp4',
      ContentLength: stat.size,
    });

    await s3.send(command);

    const publicUrl = constructPublicUrl(publicBaseUrl, key);
    console.log(`[R2Uploader] Upload via S3 concluído com sucesso: ${publicUrl}`);
    return publicUrl;
  }

  // 2. Se nenhuma credencial S3 for configurada, utiliza o upload direto pela aplicação Next.js
  // (Cloudflare Pages possui binding interno nsmusic_media direto para o R2)
  const stat = await fsPromises.stat(filePath);
  if (stat.size === 0) {
    throw new Error('Arquivo de vídeo está vazio (0 bytes)');
  }

  const appUrl = (config.NSMUSIC_APP_URL || config.APP_URL || 'https://nsmusic.nsnexus.com.br').replace(/\/+$/, '');
  const targetUrl = `${appUrl}/api/video/upload?orderId=${encodeURIComponent(orderId)}&ext=mp4`;

  console.log(`[R2Uploader] Enviando vídeo para o R2 via Pages API: ${targetUrl} (${stat.size} bytes)...`);

  const buffer = await fsPromises.readFile(filePath);
  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Length': String(stat.size),
    },
    body: buffer,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`Falha no upload para /api/video/upload (HTTP ${response.status}): ${errText}`);
  }

  const data = await response.json().catch(() => ({}));
  if (!data?.url) {
    throw new Error('Resposta de upload do R2 inválida (sem URL pública)');
  }

  console.log(`[R2Uploader] Upload para R2 via Pages concluído com sucesso: ${data.url}`);
  return data.url;
}
