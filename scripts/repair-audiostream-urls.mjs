import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getSupabaseEdge } from '../src/lib/supabase-edge.js';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const supabase = getSupabaseEdge();

const R2_PUBLIC_BASE = 'https://pub-e90fb1c45fb048ee8e1136c9ee7a1463.r2.dev';

function extractUuid(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  return match ? match[1] : null;
}

async function checkHead(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function run() {
  console.log('Buscando pedidos com audiostream.kie.ai no Firestore...');
  const snap = await getDocs(collection(db, 'orders'));
  const candidatos = [];

  for (const d of snap.docs) {
    const data = d.data();
    const hasAudiostream = (data.audioUrl && data.audioUrl.includes('audiostream.kie.ai'))
      || (Array.isArray(data.audioFiles) && data.audioFiles.some(u => u && u.includes('audiostream.kie.ai')));

    if (hasAudiostream) {
      candidatos.push({ id: d.id, data });
    }
  }

  console.log(`Encontrados ${candidatos.length} pedidos com audiostream.kie.ai.`);

  let fixR2 = 0;
  let fixTemp = 0;
  let falhas = 0;

  for (let i = 0; i < candidatos.length; i++) {
    const { id: orderId, data } = candidatos[i];
    const currentFiles = Array.isArray(data.audioFiles) && data.audioFiles.length > 0
      ? data.audioFiles
      : [data.audioUrl].filter(Boolean);

    // 1. Checa se o R2 já possui as versões gravadas
    const r2Files = [];
    let r2AllExist = true;

    for (let fIdx = 0; fIdx < currentFiles.length; fIdx++) {
      const destUrl = `${R2_PUBLIC_BASE}/audios/${orderId}/versao-${fIdx + 1}.mp3`;
      const exists = await checkHead(destUrl);
      if (exists) {
        r2Files.push(destUrl);
      } else {
        r2AllExist = false;
        break;
      }
    }

    let finalAudioUrl = null;
    let finalAudioFiles = null;
    let modo = '';

    if (r2AllExist && r2Files.length === currentFiles.length) {
      finalAudioUrl = r2Files[0];
      finalAudioFiles = r2Files;
      modo = 'r2';
      fixR2++;
    } else {
      // 2. Se não está no R2, converte para tempfile.aiquickdraw.com
      const tempFiles = [];
      for (const f of currentFiles) {
        const uuid = extractUuid(f);
        if (uuid) {
          tempFiles.push(`https://tempfile.aiquickdraw.com/r/${uuid}.mp3`);
        } else {
          tempFiles.push(f);
        }
      }

      if (tempFiles.length > 0) {
        finalAudioUrl = tempFiles[0];
        finalAudioFiles = tempFiles;
        modo = 'tempfile';
        fixTemp++;
      } else {
        falhas++;
        continue;
      }
    }

    const updates = {
      audioUrl: finalAudioUrl,
      audioFiles: finalAudioFiles,
      updatedAt: new Date().toISOString()
    };
    if (modo === 'r2' && !data.audioArchivedAt) {
      updates.audioArchivedAt = new Date().toISOString();
    }

    // Grava no Firestore
    try {
      await updateDoc(doc(db, 'orders', orderId), updates);
    } catch (err) {
      console.warn(`Erro ao atualizar Firestore no pedido ${orderId}:`, err.message);
    }

    // Grava no Supabase via update (PATCH) para não violar not-null constraints de colunas não incluídas
    try {
      await supabase.from('orders').eq('id', orderId).update({
        audio_url: finalAudioUrl,
        audio_files: finalAudioFiles,
        updated_at: updates.updatedAt,
        ...(updates.audioArchivedAt ? { audio_archived_at: updates.audioArchivedAt } : {})
      });
    } catch (err) {
      console.warn(`Erro ao atualizar Supabase no pedido ${orderId}:`, err.message);
    }

    if ((i + 1) % 25 === 0 || i === candidatos.length - 1) {
      process.stdout.write(`\rProcessando: ${i + 1}/${candidatos.length} (R2 restaurado: ${fixR2}, Tempfile aplicado: ${fixTemp})`);
    }
  }

  console.log(`\n\nConcluído com sucesso!`);
  console.log(`- Total reparados via Cloudflare R2: ${fixR2}`);
  console.log(`- Total reparados via Tempfile (Kie.ai CDN): ${fixTemp}`);
  console.log(`- Falhas: ${falhas}`);
}

run().catch(console.error);
