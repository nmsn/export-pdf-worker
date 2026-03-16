interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}

export default function createWorkerFunction<T extends (...args: any[]) => Promise<any>>(
  asyncFunction: T
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  let requestId = 0;
  const pendingRequests = new Map<number, PendingRequest>();

  const workerScript = `
    const targetFunction = ${asyncFunction};

    onmessage = async (event: MessageEvent<[number, any[]]>) => {
      const [id, parameters] = event.data;

      try {
        const result = await targetFunction(...parameters);
        postMessage([id, 'success', result]);
      } catch (error) {
        postMessage([id, 'error', (error as Error).message]);
      }
    };
  `;

  const workerBlob = new Blob([workerScript]);
  const workerUrl = URL.createObjectURL(workerBlob);
  const worker = new Worker(workerUrl);

  worker.onmessage = (event: MessageEvent<[number, 'success' | 'error', any]>) => {
    const [id, status, data] = event.data;
    const pending = pendingRequests.get(id);

    if (!pending) return;

    if (status === 'success') {
      pending.resolve(data);
    } else {
      pending.reject(new Error(data));
    }

    pendingRequests.delete(id);
  };

  return (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    return new Promise((resolve, reject) => {
      const currentRequestId = ++requestId;
      pendingRequests.set(currentRequestId, { resolve, reject });
      worker.postMessage([currentRequestId, args]);
    });
  };
}
