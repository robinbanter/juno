import { useCallback, useEffect, useRef, useState } from "react";

import { ApiError } from "./api";

/**
 * One async read, with the three states a screen actually has to draw.
 *
 * Deliberately not react-query. This app makes a handful of calls from a
 * handful of screens, and a cache library would be more configuration than the
 * problem has — while still leaving the same three states to render.
 *
 * `refreshing` is separate from `loading` because they mean different things on
 * screen. A first load has nothing to show and gets a skeleton; a pull to
 * refresh already has content, and replacing it with a skeleton throws away
 * what the user was reading and makes the app feel like it lost its place.
 */
export type AsyncState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
};

export function useApi<T>(
  load: () => Promise<T>,
  deps: React.DependencyList = [],
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // A screen that unmounts mid-request must not set state afterwards, and a
  // slow first response must not overwrite a newer one.
  const generation = useRef(0);

  const run = useCallback(
    async (isRefresh: boolean) => {
      const mine = ++generation.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const result = await load();
        if (generation.current !== mine) return;
        setData(result);
      } catch (caught) {
        if (generation.current !== mine) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : caught instanceof Error
              ? caught.message
              : "Something went wrong",
        );
      } finally {
        if (generation.current === mine) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    run(false);
    return () => {
      // Invalidate anything in flight.
      generation.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refreshing, refresh: () => run(true) };
}

/** Relative time, short enough for a feed row. */
export function since(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(seconds)) return "";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/**
 * A money figure in whatever unit it is actually in.
 *
 * Never assumes dollars. A SOL-quoted pool with no USD feed is reported in SOL,
 * and printing a `$` in front of that number would overstate it by the SOL
 * price.
 */
export function money(
  value: number | null | undefined,
  currency = "USD",
  opts: { compact?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const compact = opts.compact !== false;

  const figure =
    compact && abs >= 1_000_000
      ? `${(abs / 1_000_000).toFixed(2)}M`
      : compact && abs >= 1_000
        ? `${(abs / 1_000).toFixed(2)}k`
        : abs === 0
          ? "0"
          : abs < 0.0001
            ? abs.toExponential(2)
            : abs < 1
              ? abs.toFixed(4)
              : abs.toFixed(2);

  return currency === "USD" ? `${sign}$${figure}` : `${sign}${figure} ${currency}`;
}

/** Token balances and trade sizes. */
export function tokens(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${Math.round(value).toLocaleString("en-US")}`;
  return value.toFixed(value < 1 ? 4 : 2);
}
