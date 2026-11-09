"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/providers/auth-provider";
import { useProjects } from "@/hooks/use-projects";
import type { Project } from "@/lib/api/projects";

const STORAGE_KEY = "ak-active-project";

interface ProjectContextValue {
  projects: Project[];
  /** The project the app is scoped to, or null for "All projects". */
  activeProject: Project | null;
  setActiveProjectId: (id: string | null) => void;
}

const ProjectContext = createContext<ProjectContextValue>({
  projects: [],
  activeProject: null,
  setActiveProjectId: () => {},
});

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const { data } = useProjects({ enabled: isAuthenticated });
  const projects = useMemo(() => data ?? [], [data]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from localStorage after mount to keep SSR markup stable
    setActiveId(window.localStorage.getItem(STORAGE_KEY));
  }, []);

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveId(id);
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  // A stored id for a deleted project (or one the user lost access to)
  // resolves to null rather than filtering everything out.
  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeId) ?? null,
    [projects, activeId],
  );

  const value = useMemo(
    () => ({ projects, activeProject, setActiveProjectId }),
    [projects, activeProject, setActiveProjectId],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useActiveProject(): ProjectContextValue {
  return useContext(ProjectContext);
}
