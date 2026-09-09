"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// A resource belongs to one route/filter. Late reads cannot paint over a new
// selection; failed refreshes retain the last successful data with an error.
export function useTasksResource<T>(load: () => Promise<T>, key: string) {
  const loader = useRef(load);
  const generation = useRef(0);
  loader.current = load;
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ key: string; data: T | null; loading: boolean; error: unknown }>({ key, data: null, loading: true, error: null });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    const requestGeneration = ++generation.current;
    setState((current) => ({ key, data: current.key === key ? current.data : null, loading: true, error: null }));
    loader.current().then(
      (data) => { if (active && requestGeneration === generation.current) setState({ key, data, loading: false, error: null }); },
      (error) => { if (active && requestGeneration === generation.current) setState((current) => ({ ...current, loading: false, error })); },
    );
    return () => { active = false; };
  }, [key, revision]);
  const replace = (data: T) => { generation.current += 1; setState({ key, data, loading: false, error: null }); };
  return { ...(state.key === key ? state : { data: null, loading: true, error: null }), refresh, replace };
}

export function useTasksMutation() {
  const pending = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState("");
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  async function run<T>(action: () => Promise<T>, onSuccess: (result: T) => void, successMessage: string): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const result = await action();
      if (mounted.current) {
        onSuccess(result);
        setMessage(successMessage);
      }
      return true;
    } catch (cause) {
      if (mounted.current) setError(cause);
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, error, message, run };
}
