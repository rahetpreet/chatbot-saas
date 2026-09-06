"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rangeQuery, type RangeState } from "./shared";

/**
 * Loads one analytics endpoint for the current date range.
 *
 * Late responses are discarded: changing the range twice quickly used to let
 * the slower first request land last and repaint the screen with the wrong
 * period's numbers, which looks exactly like a data bug.
 */
export function useAnalytics<T = any>(
  path: string,
  range: RangeState,
  extra: Record<string, string | null | undefined> = {},
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Serialised so a fresh object literal on every render does not restart the
  // request in a loop.
  const extraKey = JSON.stringify(extra);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const query = rangeQuery(range, JSON.parse(extraKey));
      const res = await fetch(`${path}?${query}`);
      const json = await res.json();
      if (id !== requestId.current) return;

      if (!json.success) {
        setError(json.error?.message || "Could not load this report.");
        setData(null);
        return;
      }
      setData(json.data);
    } catch {
      if (id === requestId.current) setError("Could not reach the server.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path, range, extraKey]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load };
}
