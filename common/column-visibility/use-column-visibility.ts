"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

import type { PageColumnDef, PageColumnGroup } from "@/common/column-visibility/types";
import {
  defaultVisibleKeys,
  resolveVisibleColumns,
  toggleableColumnCount,
} from "./resolve";
import {
  columnVisibilityStorageKey,
  getStableColumnVisibilitySnapshot,
  invalidateColumnVisibilitySnapshot,
  readColumnVisibility,
  writeColumnVisibility,
} from "./storage";

const listeners = new Set<() => void>();

function subscribeColumnVisibility(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

function notifyColumnVisibilityListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function useColumnVisibility<K extends string>(
  pageId: string,
  columns: ReadonlyArray<PageColumnDef<K>>,
  groups?: ReadonlyArray<PageColumnGroup<K>>,
) {
  const storageKey = columnVisibilityStorageKey(pageId);
  const allKeys = useMemo(() => columns.map(c => c.key), [columns]);
  const toggleableKeys = useMemo(
    () => columns.filter(c => !c.pinned).map(c => c.key),
    [columns],
  );

  const getSnapshot = useCallback(() => {
    return getStableColumnVisibilitySnapshot(storageKey, () => {
      const stored = readColumnVisibility(storageKey, allKeys);
      if (!stored) return defaultVisibleKeys(columns);
      return new Set([...stored].filter((k): k is K => allKeys.includes(k as K)));
    });
  }, [storageKey, allKeys, columns]);

  const getServerSnapshot = useCallback(
    () =>
      getStableColumnVisibilitySnapshot(`${storageKey}:server`, () =>
        defaultVisibleKeys(columns),
      ),
    [storageKey, columns],
  );

  const selected = useSyncExternalStore(
    subscribeColumnVisibility,
    getSnapshot,
    getServerSnapshot,
  );

  const persist = useCallback(
    (next: Set<K>) => {
      writeColumnVisibility(storageKey, next);
      invalidateColumnVisibilitySnapshot(storageKey);
      invalidateColumnVisibilitySnapshot(`${storageKey}:server`);
      notifyColumnVisibilityListeners();
    },
    [storageKey],
  );

  const orderedVisible = useMemo(
    () => resolveVisibleColumns(selected, columns),
    [selected, columns],
  );

  const visibleCount = orderedVisible.length;

  const toggle = useCallback(
    (key: K) => {
      const col = columns.find(c => c.key === key);
      if (col?.pinned) return;

      const next = new Set(selected);
      if (next.has(key)) {
        const visibleToggleable = toggleableKeys.filter(
          k => k !== key && next.has(k),
        );
        if (visibleToggleable.length === 0) return;
        next.delete(key);
      } else {
        next.add(key);
      }
      persist(next);
    },
    [columns, persist, selected, toggleableKeys],
  );

  const selectAll = useCallback(() => {
    persist(defaultVisibleKeys(columns));
  }, [columns, persist]);

  const deselectAll = useCallback(() => {
    persist(new Set(columns.filter(c => c.pinned).map(c => c.key)));
  }, [columns, persist]);

  const pickerGroups = groups ?? [{ group: "Columns", columns }];

  const selectedToggleableCount = toggleableKeys.filter(k => selected.has(k)).length;
  const totalToggleableCount = toggleableColumnCount(columns);

  return {
    visibleKeys: selected,
    orderedVisible,
    visibleCount,
    toggle,
    selectAll,
    deselectAll,
    isHydrated: true,
    pickerGroups,
    selectedToggleableCount,
    totalToggleableCount,
  };
}
