import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';

export const getTask = async (taskId) => {
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (err) {
    console.error("Error getting task:", err);
    return null;
  }
};

export const saveTask = async (taskId, status, result = null, orderId = null) => {
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    await setDoc(docRef, {
      status,
      result,
      orderId,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error saving task:", err);
  }
};

export const updateTaskResult = async (taskId, result) => {
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    const docSnap = await getDoc(docRef);
    let orderId = null;
    if (docSnap.exists()) {
      orderId = docSnap.data().orderId;
    }

    await updateDoc(docRef, {
      status: 'COMPLETED',
      result,
      updatedAt: new Date().toISOString()
    });

    // Se tivermos o orderId salvo e a Kie.ai retornou as faixas, atualizamos a ordem no Firebase!
    if (orderId && result && result.data && Array.isArray(result.data)) {
      const tracks = result.data;
      if (tracks.length > 0) {
        const primaryAudio = tracks[0].audio_url || '';
        const audioFiles = tracks.map(t => t.audio_url).filter(Boolean);
        
        const orderRef = doc(db, 'orders', orderId);
        await updateDoc(orderRef, {
          audioUrl: primaryAudio,
          audioFiles: audioFiles,
          productionStatus: 'AUDIO_GERADO'
        });
        console.log(`Webhook: Ordem ${orderId} atualizada com sucesso com o áudio!`);
      }
    }
  } catch (err) {
    console.error("Error updating task result:", err);
  }
};
