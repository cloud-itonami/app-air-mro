/**
 * air-mro kotoba — registry.
 *
 * Plaintext path (componentCatalog / workOrder / airworthinessDirective):
 * sdk.write / sdk.read — public ops facts + reference. FK workOrder →
 * componentCatalog via exists().
 *
 * E2E path (componentTrace / sparePartOrder / reliabilityReport):
 * sdk.encryptedWrite / sdk.encryptedRead — confidential per-asset commercial +
 * safety-sensitive bodies sealed in the kotoba envelope (ADR-2605181100),
 * read-cap = owner DID + explicit recipients. The substrate never sees supplier
 * terms, valuations, or occurrence narratives in plaintext.
 *
 * STAYS etzhayyim (consent-capability): fiat settlement EXECUTION for spare-part
 * procurement (IATA-BSP / wire / MoR rail) + airworthiness grounding enforcement
 * ACTION. The procurement ledger DATA is fronted E2E; the fiat-clearing CALL and
 * the no-fly blocking act stay etzhayyim.
 */

import type { Etzhayyim } from "@etzhayyim/sdk";
import {
  AD_COLLECTION,
  COMPONENT_CATALOG_COLLECTION,
  COMPONENT_TRACE_INNER_TYPE,
  GROUND_EQUIPMENT_COLLECTION,
  RELIABILITY_REPORT_INNER_TYPE,
  SPARE_PART_ORDER_INNER_TYPE,
  WORK_ORDER_COLLECTION,
  didFor,
  isDecimalString,
  isPct,
  isUint,
  rkeyOf,
  type AirworthinessDirectiveRecord,
  type AirworthinessDirectiveView,
  type ComponentCatalogRecord,
  type ComponentCatalogView,
  type ComponentTraceBody,
  type ComponentTraceView,
  type CoverageInput,
  type CoverageOutput,
  type CreateWorkOrderInput,
  type CreateWorkOrderOutput,
  type GetComponentInput,
  type GetComponentOutput,
  type GetTraceInput,
  type GetTraceOutput,
  type GroundEquipmentRecord,
  type GroundEquipmentView,
  type ListGroundEquipmentInput,
  type ListGroundEquipmentOutput,
  type RecordGroundEquipmentInput,
  type RecordGroundEquipmentOutput,
  type ListComponentsInput,
  type ListComponentsOutput,
  type ListDirectivesInput,
  type ListDirectivesOutput,
  type ListOrdersInput,
  type ListOrdersOutput,
  type ListReliabilityInput,
  type ListReliabilityOutput,
  type ListTracesInput,
  type ListTracesOutput,
  type ListWorkOrdersInput,
  type ListWorkOrdersOutput,
  type OrderSparePartInput,
  type OrderSparePartOutput,
  type RecordDirectiveInput,
  type RecordDirectiveOutput,
  type RegisterComponentInput,
  type RegisterComponentOutput,
  type ReliabilityReportBody,
  type ReliabilityReportView,
  type ReportReliabilityInput,
  type ReportReliabilityOutput,
  type SparePartOrderBody,
  type SparePartOrderView,
  type TraceComponentInput,
  type TraceComponentOutput,
  type WorkOrderRecord,
  type WorkOrderView,
} from "./types.js";

const PAGE_LIMIT = 100;
const DEFAULT_MAX_SCAN = 10_000;

// ─── Plaintext FK helper (exists via read; mock has no exists()) ─────

async function componentExists(e: Etzhayyim, partNumber: string): Promise<boolean> {
  const rkey = rkeyOf("comp", partNumber);
  const resp = await e
    .read<ComponentCatalogRecord>({ collection: COMPONENT_CATALOG_COLLECTION, rkey })
    .catch(() => ({ records: [] as Array<{ uri: string; value: ComponentCatalogRecord }> }));
  return Boolean(resp.records[0]?.value);
}

// ─── Component catalog (PLAINTEXT, reference / FK target) ────────────

