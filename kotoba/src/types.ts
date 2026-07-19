/**
 * air-mro kotoba — airline maintenance, repair & overhaul. Maximal migration:
 * front everything that can move; only the irreducible regulated EXECUTION
 * stays etzhayyim.
 *
 * Per ADR-2606011400 (Consensys product-front / infra-back) + ADR-2605172400
 * (3-axis split) + ADR-2605181100 (kotoba E2E encrypted-record envelope).
 * Founder directive 2026-06-03: front PNR/ticket/roster/ops DATA — public ops
 * facts plaintext, per-aircraft/per-supplier commercial + safety-sensitive
 * confidential terms E2E.
 *
 * SPLIT:
 *   PUBLIC (plaintext AT records via sdk.write/read):
 *     - componentCatalog : part-number master / reference (FK target).
 *     - workOrder        : maintenance ops facts (tail reg, WO number, status,
 *                          maintenance type). FK componentPartNumber →
 *                          componentCatalog via exists().
 *     - airworthinessDirective : AD / check reference catalog + aggregate
 *                          compliance status. Frontable open ops metadata.
 *     - groundEquipment  : ground-support-equipment asset inventory (tugs,
 *                          GPUs, belt loaders). Public asset catalog metadata.
 *
 *   CONFIDENTIAL / per-asset commercial + safety-sensitive (kotoba E2E,
 *   com.etzhayyim.encrypted.record, read-cap = owner DID + explicit recipients):
 *     - componentTrace      : per-serial traceability + operator/valuation
 *                             (supply-chain CUI, asset commercial value).
 *     - sparePartOrder      : procurement LEDGER entry (supplier terms, unit
 *                             price, line value). The ledger DATA migrates E2E;
 *                             the fiat settlement CALL stays etzhayyim.
 *     - reliabilityReport   : confidential per-aircraft reliability + technical
 *                             occurrence (MTBF, safety-sensitive occurrence).
 *
 *   STAYS etzhayyim (consumed via consent-capability, NOT a collection):
 *     - FIAT settlement EXECUTION for spare-part procurement (IATA-BSP / bank
 *       wire / merchant-of-record rail). Per Operating Entity Boundary
 *       (ADR-2605172100) etzhayyim never becomes the fiat MoR/counterparty, so
 *       the procurement ledger is fronted E2E but the fiat-clearing call stays
 *       etzhayyim.
 *     - Airworthiness GROUNDING / no-fly enforcement ACTION execution (the
 *       regulated blocking act, not the AD reference record).
 *
 * AT-Lexicon: no float. Counts/percent are integers (percent 0-100); money /
 * decimal quantities are decimal STRINGS.
 */

// ─── Collection NSIDs ───────────────────────────────────────────────

// Plaintext public collections.
export const COMPONENT_CATALOG_COLLECTION = "com.etzhayyim.apps.airMro.componentCatalog";
export const WORK_ORDER_COLLECTION = "com.etzhayyim.apps.airMro.workOrder";
export const AD_COLLECTION = "com.etzhayyim.apps.airMro.airworthinessDirective";
export const GROUND_EQUIPMENT_COLLECTION = "com.etzhayyim.apps.airMro.groundEquipment";

// E2E inner-type NSIDs (body shape inside the encrypted envelope).
export const COMPONENT_TRACE_INNER_TYPE = "com.etzhayyim.apps.airMro.componentTrace";
export const SPARE_PART_ORDER_INNER_TYPE = "com.etzhayyim.apps.airMro.sparePartOrder";
export const RELIABILITY_REPORT_INNER_TYPE = "com.etzhayyim.apps.airMro.reliabilityReport";

export const AIR_MRO_DID_PREFIX = "did:web:air-mro.etzhayyim.com:" as const;

// ─── Component catalog (PLAINTEXT, reference / FK target) ────────────

