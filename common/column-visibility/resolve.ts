import type {PageColumnDef} from '@/common/column-visibility/types';

export function resolveVisibleColumns<K extends string>(
  selected: ReadonlySet<string> | null | undefined,
  columns: ReadonlyArray<PageColumnDef<K>>,
): PageColumnDef<K>[] {
  const pinnedKeys = columns.filter((c) => c.pinned).map((c) => c.key);
  const toggleableKeys = columns.filter((c) => !c.pinned).map((c) => c.key);

  if (!selected || selected.size === 0) {
    return [...columns];
  }

  const effective = new Set(selected);
  for (const key of pinnedKeys) {
    effective.add(key);
  }

  const visibleToggleable = toggleableKeys.filter((k) => effective.has(k));
  if (visibleToggleable.length === 0) {
    return columns.filter((c) => c.pinned);
  }

  return columns.filter((c) => c.pinned || effective.has(c.key));
}

export function defaultVisibleKeys<K extends string>(
  columns: ReadonlyArray<PageColumnDef<K>>,
): Set<K> {
  return new Set(columns.map((c) => c.key));
}

export function toggleableColumnCount<K extends string>(
  columns: ReadonlyArray<PageColumnDef<K>>,
): number {
  return columns.filter((c) => !c.pinned).length;
}
