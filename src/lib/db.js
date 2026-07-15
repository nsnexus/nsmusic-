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

export const saveTask = async (taskId, status, result = null) => {
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    await setDoc(docRef, {
      status,
      result,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error saving task:", err);
  }
};

export const updateTaskResult = async (taskId, result) => {
  try {
    const docRef = doc(db, 'suno_tasks', taskId);
    await updateDoc(docRef, {
      status: 'COMPLETED',
      result,
      updatedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error("Error updating task result:", err);
  }
};
