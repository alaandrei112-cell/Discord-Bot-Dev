import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../app";

describe("request body boundary", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server has no port");
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("returns a safe JSON 413 for bodies above the emoji upload ceiling", async () => {
    const response = await fetch(`${baseUrl}/api/moderation/guilds/123456789/emojis`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "cenusa", image: "x".repeat(410 * 1024) }),
    });

    expect(response.status).toBe(413);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "Request body is too large" });
  });
});