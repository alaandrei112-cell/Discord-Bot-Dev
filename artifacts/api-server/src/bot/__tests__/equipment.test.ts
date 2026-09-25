import { describe, expect, it } from "vitest";
import {
  EQUIPMENT,
  equipmentDesc,
  equipmentCost,
  equipmentStats,
  isEquipmentKey,
  rollEquipmentDrop,
} from "../survival";

describe("equipment catalog", () => {
  it("contains five weapons and five armor pieces with usable stats", () => {
    const entries = Object.entries(EQUIPMENT);
    expect(entries).toHaveLength(10);
    expect(entries.filter(([, item]) => item.slot === "weapon")).toHaveLength(5);
    expect(entries.filter(([, item]) => item.slot === "armor")).toHaveLength(5);
    for (const [key, item] of entries) {
      expect(isEquipmentKey(key)).toBe(true);
      expect(Object.values(equipmentStats(key as keyof typeof EQUIPMENT, 1)).some((value) => value > 0)).toBe(true);
      expect(equipmentDesc(key as keyof typeof EQUIPMENT, 1)).not.toBe("");
    }
  });

  it("scales every bonus upward when equipment is upgraded", () => {
    const base = equipmentStats("sabia_regelui", 1);
    const upgraded = equipmentStats("sabia_regelui", 2);
    expect(upgraded.attack).toBeGreaterThan(base.attack);
    const armorBase = equipmentStats("platosa_cenusie", 1);
    const armorUpgraded = equipmentStats("platosa_cenusie", 2);
    expect(armorUpgraded.hp).toBeGreaterThan(armorBase.hp);
    expect(equipmentCost("sabia_regelui", 2).gold).toBeGreaterThan(equipmentCost("sabia_regelui", 1).gold);
  });

  it("always awards equipment from a defeated boss", () => {
    expect(rollEquipmentDrop(1, "boss")).not.toBeNull();
    expect(rollEquipmentDrop(50, "boss")).not.toBeNull();
  });
});