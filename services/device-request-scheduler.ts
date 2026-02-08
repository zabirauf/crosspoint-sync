import { log } from './logger';

export type RequestPriority = 'high' | 'normal' | 'low';

export class DeviceSchedulerDroppedError extends Error {
  constructor() {
    super('Request dropped: scheduler busy');
    this.name = 'DeviceSchedulerDroppedError';
  }
}

interface QueueItem<T = unknown> {
  execute: () => Promise<T>;
  priority: RequestPriority;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

const PRIORITY_ORDER: Record<RequestPriority, number> = {
  high: 0,
  normal: 1,
  low: 2,
};

export class DeviceRequestScheduler {
  private queue: QueueItem[] = [];
  private activeCount = 0;
  private externalBusy = false;
  private maxConcurrent: number;

  constructor(maxConcurrent = 1) {
    this.maxConcurrent = maxConcurrent;
  }

  schedule<T>(opts: {
    execute: () => Promise<T>;
    priority?: RequestPriority;
    droppable?: boolean;
  }): Promise<T> {
    const priority = opts.priority ?? 'normal';
    const droppable = opts.droppable ?? false;

    if (droppable && (this.activeCount >= this.maxConcurrent || this.externalBusy)) {
      log('scheduler', `Dropped ${priority}-priority request (busy)`);
      return Promise.reject(new DeviceSchedulerDroppedError());
    }

    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = {
        execute: opts.execute,
        priority,
        resolve,
        reject,
      };

      // Insert in priority order (stable: same-priority items stay FIFO)
      const insertIdx = this.queue.findIndex(
        (q) => PRIORITY_ORDER[q.priority] > PRIORITY_ORDER[priority],
      );
      if (insertIdx === -1) {
        this.queue.push(item as QueueItem);
      } else {
        this.queue.splice(insertIdx, 0, item as QueueItem);
      }

      this.processNext();
    });
  }

  setExternalBusy(busy: boolean): void {
    this.externalBusy = busy;
    log('scheduler', `External busy: ${busy}`);
    if (!busy) {
      this.processNext();
    }
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.maxConcurrent || this.externalBusy || this.queue.length === 0) {
      return;
    }

    const item = this.queue.shift()!;
    this.activeCount++;

    try {
      const result = await item.execute();
      item.resolve(result);
    } catch (err) {
      item.reject(err);
    } finally {
      this.activeCount--;
      this.processNext();
    }
  }
}

export const deviceScheduler = new DeviceRequestScheduler();