export interface ComponentCatalogRecord {
  did: string;
  partNumber: string;
  componentType: string;
  manufacturer: string;
  ataChapter?: string;
  createdAt: string;
}
export interface ComponentCatalogView extends ComponentCatalogRecord {
  catalogUri: string;
}
export interface RegisterComponentInput {
  partNumber: string;
  componentType: string;
  manufacturer: string;
  ataChapter?: string;
}
export interface RegisterComponentOutput {
  status: "registered" | "alreadyExists" | "rejected";
  catalogUri?: string;
  did?: string;
  partNumber?: string;
  error?: string;
}
export interface ListComponentsInput {
  componentType?: string;
  limit?: number;
  cursor?: string;
}
export interface ListComponentsOutput {
  items: ComponentCatalogView[];
  cursor?: string;
  total: number;
}
export interface GetComponentInput {
  partNumber: string;
}
export interface GetComponentOutput {
  component?: ComponentCatalogView;
  error?: string;
}

// ─── Work order (PLAINTEXT, maintenance ops fact; FK → componentCatalog) ──

export interface WorkOrderRecord {
  did: string;
  woNumber: string;
  aircraftReg: string;
  /** FK → componentCatalog.partNumber (validated via exists()). */
  componentPartNumber: string;
  maintenanceType: string;
  status: string;
  scheduledAt: string;
  createdAt: string;
}
export interface WorkOrderView extends WorkOrderRecord {
  workOrderUri: string;
}
export interface CreateWorkOrderInput {
  woNumber: string;
  aircraftReg: string;
  componentPartNumber: string;
  maintenanceType: string;
  status?: string;
  scheduledAt?: string;
}
export interface CreateWorkOrderOutput {
  status: "created" | "alreadyExists" | "rejected";
  workOrderUri?: string;
  did?: string;
  woNumber?: string;
  error?: string;
}
export interface ListWorkOrdersInput {
  aircraftReg?: string;
  status?: string;
  limit?: number;
  cursor?: string;
}
export interface ListWorkOrdersOutput {
  items: WorkOrderView[];
  cursor?: string;
  total: number;
}

// ─── Airworthiness directive (PLAINTEXT, reference catalog) ──────────

export interface AirworthinessDirectiveRecord {
  did: string;
  adId: string;
  checkType: string;
  /** integer 0-100. */
  compliancePct: number;
  status: string;
  effectiveAt: string;
  createdAt: string;
}
export interface AirworthinessDirectiveView extends AirworthinessDirectiveRecord {
  directiveUri: string;
}
export interface RecordDirectiveInput {
  adId: string;
  checkType: string;
  compliancePct: number;
  status?: string;
  effectiveAt?: string;
}
export interface RecordDirectiveOutput {
  status: "recorded" | "alreadyExists" | "rejected";
  directiveUri?: string;
  did?: string;
  adId?: string;
  error?: string;
}
export interface ListDirectivesInput {
  status?: string;
  limit?: number;
  cursor?: string;
}
export interface ListDirectivesOutput {
  items: AirworthinessDirectiveView[];
  cursor?: string;
  total: number;
}

// ─── Ground equipment (PLAINTEXT, asset inventory catalog) ──────────

export interface GroundEquipmentRecord {
  did: string;
  gseId: string;
  equipmentType: string;
  station: string;
  status: string;
  createdAt: string;
}
export interface GroundEquipmentView extends GroundEquipmentRecord {
  gseUri: string;
}
export interface RecordGroundEquipmentInput {
  gseId: string;
  equipmentType: string;
  station: string;
  status?: string;
}
export interface RecordGroundEquipmentOutput {
  status: "recorded" | "alreadyExists" | "rejected";
  gseUri?: string;
  did?: string;
  gseId?: string;
  error?: string;
}
export interface ListGroundEquipmentInput {
  station?: string;
  equipmentType?: string;
  limit?: number;
  cursor?: string;
}
export interface ListGroundEquipmentOutput {
  items: GroundEquipmentView[];
  cursor?: string;
  total: number;
}

// ─── Component trace (E2E, supply-chain CUI) ────────────────────────

