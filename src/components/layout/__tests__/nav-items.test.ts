import { describe, it, expect } from "vitest";
import {
  ALWAYS_VISIBLE_NAV_HREFS,
  NAV_GROUPS,
  filterHiddenNavItems,
  isNavItemHideable,
  normalizeHiddenNavItems,
} from "../nav-items";

const items = [
  { href: "/peers" },
  { href: "/webhooks" },
  { href: "/settings" },
];

describe("nav-items (#968)", () => {
  it("uses unique hrefs, since an href is the identifier in the hidden list", () => {
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("keeps the admin Settings entry out of reach of the hidden list", () => {
    expect(ALWAYS_VISIBLE_NAV_HREFS.has("/settings")).toBe(true);
    expect(isNavItemHideable("/settings")).toBe(false);
    expect(isNavItemHideable("/peers")).toBe(true);
    const hrefs = NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    for (const locked of ALWAYS_VISIBLE_NAV_HREFS) {
      expect(hrefs).toContain(locked);
    }
  });

  describe("filterHiddenNavItems", () => {
    it("returns every item when nothing is hidden", () => {
      expect(filterHiddenNavItems(items, [])).toEqual(items);
    });

    it("drops hidden items and keeps the order of the rest", () => {
      expect(filterHiddenNavItems(items, ["/peers"])).toEqual([
        { href: "/webhooks" },
        { href: "/settings" },
      ]);
    });

    it("never drops an always-visible item", () => {
      expect(
        filterHiddenNavItems(items, ["/peers", "/webhooks", "/settings"]),
      ).toEqual([{ href: "/settings" }]);
    });

    it("ignores identifiers that match no item", () => {
      expect(filterHiddenNavItems(items, ["/does-not-exist"])).toEqual(items);
    });

    it("does not mutate its input", () => {
      const input = [...items];
      filterHiddenNavItems(input, ["/peers"]);
      expect(input).toEqual(items);
    });
  });

  describe("normalizeHiddenNavItems", () => {
    it("sorts, de-duplicates and drops entries that cannot be hidden", () => {
      expect(
        normalizeHiddenNavItems(["/webhooks", "/peers", "/webhooks", "/settings"]),
      ).toEqual(["/peers", "/webhooks"]);
    });

    it("keeps identifiers this build does not know", () => {
      expect(normalizeHiddenNavItems(["/future-page"])).toEqual(["/future-page"]);
    });
  });
});
