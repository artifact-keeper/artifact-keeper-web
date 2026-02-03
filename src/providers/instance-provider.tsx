"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface InstanceConfig {
  id: string;
  name: string;
  url: string;
  apiKey?: string;
}

interface InstanceContextValue {
  instances: InstanceConfig[];
  activeInstance: InstanceConfig;
  switchInstance: (id: string) => void;
  addInstance: (config: Omit<InstanceConfig, "id">) => void;
  removeInstance: (id: string) => void;
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

  // Persist remote instances to localStorage
  const persist = useCallback((all: InstanceConfig[]) => {
    const remote = all.filter((i) => i.id !== "local");
    localStorage.setItem(STORAGE_KEY, JSON.stringify(remote));
  }, []);

  const switchInstance = useCallback((id: string) => {
    setActiveId(id);
    localStorage.setItem(ACTIVE_KEY, id);
    // Force reload to reset all query caches
    window.location.reload();
  }, []);

  const addInstance = useCallback(
    (config: Omit<InstanceConfig, "id">) => {
      const newInstance: InstanceConfig = {
        ...config,
        id: `instance-${Date.now()}`,
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
    (id: string) => {
      if (id === "local") return;
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
      value={{ instances, activeInstance, switchInstance, addInstance, removeInstance }}
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
