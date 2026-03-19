import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/sdk-client", () => ({}));

const mockListGroups = vi.fn();
const mockGetGroup = vi.fn();
const mockCreateGroup = vi.fn();
const mockUpdateGroup = vi.fn();
const mockDeleteGroup = vi.fn();
const mockAddMembers = vi.fn();
const mockRemoveMembers = vi.fn();

vi.mock("@artifact-keeper/sdk", () => ({
  listGroups: (...args: unknown[]) => mockListGroups(...args),
  getGroup: (...args: unknown[]) => mockGetGroup(...args),
  createGroup: (...args: unknown[]) => mockCreateGroup(...args),
  updateGroup: (...args: unknown[]) => mockUpdateGroup(...args),
  deleteGroup: (...args: unknown[]) => mockDeleteGroup(...args),
  addMembers: (...args: unknown[]) => mockAddMembers(...args),
  removeMembers: (...args: unknown[]) => mockRemoveMembers(...args),
}));

describe("groupsApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("list returns paginated groups", async () => {
    const data = { items: [{ id: "g1" }], pagination: { total: 1 } };
    mockListGroups.mockResolvedValue({ data, error: undefined });
    const { groupsApi } = await import("../groups");
    expect(await groupsApi.list()).toEqual(data);
  });

  it("list throws on error", async () => {
    mockListGroups.mockResolvedValue({ data: undefined, error: "fail" });
    const { groupsApi } = await import("../groups");
    await expect(groupsApi.list()).rejects.toBe("fail");
  });

  it("get returns a single group", async () => {
    const group = { id: "g1", name: "devs" };
    mockGetGroup.mockResolvedValue({ data: group, error: undefined });
    const { groupsApi } = await import("../groups");
    expect(await groupsApi.get("g1")).toEqual(group);
  });

  it("get throws on error", async () => {
    mockGetGroup.mockResolvedValue({ data: undefined, error: "not found" });
    const { groupsApi } = await import("../groups");
    await expect(groupsApi.get("g1")).rejects.toBe("not found");
  });

  it("create returns created group", async () => {
    const group = { id: "g2", name: "ops" };
    mockCreateGroup.mockResolvedValue({ data: group, error: undefined });
    const { groupsApi } = await import("../groups");
    expect(await groupsApi.create({ name: "ops" } as any)).toEqual(group);
  });

  it("create throws on error", async () => {
    mockCreateGroup.mockResolvedValue({ data: undefined, error: "dup" });
    const { groupsApi } = await import("../groups");
    await expect(groupsApi.create({ name: "ops" } as any)).rejects.toBe("dup");
  });

  it("update returns updated group", async () => {
    const group = { id: "g1", name: "devs-updated" };
    mockUpdateGroup.mockResolvedValue({ data: group, error: undefined });
    const { groupsApi } = await import("../groups");
    expect(await groupsApi.update("g1", { name: "devs-updated" } as any)).toEqual(group);
  });

  it("update throws on error", async () => {
    mockUpdateGroup.mockResolvedValue({ data: undefined, error: "fail" });
    const { groupsApi } = await import("../groups");
    await expect(groupsApi.update("g1", {} as any)).rejects.toBe("fail");
  });

  it("delete calls SDK", async () => {
    mockDeleteGroup.mockResolvedValue({ error: undefined });
    const { groupsApi } = await import("../groups");
    await groupsApi.delete("g1");
    expect(mockDeleteGroup).toHaveBeenCalled();
  });

  it("delete throws on error", async () => {
    mockDeleteGroup.mockResolvedValue({ error: "fail" });
    const { groupsApi } = await import("../groups");
    await expect(groupsApi.delete("g1")).rejects.toBe("fail");
  });

  it("addMembers calls SDK with user IDs", async () => {
    mockAddMembers.mockResolvedValue({ error: undefined });
    const { groupsApi } = await import("../groups");
    await groupsApi.addMembers("g1", ["u1", "u2"]);
    expect(mockAddMembers).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { id: "g1" },
        body: { user_ids: ["u1", "u2"] },
      })
    );
  });

  it("addMembers throws on error", async () => {
    mockAddMembers.mockResolvedValue({ error: "fail" });
    const { groupsApi } = await import("../groups");
    await expect(groupsApi.addMembers("g1", ["u1"])).rejects.toBe("fail");
  });

  it("removeMembers calls SDK with user IDs", async () => {
    mockRemoveMembers.mockResolvedValue({ error: undefined });
    const { groupsApi } = await import("../groups");
    await groupsApi.removeMembers("g1", ["u1"]);
    expect(mockRemoveMembers).toHaveBeenCalled();
  });

  it("removeMembers throws on error", async () => {
    mockRemoveMembers.mockResolvedValue({ error: "fail" });
    const { groupsApi } = await import("../groups");
    await expect(groupsApi.removeMembers("g1", ["u1"])).rejects.toBe("fail");
  });
});
