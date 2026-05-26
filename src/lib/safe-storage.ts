/** Minimal storage adapter; WeChat webview may throw when localStorage is blocked. */
export type SafeStorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const memory = new Map<string, string>();

export function createSafeStorage(storage: Storage | undefined): SafeStorageAdapter {
  if (!storage) {
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    };
  }

  return {
    getItem(key) {
      try {
        return storage.getItem(key);
      } catch {
        return memory.get(key) ?? null;
      }
    },
    setItem(key, value) {
      try {
        storage.setItem(key, value);
        memory.set(key, value);
      } catch {
        memory.set(key, value);
      }
    },
    removeItem(key) {
      try {
        storage.removeItem(key);
      } catch {
        /* ignore */
      }
      memory.delete(key);
    },
  };
}

export function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
