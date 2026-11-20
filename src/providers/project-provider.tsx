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

/**
 * The scope lives in `sessionStorage`, not `localStorage` (#988 review): it
 * filters the Repositories list, and a choice that survived closing the browser
 * kept filtering later visits without the user noticing. A session scope ends
 * with the tab. Storage can be unavailable (privacy modes, blocked cookies), in
 * which case the scope simply is not remembered.
 */
function readStoredProjectId(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeProjectId(id: string | null): void {
  try {
    if (id) window.sessionStorage.setItem(STORAGE_KEY, id);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered; the scope still applies for this page.
  }
}

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
  const { isAuthenticated, user } = useAuth();
  const { data } = useProjects({
    enabled: isAuthenticated,
    // A signed-in user who is not a global admin would only get a 403 from the
    // project list, so go straight to the repository-derived list.
    isGlobalAdmin: user ? !!user.is_admin : undefined,
  });
  const projects = useMemo(() => data ?? [], [data]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from sessionStorage after mount to keep SSR markup stable
    setActiveId(readStoredProjectId());
  }, []);

  const setActiveProjectId = useCallback((id: string | null) => {
    setActiveId(id);
    storeProjectId(id);
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
