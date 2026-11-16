import { NextResponse } from 'next/server';
import { lerEnvDaRequisicao } from '@/lib/adminRoute';
import { carregarConfigPublicacao, conferirAssinatura, MAX_BYTES_IMAGEM } from '@/lib/instagramPublicacao';
import { lerMetadados, baixarArquivo } from '@/lib/googleDrive';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// Serve UMA imagem da pasta de posts do Drive para a Meta baixar na hora de publicar.
//
// Rota pública por necessidade (quem chama é o servidor do Instagram), então o controle é a
// assinatura: o link é gerado pelo servidor, vale 30 minutos e só para aquele arquivo. Sem
// assinatura válida não toca no Drive. Só repassa JPEG de até 8 MB e o Content-Type é fixo — nunca
// o que vier da origem.
export async function GET(req) {
  const env = lerEnvDaRequisicao();
  const { searchParams } = new URL(req.url);
  const arquivoId = searchParams.get('f') || '';

  const valido = await conferirAssinatura(
    { arquivoId, expira: searchParams.get('e'), assinatura: searchParams.get('s') },
    env,
  );
  if (!valido) return NextResponse.json({ error: 'Link inválido ou vencido.' }, { status: 403 });

  try {
    const { config } = await carregarConfigPublicacao(env);
    if (!config.contaDeServico) return NextResponse.json({ error: 'Drive não configurado.' }, { status: 404 });

    const meta = await lerMetadados(config.contaDeServico, arquivoId);
    if (meta.mime !== 'image/jpeg' && !/\.jpe?g$/i.test(meta.nome)) {
      return NextResponse.json({ error: 'Arquivo não é JPG.' }, { status: 415 });
    }
    if (meta.tamanho > MAX_BYTES_IMAGEM) return NextResponse.json({ error: 'Arquivo grande demais.' }, { status: 413 });

    const origem = await baixarArquivo(config.contaDeServico, arquivoId);
    return new NextResponse(origem.body, {
      status: 200,
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        ...(meta.tamanho ? { 'Content-Length': String(meta.tamanho) } : {}),
      },
    });
  } catch (err) {
    console.warn('[instagram/midia] Falha ao servir imagem:', err.status || err.name);
    return NextResponse.json({ error: 'Imagem indisponível.' }, { status: 502 });
  }
}
