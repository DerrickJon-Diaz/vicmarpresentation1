import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { normalizeSlotStatus } from "@/lib/slotStatus";

const SLOT_STATUS_COLLECTION = "slotStatuses";

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

export function subscribeToSlotStatuses(onChange, onError) {
  const collectionRef = collection(db, SLOT_STATUS_COLLECTION);

  return onSnapshot(
    collectionRef,
    (snapshot) => {
      const nextStatuses = {};

      snapshot.forEach((statusDocument) => {
        const data = statusDocument.data();
        nextStatuses[statusDocument.id] = {
          status: normalizeSlotStatus(data.status),
          lotNum: String(data.lotNum ?? "").trim(),
          lotArea: toNullableNumber(data.lotArea),
          price: toNullableNumber(data.price),
          blockNum: String(data.blockNum ?? "").trim(),
          phase: String(data.phase ?? "").trim(),
          type: String(data.type ?? "").trim(),
          unitKey: String(data.unitKey ?? "").trim(),
          sourceKey: String(data.sourceKey ?? "").trim(),
          propertyId: String(data.propertyId ?? "").trim(),
          updatedBy: data.updatedBy ?? "",
          updatedAt: data.updatedAt ?? null,
        };
      });

      onChange(nextStatuses);
    },
    onError,
  );
}

export async function updateSlotStatus(slot, rawStatus, adminIdentifier) {
  const normalizedStatus = normalizeSlotStatus(rawStatus);
  const slotDocRef = doc(db, SLOT_STATUS_COLLECTION, slot.slotId);

  await setDoc(
    slotDocRef,
    {
      status: normalizedStatus,
      lotNum: slot.lotNum,
      lotArea: slot.lotArea,
      price: toNullableNumber(slot.price),
      blockNum: slot.blockNum,
      phase: slot.phase,
      type: slot.type,
      unitKey: slot.unitKey,
      sourceKey: slot.sourceKey,
      propertyId: slot.propertyId,
      updatedBy: adminIdentifier ?? "admin",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function updateSlotDetails(slotId, details, adminIdentifier) {
  const slotDocRef = doc(db, SLOT_STATUS_COLLECTION, slotId);

  await setDoc(
    slotDocRef,
    {
      lotNum: String(details.lotNum ?? "").trim(),
      lotArea: toNullableNumber(details.lotArea),
      price: toNullableNumber(details.price),
      blockNum: String(details.blockNum ?? "").trim(),
      phase: String(details.phase ?? "").trim(),
      type: String(details.type ?? "").trim(),
      updatedBy: adminIdentifier ?? "admin",
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}