/** localStorage wrapper that never throws (private mode, blocked storage). */
const memory = new Map<string, string>();

function backend(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* fall through */
  }
  return {
    getItem: (k) => memory.get(k) ?? null,
    setItem: (k, v) => void memory.set(k, v),
  };
}

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = backend().getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    backend().setItem(key, JSON.stringify(value));
  } catch {
    /* ignore quota / blocked storage */
  }
}