export interface ComponentTraceBody {
  serialNumber: string;
  partNumber: string;
  currentOperatorDid: string;
  /** integer 0-100. */
  lifeRemainingPct: number;
  /** decimal string, e.g. "182500.00". */
  valuationUsd: string;
  tracedAt: string;
}
export interface ComponentTraceView extends ComponentTraceBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface TraceComponentInput {
  serialNumber: string;
  partNumber: string;
  currentOperatorDid: string;
  lifeRemainingPct: number;
  valuationUsd: string;
  tracedAt?: string;
  /** Extra DIDs to grant read-cap (owner always included). */
  recipients?: string[];
}
export interface TraceComponentOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyId?: string;
  serialNumber?: string;
  error?: string;
}
export interface ListTracesInput {
  partNumber?: string;
  limit?: number;
  cursor?: string;
}
export interface ListTracesOutput {
  items: ComponentTraceView[];
  cursor?: string;
  total: number;
}
export interface GetTraceInput {
  serialNumber: string;
}
export interface GetTraceOutput {
  trace?: ComponentTraceView;
  error?: string;
}

// ─── Spare-part order (E2E, procurement ledger entry) ───────────────

export interface SparePartOrderBody {
  orderId: string;
  partNumber: string;
  supplierDid: string;
  quantity: number;
  /** decimal string unit price, e.g. "4250.00". */
  unitPriceUsd: string;
  /** decimal string line total, e.g. "8500.00". */
  lineValueUsd: string;
  orderedAt: string;
}
export interface SparePartOrderView extends SparePartOrderBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface OrderSparePartInput {
  orderId: string;
  partNumber: string;
  supplierDid: string;
  quantity: number;
  unitPriceUsd: string;
  lineValueUsd: string;
  orderedAt?: string;
  recipients?: string[];
}
export interface OrderSparePartOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyId?: string;
  orderId?: string;
  error?: string;
}
export interface ListOrdersInput {
  supplierDid?: string;
  limit?: number;
  cursor?: string;
}
export interface ListOrdersOutput {
  items: SparePartOrderView[];
  cursor?: string;
  total: number;
}

// ─── Reliability report (E2E, confidential per-aircraft + occurrence) ──

export interface ReliabilityReportBody {
  reportId: string;
  aircraftReg: string;
  ataChapter: string;
  /** integer hours mean-time-between-failures. */
  mtbfHours: number;
  /** integer occurrence count in period. */
  occurrenceCount: number;
  /** safety-sensitive narrative summary. */
  occurrenceSummary: string;
  reportedAt: string;
}
export interface ReliabilityReportView extends ReliabilityReportBody {
  uri: string;
  sender: string;
  createdAt: string;
}
export interface ReportReliabilityInput {
  reportId: string;
  aircraftReg: string;
  ataChapter: string;
  mtbfHours: number;
  occurrenceCount: number;
  occurrenceSummary: string;
  reportedAt?: string;
  recipients?: string[];
}
export interface ReportReliabilityOutput {
  status: "recorded" | "rejected";
  uri?: string;
  keyId?: string;
  reportId?: string;
  error?: string;
}
export interface ListReliabilityInput {
  aircraftReg?: string;
  limit?: number;
  cursor?: string;
}
export interface ListReliabilityOutput {
  items: ReliabilityReportView[];
  cursor?: string;
  total: number;
}

// ─── Coverage rollup ────────────────────────────────────────────────

export interface CoverageInput {
  maxScan?: number;
}
export interface CoverageOutput {
  componentCatalogCount?: number;
  workOrderCount?: number;
  airworthinessDirectiveCount?: number;
  groundEquipmentCount?: number;
  componentTraceCount?: number;
  sparePartOrderCount?: number;
  reliabilityReportCount?: number;
  workOrdersByStatus?: Record<string, number>;
  truncated?: boolean;
  error?: string;
}

// ─── Validation + helpers ───────────────────────────────────────────

export function isUint(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}
export function isPct(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;
}
/** Decimal string: digits with an optional single fractional part. No float. */
export function isDecimalString(s: unknown): s is string {
  return typeof s === "string" && /^\d+(\.\d+)?$/.test(s);
}
export function didFor(kind: string, id: string): string {
  return `${AIR_MRO_DID_PREFIX}${kind}:${id.toLowerCase()}`;
}
export function rkeyOf(kind: string, id: string): string {
  return `${kind}-${id.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}
