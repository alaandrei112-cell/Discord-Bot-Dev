import { describe, expect, it } from "vitest";
import { applyEmojiSelection } from "./emoji-utils";

describe("applyEmojiSelection", () => {
  it("inserts Unicode and custom emoji at the current selection", () => {
    expect(applyEmojiSelection("Salut lume", "🔥", 6, 6).value).toBe("Salut 🔥lume");
    expect(applyEmojiSelection("Salut lume", "<:val:12345>", 6, 10).value).toBe("Salut <:val:12345>");
  });

  it("replaces button emoji instead of appending", () => {
    expect(applyEmojiSelection("✅", "<a:dance:12345>", 0, 0, true))
      .toEqual({ value: "<a:dance:12345>", caret: 15 });
  });
});