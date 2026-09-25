import { beforeEach, describe, expect, it, vi } from "vitest";

const { query } = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("@workspace/db", () => ({ pool: { query } }));

import { PostgresModerationStore } from "../store";

describe("moderation audit filtering and pagination", () => {
  const store = new PostgresModerationStore();

  beforeEach(() => {
    query.mockReset();
    vi.spyOn(store, "ensureSchema").mockResolvedValue();
  });

  it("filters matching audit records in SQL before applying the page limit and offset", async () => {
    const start = new Date("2026-09-24T10:00:00.000Z");
    const end = new Date("2026-09-24T12:00:00.000Z");
    query
      .mockResolvedValueOnce({ rows: [{ total: "23" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await store.listAudit("123456789", {
      search: "older actor",
      category: "members",
      start,
      end,
      limit: 5,
      offset: 10,
    });

    expect(result).toEqual({ items: [], total: 23 });
    expect(query).toHaveBeenCalledTimes(2);
    const [countSql, countParams] = query.mock.calls[0] as [string, unknown[]];
    const [pageSql, pageParams] = query.mock.calls[1] as [string, unknown[]];

    expect(countSql).toContain("WHERE guild_id = $1 AND created_at >= $2 AND created_at <= $3");
    expect(countSql).toContain("position(lower($5) in lower(concat_ws(");
    expect(countParams).toEqual(["123456789", start, end, "members", "older actor"]);

    const wherePosition = pageSql.indexOf("WHERE guild_id = $1");
    const limitPosition = pageSql.indexOf("LIMIT $6 OFFSET $7");
    expect(wherePosition).toBeGreaterThanOrEqual(0);
    expect(limitPosition).toBeGreaterThan(wherePosition);
    expect(pageSql).toContain("position(lower($5) in lower(concat_ws(");
    expect(pageParams).toEqual(["123456789", start, end, "members", "older actor", 5, 10]);
  });
});