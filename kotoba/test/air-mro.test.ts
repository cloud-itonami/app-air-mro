import { describe, it, expect, beforeEach } from "vitest";
import { MockEtzhayyim } from "@etzhayyim/sdk-mock";
import {
  registerComponent,
  listComponents,
  getComponent,
  createWorkOrder,
  listWorkOrders,
  recordDirective,
  listDirectives,
  recordGroundEquipment,
  listGroundEquipment,
  traceComponent,
  listTraces,
  getTrace,
  orderSparePart,
  listOrders,
  reportReliability,
  listReliability,
  coverage,
} from "../src/index.js";

const OWNER = "did:web:air-mro.etzhayyim.com";

describe("air-mro kotoba (maximal migration: plaintext ops + E2E confidential)", () => {
  let e: any;
  beforeEach(() => {
    e = new MockEtzhayyim({ did: OWNER });
  });

  describe("componentCatalog (PLAINTEXT reference / FK target)", () => {
    it("registers, dedups, lists/filters, gets by partNumber", async () => {
      expect((await registerComponent(e, { partNumber: "PN-100", componentType: "engine", manufacturer: "CFM" })).status).toBe("registered");
      expect((await registerComponent(e, { partNumber: "PN-100", componentType: "engine", manufacturer: "CFM" })).status).toBe("alreadyExists");
      expect((await registerComponent(e, { partNumber: "", componentType: "x", manufacturer: "y" })).status).toBe("rejected");
      await registerComponent(e, { partNumber: "PN-200", componentType: "apu", manufacturer: "Honeywell" });
      expect((await listComponents(e)).total).toBe(2);
      expect((await listComponents(e, { componentType: "engine" })).total).toBe(1);
      const got = await getComponent(e, { partNumber: "PN-100" });
      expect(got.component?.manufacturer).toBe("CFM");
      expect((await getComponent(e, { partNumber: "nope" })).error).toBe("notFound");
    });
  });

  describe("workOrder (PLAINTEXT ops fact; FK → componentCatalog)", () => {
    it("rejects when FK component missing, creates after register, dedups, lists/filters", async () => {
      expect((await createWorkOrder(e, { woNumber: "WO-1", aircraftReg: "JA801A", componentPartNumber: "PN-100", maintenanceType: "A-check" })).status).toBe("rejected"); // FK missing
      await registerComponent(e, { partNumber: "PN-100", componentType: "engine", manufacturer: "CFM" });
      expect((await createWorkOrder(e, { woNumber: "WO-1", aircraftReg: "JA801A", componentPartNumber: "PN-100", maintenanceType: "A-check" })).status).toBe("created");
      expect((await createWorkOrder(e, { woNumber: "WO-1", aircraftReg: "JA801A", componentPartNumber: "PN-100", maintenanceType: "A-check" })).status).toBe("alreadyExists");
      await createWorkOrder(e, { woNumber: "WO-2", aircraftReg: "JA802A", componentPartNumber: "PN-100", maintenanceType: "C-check", status: "closed" });
      expect((await listWorkOrders(e)).total).toBe(2);
      expect((await listWorkOrders(e, { aircraftReg: "JA801A" })).total).toBe(1);
      expect((await listWorkOrders(e, { status: "closed" })).total).toBe(1);
    });
  });

  describe("airworthinessDirective (PLAINTEXT reference catalog)", () => {
    it("records, validates percent 0-100, dedups, lists/filters by status", async () => {
      expect((await recordDirective(e, { adId: "AD-1", checkType: "AD", compliancePct: 100 })).status).toBe("recorded");
      expect((await recordDirective(e, { adId: "AD-1", checkType: "AD", compliancePct: 100 })).status).toBe("alreadyExists");
      expect((await recordDirective(e, { adId: "AD-X", checkType: "AD", compliancePct: 150 })).status).toBe("rejected"); // >100
      await recordDirective(e, { adId: "AD-2", checkType: "SB", compliancePct: 50, status: "closed" });
      expect((await listDirectives(e)).total).toBe(2);
      expect((await listDirectives(e, { status: "closed" })).total).toBe(1);
    });
  });

  describe("groundEquipment (PLAINTEXT asset inventory catalog)", () => {
    it("records, dedups, lists/filters by station + type", async () => {
      expect((await recordGroundEquipment(e, { gseId: "GSE-1", equipmentType: "tug", station: "HND" })).status).toBe("recorded");
      expect((await recordGroundEquipment(e, { gseId: "GSE-1", equipmentType: "tug", station: "HND" })).status).toBe("alreadyExists");
      expect((await recordGroundEquipment(e, { gseId: "", equipmentType: "x", station: "y" })).status).toBe("rejected");
      await recordGroundEquipment(e, { gseId: "GSE-2", equipmentType: "gpu", station: "NRT", status: "aog" });
      expect((await listGroundEquipment(e)).total).toBe(2);
      expect((await listGroundEquipment(e, { station: "HND" })).total).toBe(1);
      expect((await listGroundEquipment(e, { equipmentType: "gpu" })).total).toBe(1);
    });
  });

  describe("componentTrace (E2E supply-chain CUI)", () => {
    it("seals via encryptedWrite, round-trips, validates, lists/filters, gets by serial", async () => {
      const ok = await traceComponent(e, { serialNumber: "SN-9", partNumber: "PN-100", currentOperatorDid: "did:web:op.example", lifeRemainingPct: 72, valuationUsd: "182500.00" });
      expect(ok.status).toBe("recorded");
      expect(ok.keyId).toBeTruthy();
      expect((await traceComponent(e, { serialNumber: "SX", partNumber: "p", currentOperatorDid: "d", lifeRemainingPct: 200, valuationUsd: "1" })).status).toBe("rejected"); // pct>100
      expect((await traceComponent(e, { serialNumber: "SY", partNumber: "p", currentOperatorDid: "d", lifeRemainingPct: 10, valuationUsd: "1.2.3" })).status).toBe("rejected"); // bad decimal
      const got = await getTrace(e, { serialNumber: "SN-9" });
      expect(got.trace?.valuationUsd).toBe("182500.00");
      expect(got.trace?.lifeRemainingPct).toBe(72);
      await traceComponent(e, { serialNumber: "SN-10", partNumber: "PN-200", currentOperatorDid: "did:web:op2", lifeRemainingPct: 30, valuationUsd: "5000.00" });
      expect((await listTraces(e)).total).toBe(2);
      expect((await listTraces(e, { partNumber: "PN-100" })).total).toBe(1);
    });

    it("enforces read-cap: a non-recipient DID cannot decrypt the trace", async () => {
      await traceComponent(e, { serialNumber: "SN-9", partNumber: "PN-100", currentOperatorDid: "did:web:op", lifeRemainingPct: 50, valuationUsd: "100.00" });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listTraces(outsider)).total).toBe(0);
    });

    it("grants read-cap to an explicit recipient (owner still reads)", async () => {
      const partner = "did:web:lessor.example";
      const r = await traceComponent(e, { serialNumber: "SN-9", partNumber: "PN-100", currentOperatorDid: "did:web:op", lifeRemainingPct: 50, valuationUsd: "100.00", recipients: [partner] });
      expect(r.status).toBe("recorded");
      expect((await listTraces(e)).total).toBe(1);
    });
  });

  describe("sparePartOrder (E2E procurement ledger; fiat settlement stays etzhayyim)", () => {
    it("seals ledger entry, validates quantity + decimal money, round-trips, filters by supplier", async () => {
      const ok = await orderSparePart(e, { orderId: "ORD-1", partNumber: "PN-100", supplierDid: "did:web:sup.example", quantity: 2, unitPriceUsd: "4250.00", lineValueUsd: "8500.00" });
      expect(ok.status).toBe("recorded");
      expect(ok.keyId).toBeTruthy();
      expect((await orderSparePart(e, { orderId: "OX", partNumber: "p", supplierDid: "s", quantity: 0, unitPriceUsd: "1", lineValueUsd: "1" })).status).toBe("rejected"); // qty 0
      expect((await orderSparePart(e, { orderId: "OY", partNumber: "p", supplierDid: "s", quantity: 1, unitPriceUsd: "abc", lineValueUsd: "1" })).status).toBe("rejected"); // bad money
      await orderSparePart(e, { orderId: "ORD-2", partNumber: "PN-200", supplierDid: "did:web:sup2", quantity: 1, unitPriceUsd: "100.00", lineValueUsd: "100.00" });
      expect((await listOrders(e)).total).toBe(2);
      expect((await listOrders(e, { supplierDid: "did:web:sup.example" })).total).toBe(1);
    });

    it("enforces read-cap on ledger entries", async () => {
      await orderSparePart(e, { orderId: "ORD-1", partNumber: "PN-100", supplierDid: "did:web:sup", quantity: 1, unitPriceUsd: "1.00", lineValueUsd: "1.00" });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listOrders(outsider)).total).toBe(0);
    });
  });

  describe("reliabilityReport (E2E confidential per-aircraft + occurrence)", () => {
    it("seals via encryptedWrite, validates integer metrics, round-trips, filters by aircraft", async () => {
      const ok = await reportReliability(e, { reportId: "R-1", aircraftReg: "JA801A", ataChapter: "32", mtbfHours: 1200, occurrenceCount: 3, occurrenceSummary: "main gear retraction anomaly" });
      expect(ok.status).toBe("recorded");
      expect(ok.keyId).toBeTruthy();
      expect((await reportReliability(e, { reportId: "RX", aircraftReg: "a", ataChapter: "c", mtbfHours: -1, occurrenceCount: 0, occurrenceSummary: "s" })).status).toBe("rejected"); // bad mtbf
      await reportReliability(e, { reportId: "R-2", aircraftReg: "JA802A", ataChapter: "21", mtbfHours: 800, occurrenceCount: 1, occurrenceSummary: "pack temp drift" });
      expect((await listReliability(e)).total).toBe(2);
      expect((await listReliability(e, { aircraftReg: "JA801A" })).total).toBe(1);
    });

    it("enforces read-cap on safety-sensitive occurrence narratives", async () => {
      await reportReliability(e, { reportId: "R-1", aircraftReg: "JA801A", ataChapter: "32", mtbfHours: 100, occurrenceCount: 1, occurrenceSummary: "confidential" });
      const outsider: any = new MockEtzhayyim({ did: "did:web:outsider.example" });
      expect((await listReliability(outsider)).total).toBe(0);
    });
  });

  describe("coverage rollup (plaintext + E2E countAll)", () => {
    it("counts every collection across both wires", async () => {
      await registerComponent(e, { partNumber: "PN-100", componentType: "engine", manufacturer: "CFM" });
      await createWorkOrder(e, { woNumber: "WO-1", aircraftReg: "JA801A", componentPartNumber: "PN-100", maintenanceType: "A-check" });
      await createWorkOrder(e, { woNumber: "WO-2", aircraftReg: "JA802A", componentPartNumber: "PN-100", maintenanceType: "C-check", status: "closed" });
      await recordDirective(e, { adId: "AD-1", checkType: "AD", compliancePct: 90 });
      await recordGroundEquipment(e, { gseId: "GSE-1", equipmentType: "tug", station: "HND" });
      await traceComponent(e, { serialNumber: "SN-9", partNumber: "PN-100", currentOperatorDid: "did:web:op", lifeRemainingPct: 50, valuationUsd: "100.00" });
      await orderSparePart(e, { orderId: "ORD-1", partNumber: "PN-100", supplierDid: "did:web:sup", quantity: 1, unitPriceUsd: "1.00", lineValueUsd: "1.00" });
      await reportReliability(e, { reportId: "R-1", aircraftReg: "JA801A", ataChapter: "32", mtbfHours: 100, occurrenceCount: 1, occurrenceSummary: "x" });
      const cov = await coverage(e);
      expect(cov.componentCatalogCount).toBe(1);
      expect(cov.workOrderCount).toBe(2);
      expect(cov.airworthinessDirectiveCount).toBe(1);
      expect(cov.groundEquipmentCount).toBe(1);
      expect(cov.componentTraceCount).toBe(1);
      expect(cov.sparePartOrderCount).toBe(1);
      expect(cov.reliabilityReportCount).toBe(1);
      expect(cov.workOrdersByStatus?.open).toBe(1);
      expect(cov.workOrdersByStatus?.closed).toBe(1);
      expect(cov.truncated).toBe(false);
    });
  });
});
