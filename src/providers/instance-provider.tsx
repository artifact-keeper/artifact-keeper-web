"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import apiClient from "@/lib/api-client";

export interface InstanceConfig {
  id: string;
  name: string;
  url: string;
}

interface InstanceContextValue {
  instances: InstanceConfig[];
  activeInstance: InstanceConfig;
  switchInstance: (id: string) => void;
  addInstance: (config: { name: string; url: string; apiKey: string }) => Promise<void>;
  removeInstance: (id: string) => Promise<void>;
  instanceStatuses: Record<string, boolean>;
  refreshStatuses: () => void;
}

const STORAGE_KEY = "ak_instances";
const ACTIVE_KEY = "ak_active_instance";

const LOCAL_INSTANCE: InstanceConfig = {
  id: "local",
  name: "Local",
  url: "",  // empty = use relative URLs (same origin)
};

const InstanceContext = createContext<InstanceContextValue | null>(null);

export function InstanceProvider({ children }: { children: ReactNode }) {
  const [instances, setInstances] = useState<InstanceConfig[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const remote: InstanceConfig[] = JSON.parse(stored);
        return [LOCAL_INSTANCE, ...remote];
      }
    } catch {
      // ignore parse errors
    }
    return [LOCAL_INSTANCE];
  });
  const [activeId, setActiveId] = useState(() => {
    try {
      return localStorage.getItem(ACTIVE_KEY) ?? "local";
    } catch {
      return "local";
    }
  });

  // Persist remote instances to localStorage (metadata only, no API keys)
  const persist = useCallback((all: InstanceConfig[]) => {
    const remote = all.filter((i) => i.id !== "local");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
  }, []);

  const [instanceStatuses, setInstanceStatuses] = useState<Record<string, boolean>>({});

  const refreshStatuses = useCallback(() => {
    const remote = instances.filter((i) => i.id !== "local");
    for (const inst of remote) {
      const url = inst.url.endsWith("/") ? `${inst.url}health` : `${inst.url}/health`;
      fetch(url, { method: "GET", signal: AbortSignal.timeout(5000) })
        .then((res) => {
          setInstanceStatuses((prev) => ({ ...prev, [inst.id]: res.ok }));
        })
        .catch(() => {
          setInstanceStatuses((prev) => ({ ...prev, [inst.id]: false }));
        });
    }
    // Local is always considered online
    setInstanceStatuses((prev) => ({ ...prev, local: true }));
  }, [instances]);

  // Refresh on mount and when instances change
  useEffect(() => {
    // Schedule async to avoid lint warning about setState in effect
    const timer = setTimeout(refreshStatuses, 0);
    return () => clearTimeout(timer);
  }, [refreshStatuses]);

  const switchInstance = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
    // Force reload to reset all query caches
    window.location.reload();
  }, []);

  const addInstance = useCallback(
    async (config: { name: string; url: string; apiKey: string }) => {
      // Store API key securely on the backend; only metadata comes back
      const { data } = await apiClient.post<{
        id: string;
        name: string;
        url: string;
      }>("/api/v1/instances", {
        name: config.name,
        url: config.url,
        api_key: config.apiKey,
      });

      const newInstance: InstanceConfig = {
        id: data.id,
        name: data.name,
        url: data.url,
      };
      setInstances((prev) => {
        const next = [...prev, newInstance];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeInstance = useCallback(
    async (id: string) => {
      if (id === "local") return;
      try {
        await apiClient.delete(`/api/v1/instances/${id}`);
      } catch {
        // Ignore backend errors - remove locally anyway
      }
      setInstances((prev) => {
        const next = prev.filter((i) => i.id !== id);
        persist(next);
        return next;
      });
      if (activeId === id) {
        setActiveId("local");
        localStorage.setItem(ACTIVE_KEY, "local");
      }
    },
    [activeId, persist]
  );

  const activeInstance = instances.find((i) => i.id === activeId) ?? LOCAL_INSTANCE;

  return (
    <InstanceContext.Provider
      value={{ instances, activeInstance, switchInstance, addInstance, removeInstance, instanceStatuses, refreshStatuses }}
    >
      {children}
    </InstanceContext.Provider>
  );
}

export function useInstance() {
  const ctx = useContext(InstanceContext);
  if (!ctx) throw new Error("useInstance must be used within InstanceProvider");
  return ctx;
}
