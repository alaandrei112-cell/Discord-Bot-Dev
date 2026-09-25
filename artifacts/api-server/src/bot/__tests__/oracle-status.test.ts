import { describe, expect, it } from "vitest";
import {
  buildOracleRelationshipAnnouncement,
  buildOracleStatusLine,
  oracleRelationshipTone,
  ORACLE_HOSTILE_RELATION_DELTA,
} from "../oracle-chat";

describe("Oracle relationship status", () => {
  it("shows a positive bond change and the current title", () => {
    const status = buildOracleStatusLine(
      2,
      { oracleBond: 15, oracleTitle: "Favoritul Cenușii" },
    );

    expect(status).toContain("s-a bucurat de respectul tău");
    expect(status).toContain("Legătura a crescut cu **+2**");
    expect(status).toContain("✦ **Legătura cu Oracolul**");
    expect(status).toContain("Favoritul Cenușii");
    expect(status).toContain("Total: **+15**");
  });

  it("shows a negative bond change and an irritated Oracle", () => {
    const status = buildOracleStatusLine(
      ORACLE_HOSTILE_RELATION_DELTA,
      { oracleBond: -4, oracleTitle: "Suflet suspect" },
    );

    expect(status).toContain("s-a supărat pe cuvintele tale");
    expect(status).toContain("Legătura a scăzut cu **2**");
    expect(status).toContain("Suflet suspect");
  });

  it("escalates the Oracle tone as the bond becomes negative", () => {
    expect(oracleRelationshipTone(-2)).toContain("distant și rece");
    expect(oracleRelationshipTone(-8)).toContain("vizibil mai agresiv");
    expect(oracleRelationshipTone(-12)).toContain("profund ostil");
  });

  it("builds a public announcement for a bond increase", () => {
    const announcement = buildOracleRelationshipAnnouncement(
      "user-1",
      2,
      { oracleBond: 17, oracleTitle: "Favoritul Cenușii" },
    );

    expect(announcement).toContain("<@user-1>");
    expect(announcement).toContain("a câștigat **+2** puncte");
    expect(announcement).toContain("Total: **+17**");
  });

  it("builds a public announcement for a bond loss", () => {
    const announcement = buildOracleRelationshipAnnouncement(
      "user-2",
      ORACLE_HOSTILE_RELATION_DELTA,
      { oracleBond: -7, oracleTitle: "Suflet suspect" },
    );

    expect(announcement).toContain("<@user-2>");
    expect(announcement).toContain("a pierdut **2** puncte");
    expect(announcement).toContain("Total: **-7**");
  });
});