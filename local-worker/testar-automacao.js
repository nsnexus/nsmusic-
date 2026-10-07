import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initSunoBrowser, gerarMusicaNoSuno, closeSunoBrowser } from './suno-automator.js';
import { uploadAudioParaR2 } from './r2-uploader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega variáveis (.env local ou .env.local na raiz)
if (fs.existsSync(path.resolve(__dirname, '.env'))) {
  dotenv.config({ path: path.resolve(__dirname, '.env') });
} else if (fs.existsSync(path.resolve(__dirname, '../.env.local'))) {
  dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
}

async function executarTeste() {
  console.log('\n=============================================================');
  console.log('🧪 TESTE ISOLADO DA AUTOMAÇÃO DO SUNO.COM (PLAYWRIGHT)');
  console.log('Este teste irá:');
  console.log(' 1. Abrir o Suno.com com seu perfil salvo do Chrome');
  console.log(' 2. Preencher uma letra de teste');
  console.log(' 3. Gerar a música na sua conta oficial');
  console.log(' 4. Capturar a URL direta da CDN');
  console.log(' 5. Fazer upload para o Cloudflare R2');
  console.log('=============================================================\n');

  try {
    // 1. Inicializa o navegador e valida login
    await initSunoBrowser();

    const orderId = `teste-manual-${Date.now()}`;
    const prompt = `[Verse 1]\nEsse é um teste rápido do robô\nPara ver se a automação está cem por cento\nSuno e R2 trabalhando juntos\nSem travar nem por um momento\n\n[Chorus]\nTeste do robô local!\nFuncionando perfeitamente bem!`;
    const style = 'Acoustic Pop, Upbeat';
    const title = 'Teste Robô Suno';

    console.log('[Teste] 🎹 Iniciando geração da música de teste no Suno...');
    const resultado = await gerarMusicaNoSuno({
      prompt,
      style,
      title,
      onProgress: (status) => console.log(`[Teste] ⏳ ${status}`)
    });

    if (!resultado || !resultado.clips || resultado.clips.length === 0) {
      throw new Error('Nenhum clipe de áudio retornado pelo Suno.');
    }

    console.log(`\n[Teste] ✅ Suno concluiu a geração! ${resultado.clips.length} clipes obtidos.`);

    // 2. Upload para Cloudflare R2
    console.log('[Teste] 📤 Baixando áudios da CDN e enviando para o Cloudflare R2...');
    const clip1 = resultado.clips[0];
    const clip2 = resultado.clips[1] || resultado.clips[0];

    const [up1, up2] = await Promise.all([
      uploadAudioParaR2({ audioUrl: clip1.audioUrl, clipId: clip1.id, orderId, clipIndex: 1 }),
      uploadAudioParaR2({ audioUrl: clip2.audioUrl, clipId: clip2.id, orderId, clipIndex: 2 })
    ]);

    console.log('\n=============================================================');
    console.log('🎉 TESTE CONCLUÍDO COM SUCESSO TOTAL!');
    console.log(`Faixa 1 (R2): ${up1.r2Url || clip1.audioUrl}`);
    console.log(`Faixa 2 (R2): ${up2.r2Url || clip2.audioUrl}`);
    console.log('=============================================================\n');
    console.log('Você pode abrir os links acima no seu navegador para ouvir a música!');
  } catch (err) {
    console.error('\n❌ ERRO NO TESTE:', err.message);
  } finally {
    console.log('[Teste] Fechando navegador...');
    await closeSunoBrowser().catch(() => {});
    process.exit(0);
  }
}

executarTeste();
