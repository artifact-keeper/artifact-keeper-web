import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUseQuery = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: unknown) => mockUseQuery(opts),
}));

const mockList = vi.hoisted(() => vi.fn());
const mockListMembers = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/projects", () => ({
  projectsApi: {
    list: (...args: unknown[]) => mockList(...args),
    listMembers: (...args: unknown[]) => mockListMembers(...args),
  },
}));

import {
  projectListKey,
  projectMembersKey,
  useProjectMembers,
  useProjects,
} from "../use-projects";
import { QUERY_KEYS } from "@/lib/query-keys";

type Opts = { queryKey: unknown; queryFn: () => unknown; enabled?: boolean };
const lastOpts = () => mockUseQuery.mock.calls.at(-1)![0] as Opts;

describe("project query keys", () => {
  it("scopes keys under the projects prefix", () => {
    expect(projectListKey()).toEqual([...QUERY_KEYS.PROJECTS, "list"]);
    expect(projectMembersKey("p1")).toEqual([...QUERY_KEYS.PROJECTS, "p1", "members"]);
  });
});

describe("useProjects", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockList.mockReset();
  });

  it("lists projects and forwards enabled", () => {
    useProjects({ enabled: false });
    const opts = lastOpts();
    expect(opts.queryKey).toEqual(projectListKey());
    expect(opts.enabled).toBe(false);
    opts.queryFn();
    expect(mockList).toHaveBeenCalled();
  });

  it("leaves enabled undefined without options", () => {
    useProjects();
    expect(lastOpts().enabled).toBeUndefined();
  });
});

describe("useProjectMembers", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockListMembers.mockReset();
  });

  it("fetches members for the project", () => {
    useProjectMembers("p1");
    const opts = lastOpts();
    expect(opts.queryKey).toEqual(projectMembersKey("p1"));
    expect(opts.enabled).toBe(true);
    opts.queryFn();
    expect(mockListMembers).toHaveBeenCalledWith("p1");
  });

  it("is disabled without a project id", () => {
    useProjectMembers(undefined);
    expect(lastOpts().enabled).toBe(false);
    expect(lastOpts().queryKey).toEqual(projectMembersKey(""));
  });
});