export async function registerComponent(e: Etzhayyim, input: RegisterComponentInput): Promise<RegisterComponentOutput> {
  if (!input.partNumber || !input.componentType || !input.manufacturer) return { status: "rejected", error: "missingRequiredFields" };
  const rkey = rkeyOf("comp", input.partNumber);
  const existing = await e.read<ComponentCatalogRecord>({ collection: COMPONENT_CATALOG_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", catalogUri: existing.records[0].uri, did: existing.records[0].value.did, partNumber: input.partNumber };
  }
  const now = new Date().toISOString();
  const did = didFor("comp", input.partNumber);
  const record: ComponentCatalogRecord = {
    did,
    partNumber: input.partNumber,
    componentType: input.componentType,
    manufacturer: input.manufacturer,
    ataChapter: input.ataChapter,
    createdAt: now,
  };
  const receipt = await e.write({ collection: COMPONENT_CATALOG_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "registered", catalogUri: receipt.uri, did, partNumber: input.partNumber };
}

export async function listComponents(e: Etzhayyim, input: ListComponentsInput = {}): Promise<ListComponentsOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<ComponentCatalogRecord>({ collection: COMPONENT_CATALOG_COLLECTION, cursor: input.cursor, limit });
  const items: ComponentCatalogView[] = resp.records
    .filter((r) => !input.componentType || r.value.componentType === input.componentType)
    .map((r) => ({ ...r.value, catalogUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

export async function getComponent(e: Etzhayyim, input: GetComponentInput): Promise<GetComponentOutput> {
  if (!input.partNumber) return { error: "invalidPartNumber" };
  const rkey = rkeyOf("comp", input.partNumber);
  const resp = await e.read<ComponentCatalogRecord>({ collection: COMPONENT_CATALOG_COLLECTION, rkey }).catch(() => ({ records: [] }));
  const hit = resp.records[0];
  if (!hit?.value) return { error: "notFound" };
  return { component: { ...hit.value, catalogUri: hit.uri } };
}

// ─── Work order (PLAINTEXT, ops fact; FK → componentCatalog) ─────────

export async function createWorkOrder(e: Etzhayyim, input: CreateWorkOrderInput): Promise<CreateWorkOrderOutput> {
  if (!input.woNumber || !input.aircraftReg || !input.componentPartNumber || !input.maintenanceType) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!(await componentExists(e, input.componentPartNumber))) return { status: "rejected", error: "componentNotFound" };
  const rkey = rkeyOf("wo", input.woNumber);
  const existing = await e.read<WorkOrderRecord>({ collection: WORK_ORDER_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", workOrderUri: existing.records[0].uri, did: existing.records[0].value.did, woNumber: input.woNumber };
  }
  const now = new Date().toISOString();
  const did = didFor("wo", input.woNumber);
  const record: WorkOrderRecord = {
    did,
    woNumber: input.woNumber,
    aircraftReg: input.aircraftReg,
    componentPartNumber: input.componentPartNumber,
    maintenanceType: input.maintenanceType,
    status: input.status ?? "open",
    scheduledAt: input.scheduledAt ?? now,
    createdAt: now,
  };
  const receipt = await e.write({ collection: WORK_ORDER_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "created", workOrderUri: receipt.uri, did, woNumber: input.woNumber };
}

export async function listWorkOrders(e: Etzhayyim, input: ListWorkOrdersInput = {}): Promise<ListWorkOrdersOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<WorkOrderRecord>({ collection: WORK_ORDER_COLLECTION, cursor: input.cursor, limit });
  const items: WorkOrderView[] = resp.records
    .filter((r) => (!input.aircraftReg || r.value.aircraftReg === input.aircraftReg) && (!input.status || r.value.status === input.status))
    .map((r) => ({ ...r.value, workOrderUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Airworthiness directive (PLAINTEXT, reference catalog) ──────────

export async function recordDirective(e: Etzhayyim, input: RecordDirectiveInput): Promise<RecordDirectiveOutput> {
  if (!input.adId || !input.checkType) return { status: "rejected", error: "missingRequiredFields" };
  if (!isPct(input.compliancePct)) return { status: "rejected", error: "invalidCompliancePct" };
  const rkey = rkeyOf("ad", input.adId);
  const existing = await e.read<AirworthinessDirectiveRecord>({ collection: AD_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", directiveUri: existing.records[0].uri, did: existing.records[0].value.did, adId: input.adId };
  }
  const now = new Date().toISOString();
  const did = didFor("ad", input.adId);
  const record: AirworthinessDirectiveRecord = {
    did,
    adId: input.adId,
    checkType: input.checkType,
    compliancePct: input.compliancePct,
    status: input.status ?? "open",
    effectiveAt: input.effectiveAt ?? now,
    createdAt: now,
  };
  const receipt = await e.write({ collection: AD_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "recorded", directiveUri: receipt.uri, did, adId: input.adId };
}

export async function listDirectives(e: Etzhayyim, input: ListDirectivesInput = {}): Promise<ListDirectivesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<AirworthinessDirectiveRecord>({ collection: AD_COLLECTION, cursor: input.cursor, limit });
  const items: AirworthinessDirectiveView[] = resp.records
    .filter((r) => !input.status || r.value.status === input.status)
    .map((r) => ({ ...r.value, directiveUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Ground equipment (PLAINTEXT, asset inventory catalog) ──────────

export async function recordGroundEquipment(e: Etzhayyim, input: RecordGroundEquipmentInput): Promise<RecordGroundEquipmentOutput> {
  if (!input.gseId || !input.equipmentType || !input.station) return { status: "rejected", error: "missingRequiredFields" };
  const rkey = rkeyOf("gse", input.gseId);
  const existing = await e.read<GroundEquipmentRecord>({ collection: GROUND_EQUIPMENT_COLLECTION, rkey }).catch(() => ({ records: [] }));
  if (existing.records[0]?.value) {
    return { status: "alreadyExists", gseUri: existing.records[0].uri, did: existing.records[0].value.did, gseId: input.gseId };
  }
  const now = new Date().toISOString();
  const did = didFor("gse", input.gseId);
  const record: GroundEquipmentRecord = {
    did,
    gseId: input.gseId,
    equipmentType: input.equipmentType,
    station: input.station,
    status: input.status ?? "serviceable",
    createdAt: now,
  };
  const receipt = await e.write({ collection: GROUND_EQUIPMENT_COLLECTION, record: record as unknown as Record<string, unknown>, rkey });
  return { status: "recorded", gseUri: receipt.uri, did, gseId: input.gseId };
}

export async function listGroundEquipment(e: Etzhayyim, input: ListGroundEquipmentInput = {}): Promise<ListGroundEquipmentOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const resp = await e.read<GroundEquipmentRecord>({ collection: GROUND_EQUIPMENT_COLLECTION, cursor: input.cursor, limit });
  const items: GroundEquipmentView[] = resp.records
    .filter((r) => (!input.station || r.value.station === input.station) && (!input.equipmentType || r.value.equipmentType === input.equipmentType))
    .map((r) => ({ ...r.value, gseUri: r.uri }));
  return { items, cursor: resp.cursor, total: items.length };
}

// ─── Component trace (E2E, supply-chain CUI) ────────────────────────

export async function traceComponent(e: Etzhayyim, input: TraceComponentInput): Promise<TraceComponentOutput> {
  if (!input.serialNumber || !input.partNumber || !input.currentOperatorDid) return { status: "rejected", error: "missingRequiredFields" };
  if (!isPct(input.lifeRemainingPct)) return { status: "rejected", error: "invalidLifeRemainingPct" };
  if (!isDecimalString(input.valuationUsd)) return { status: "rejected", error: "invalidValuationUsd" };
  const body: ComponentTraceBody = {
    serialNumber: input.serialNumber,
    partNumber: input.partNumber,
    currentOperatorDid: input.currentOperatorDid,
    lifeRemainingPct: input.lifeRemainingPct,
    valuationUsd: input.valuationUsd,
    tracedAt: input.tracedAt ?? new Date().toISOString(),
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: COMPONENT_TRACE_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: rkeyOf("trace", input.serialNumber),
  });
  return { status: "recorded", uri: receipt.uri, keyId: receipt.keyId, serialNumber: input.serialNumber };
}

async function scanTraces(e: Etzhayyim, maxScan: number): Promise<ComponentTraceView[]> {
  const out: ComponentTraceView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<ComponentTraceBody>({ innerType: COMPONENT_TRACE_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listTraces(e: Etzhayyim, input: ListTracesInput = {}): Promise<ListTracesOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanTraces(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((t) => !input.partNumber || t.partNumber === input.partNumber);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

export async function getTrace(e: Etzhayyim, input: GetTraceInput): Promise<GetTraceOutput> {
  if (!input.serialNumber) return { error: "invalidSerialNumber" };
  const all = await scanTraces(e, DEFAULT_MAX_SCAN);
  const found = all.find((t) => t.serialNumber === input.serialNumber);
  if (!found) return { error: "notFound" };
  return { trace: found };
}

// ─── Spare-part order (E2E, procurement ledger entry) ───────────────

export async function orderSparePart(e: Etzhayyim, input: OrderSparePartInput): Promise<OrderSparePartOutput> {
  if (!input.orderId || !input.partNumber || !input.supplierDid) return { status: "rejected", error: "missingRequiredFields" };
  if (!isUint(input.quantity) || input.quantity === 0) return { status: "rejected", error: "invalidQuantity" };
  if (!isDecimalString(input.unitPriceUsd)) return { status: "rejected", error: "invalidUnitPriceUsd" };
  if (!isDecimalString(input.lineValueUsd)) return { status: "rejected", error: "invalidLineValueUsd" };
  const body: SparePartOrderBody = {
    orderId: input.orderId,
    partNumber: input.partNumber,
    supplierDid: input.supplierDid,
    quantity: input.quantity,
    unitPriceUsd: input.unitPriceUsd,
    lineValueUsd: input.lineValueUsd,
    orderedAt: input.orderedAt ?? new Date().toISOString(),
  };
  // Ledger entry fronted E2E; the fiat settlement CALL stays etzhayyim (consent-capability).
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: SPARE_PART_ORDER_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: rkeyOf("order", input.orderId),
  });
  return { status: "recorded", uri: receipt.uri, keyId: receipt.keyId, orderId: input.orderId };
}

async function scanOrders(e: Etzhayyim, maxScan: number): Promise<SparePartOrderView[]> {
  const out: SparePartOrderView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<SparePartOrderBody>({ innerType: SPARE_PART_ORDER_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listOrders(e: Etzhayyim, input: ListOrdersInput = {}): Promise<ListOrdersOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanOrders(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((o) => !input.supplierDid || o.supplierDid === input.supplierDid);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

// ─── Reliability report (E2E, confidential per-aircraft + occurrence) ──

export async function reportReliability(e: Etzhayyim, input: ReportReliabilityInput): Promise<ReportReliabilityOutput> {
  if (!input.reportId || !input.aircraftReg || !input.ataChapter || !input.occurrenceSummary) {
    return { status: "rejected", error: "missingRequiredFields" };
  }
  if (!isUint(input.mtbfHours)) return { status: "rejected", error: "invalidMtbfHours" };
  if (!isUint(input.occurrenceCount)) return { status: "rejected", error: "invalidOccurrenceCount" };
  const body: ReliabilityReportBody = {
    reportId: input.reportId,
    aircraftReg: input.aircraftReg,
    ataChapter: input.ataChapter,
    mtbfHours: input.mtbfHours,
    occurrenceCount: input.occurrenceCount,
    occurrenceSummary: input.occurrenceSummary,
    reportedAt: input.reportedAt ?? new Date().toISOString(),
  };
  const receipt = await e.encryptedWrite<Record<string, unknown>>({
    innerType: RELIABILITY_REPORT_INNER_TYPE,
    record: body as unknown as Record<string, unknown>,
    recipients: input.recipients ?? [],
    rkey: rkeyOf("rel", input.reportId),
  });
  return { status: "recorded", uri: receipt.uri, keyId: receipt.keyId, reportId: input.reportId };
}

async function scanReliability(e: Etzhayyim, maxScan: number): Promise<ReliabilityReportView[]> {
  const out: ReliabilityReportView[] = [];
  let cursor: string | undefined;
  while (out.length < maxScan) {
    const page = await e.encryptedRead<ReliabilityReportBody>({ innerType: RELIABILITY_REPORT_INNER_TYPE, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) out.push({ ...r.value, uri: r.uri, sender: r.sender, createdAt: r.createdAt });
    if (!page.cursor || page.records.length === 0) break;
    cursor = page.cursor;
  }
  return out;
}

export async function listReliability(e: Etzhayyim, input: ListReliabilityInput = {}): Promise<ListReliabilityOutput> {
  const limit = Math.min(input.limit ?? 50, 200);
  const all = await scanReliability(e, DEFAULT_MAX_SCAN);
  const filtered = all.filter((r) => !input.aircraftReg || r.aircraftReg === input.aircraftReg);
  return { items: filtered.slice(0, limit), total: filtered.length };
}

// ─── Coverage rollup (plaintext + E2E countAll) ─────────────────────

async function countAll(
  e: Etzhayyim,
  collection: string,
  maxScan: number,
  tally?: (v: Record<string, unknown>) => void,
): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  while (count < maxScan) {
    const page = await e.read<Record<string, unknown>>({ collection, cursor, limit: PAGE_LIMIT });
    for (const r of page.records) {
      count += 1;
      tally?.(r.value);
    }
    if (!page.cursor || page.records.length < PAGE_LIMIT) break;
    cursor = page.cursor;
  }
  return count;
}

export async function coverage(e: Etzhayyim, input: CoverageInput = {}): Promise<CoverageOutput> {
  const maxScan = Math.min(input.maxScan ?? DEFAULT_MAX_SCAN, DEFAULT_MAX_SCAN);
  const workOrdersByStatus: Record<string, number> = {};
  const componentCatalogCount = await countAll(e, COMPONENT_CATALOG_COLLECTION, maxScan);
  const workOrderCount = await countAll(e, WORK_ORDER_COLLECTION, maxScan, (v) => {
    const s = String(v.status ?? "unknown");
    workOrdersByStatus[s] = (workOrdersByStatus[s] ?? 0) + 1;
  });
  const airworthinessDirectiveCount = await countAll(e, AD_COLLECTION, maxScan);
  const groundEquipmentCount = await countAll(e, GROUND_EQUIPMENT_COLLECTION, maxScan);
  const componentTraceCount = (await scanTraces(e, maxScan)).length;
  const sparePartOrderCount = (await scanOrders(e, maxScan)).length;
  const reliabilityReportCount = (await scanReliability(e, maxScan)).length;
  return {
    componentCatalogCount,
    workOrderCount,
    airworthinessDirectiveCount,
    groundEquipmentCount,
    componentTraceCount,
    sparePartOrderCount,
    reliabilityReportCount,
    workOrdersByStatus,
    truncated:
      componentCatalogCount >= maxScan ||
      workOrderCount >= maxScan ||
      airworthinessDirectiveCount >= maxScan ||
      groundEquipmentCount >= maxScan ||
      componentTraceCount >= maxScan ||
      sparePartOrderCount >= maxScan ||
      reliabilityReportCount >= maxScan,
  };
}
