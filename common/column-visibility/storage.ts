const STORAGE_PREFIX = "oasis.next.columnVisibility.v1.";

export function columnVisibilityStorageKey(pageId: string): string {
  return `${STORAGE_PREFIX}${pageId}`;
}

function serializeKeySet(keys: ReadonlySet<string>): string {
  return [...keys].sort().join("\0");
}

const snapshotCache = new Map<
  string,
  { serialized: string; snapshot: ReadonlySet<string> }
>();

export function invalidateColumnVisibilitySnapshot(storageKey: string): void {
  snapshotCache.delete(storageKey);
}

export function getStableColumnVisibilitySnapshot<K extends string>(
  storageKey: string,
  compute: () => Set<K>,
): Set<K> {
  const snapshot = compute();
  const serialized = serializeKeySet(snapshot);
  const cached = snapshotCache.get(storageKey);

  if (cached && cached.serialized === serialized) {
    return cached.snapshot as Set<K>;
  }

  snapshotCache.set(storageKey, { serialized, snapshot });
  return snapshot;
}

export function readColumnVisibility(
  storageKey: string,
  allKeys: readonly string[],
): Set<string> | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;

    const valid = new Set(allKeys);
    const selected = parsed.filter(
      (k): k is string => typeof k === "string" && valid.has(k),
    );

    if (selected.length === 0) return null;
    return new Set(selected);
  } catch {
    return null;
  }
}

export function writeColumnVisibility(
  storageKey: string,
  selected: ReadonlySet<string>,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey, JSON.stringify([...selected]));
}
