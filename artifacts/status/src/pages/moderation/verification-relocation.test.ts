import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");

describe("verification editor ownership", () => {
  it("keeps the editor and Discord preview on the verification page only", () => {
    const botControl = readSource("./BotControl.tsx");
    const verificationAdmin = readSource("./VerificationAdmin.tsx");

    expect(botControl).not.toContain('TabsContent value="verification"');
    expect(botControl).not.toContain("PREVIZUALIZARE DISCORD");
    expect(botControl).toContain('requestedTab === "verification"');
    expect(botControl).toContain('setLocation("/verificare")');

    expect(verificationAdmin).toContain("Panoul de verificare");
    expect(verificationAdmin).toContain("PREVIZUALIZARE DISCORD");
    expect(verificationAdmin).toContain("draft.verification.imageUrl");
    expect(verificationAdmin).toContain("Salvează verificarea");
  });
});