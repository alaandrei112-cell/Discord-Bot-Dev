import { describe, expect, it } from "vitest";
import { classifyCheckInReply, deriveMoodFromCheckIn, isOracleCheckInDue } from "../oracle";

describe("Oracle check-in reply interpretation", () => {
  it("recognizes a positive Romanian response", () => {
    expect(classifyCheckInReply("Sunt super, ne distrăm și totul merge bine!")).toBe("positive");
  });

  it("recognizes a negative Romanian response", () => {
    expect(classifyCheckInReply("Sunt foarte obosit și totul este groaznic.")).toBe("negative");
  });

  it("keeps ambiguous responses neutral", () => {
    expect(classifyCheckInReply("Lucrez la proiect de dimineață.")).toBe("neutral");
  });
});

describe("Oracle mood changes from server replies", () => {
  it("becomes excited after several positive replies", () => {
    expect(deriveMoodFromCheckIn(3, 0)).toBe("extatic");
    expect(deriveMoodFromCheckIn(2, 0)).toBe("agitat");
  });

  it("becomes angry after several negative replies", () => {
    expect(deriveMoodFromCheckIn(0, 3)).toBe("furios");
    expect(deriveMoodFromCheckIn(0, 2)).toBe("iritat");
  });

  it("does not force a mood when the answers are balanced", () => {
    expect(deriveMoodFromCheckIn(2, 2)).toBeNull();
  });
});

describe("Oracle silent-hour check-ins", () => {
  it("waits for a full hour after the last message", () => {
    expect(isOracleCheckInDue(1_000, 0, 60 * 60 * 1000 + 999, 60 * 60 * 1000)).toBe(false);
    expect(isOracleCheckInDue(1_000, 0, 60 * 60 * 1000 + 1_000, 60 * 60 * 1000)).toBe(true);
  });

  it("does not repeat during the same silent period", () => {
    expect(isOracleCheckInDue(1_000, 60 * 60 * 1000 + 1_000, 10 * 60 * 60 * 1000, 60 * 60 * 1000)).toBe(false);
  });

  it("starts a new silent-hour cycle after a new message", () => {
    expect(isOracleCheckInDue(2_000, 1_500, 62 * 60 * 60 * 1000, 60 * 60 * 1000)).toBe(true);
  });
});