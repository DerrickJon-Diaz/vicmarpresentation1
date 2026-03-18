import propertyData from "../../data/propertyData.js";
import { makeSlotId, normalizeSlotStatus } from "@/lib/slotStatus";

const UNIT_CONFIG = [
  { sourceKey: "unit", unitKey: "" },
  { sourceKey: "unitA", unitKey: "A" },
  { sourceKey: "unitB", unitKey: "B" },
  { sourceKey: "unitC", unitKey: "C" },
  { sourceKey: "", unitKey: "" },
];

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function getAllVicinityProperties() {
  const properties = [];

  for (const [category, categoryProperties] of Object.entries(propertyData)) {
    categoryProperties.forEach((property, polygonIndex) => {
      properties.push({
        id: `${category}-${polygonIndex}`,
        category,
        polygonIndex,
        ...property,
      });
    });
  }

  return properties;
}

export function getPropertyUnitEntries(info = {}) {
  const entries = [];

  UNIT_CONFIG.forEach(({ sourceKey, unitKey }) => {
    const unitData = info[sourceKey];
    if (!unitData || typeof unitData !== "object") {
      return;
    }

    if (!Object.prototype.hasOwnProperty.call(unitData, "lotNum")) {
      return;
    }

    entries.push({
      sourceKey: sourceKey || "blank",
      unitKey,
      data: unitData,
    });
  });

  return entries;
}

export function buildVicinitySlots(properties) {
  return properties.flatMap((property) => {
    const unitEntries = getPropertyUnitEntries(property.info);

    return unitEntries.map((unitEntry) => ({
      slotId: makeSlotId(property.id, unitEntry.sourceKey),
      propertyId: property.id,
      category: property.category,
      polygonIndex: property.polygonIndex,
      sourceKey: unitEntry.sourceKey,
      unitKey: unitEntry.unitKey,
      lotNum: String(unitEntry.data?.lotNum ?? "").trim(),
      lotArea: unitEntry.data?.lotArea ?? null,
      price: toNullableNumber(
        unitEntry.data?.price ?? unitEntry.data?.unitPrice ?? property.info?.price,
      ),
      blockNum: String(property.info?.blockNum ?? "").trim(),
      phase: String(property.info?.phase ?? "").trim(),
      type: String(property.info?.type ?? "").trim(),
      defaultStatus: normalizeSlotStatus(unitEntry.data?.availability),
      defaultAvailability: String(unitEntry.data?.availability ?? "").trim(),
    }));
  });
}