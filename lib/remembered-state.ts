import { useEffect, useState } from 'react';

// Lives for as long as the page is open: switching modes unmounts a screen, but a reload starts everything blank again.
const memory = new Map<string, unknown>();

/** The last value stored under `key`, or `initial` the first time. Use it as the initial value of a `useState`. */
export const recall = <T>(key: string, initial: T): T => (memory.has(key) ? (memory.get(key) as T) : initial);

/** Stores `value` under `key` whenever it changes, so `recall` can hand it back when the screen is mounted again. */
export function useRemember<T>(key: string, value: T) {
  useEffect(() => { memory.set(key, value); }, [key, value]);
}

/** `useState` that hands back the last value stored under `key` when the screen is mounted again. */
export function useRememberedState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => recall(key, initial));
  useRemember(key, value);
  return [value, setValue] as const;
}
