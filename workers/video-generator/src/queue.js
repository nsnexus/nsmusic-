/**
 * Fila assíncrona simples com controle de concorrência.
 * Evita sobrecarga de CPU na VPS durante múltiplos renders simultâneos.
 */
export class AsyncQueue {
  constructor(concurrency = 2) {
    this.concurrency = Math.max(1, concurrency);
    this.activeJobs = new Map(); // orderId -> promise
    this.waitingQueue = []; // array of { id, jobFn, resolve, reject }
  }

  getStats() {
    return {
      concurrency: this.concurrency,
      activeCount: this.activeJobs.size,
      queuedCount: this.waitingQueue.length,
      activeOrderIds: Array.from(this.activeJobs.keys()),
    };
  }

  isOrderProcessing(orderId) {
    return this.activeJobs.has(orderId) || this.waitingQueue.some(item => item.id === orderId);
  }

  async enqueue(id, jobFn) {
    return new Promise((resolve, reject) => {
      const item = { id, jobFn, resolve, reject };

      if (this.activeJobs.size < this.concurrency) {
        this._runJob(item);
      } else {
        this.waitingQueue.push(item);
      }
    });
  }

  async _runJob(item) {
    const { id, jobFn, resolve, reject } = item;
    this.activeJobs.set(id, item);

    try {
      const result = await jobFn();
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.activeJobs.delete(id);
      this._drainNext();
    }
  }

  _drainNext() {
    if (this.waitingQueue.length > 0 && this.activeJobs.size < this.concurrency) {
      const nextItem = this.waitingQueue.shift();
      if (nextItem) {
        this._runJob(nextItem);
      }
    }
  }
}
