/**
 * air-mro kotoba — barrel. Maximal migration: public ops facts + part/AD
 * reference plaintext (sdk.write/read); per-asset commercial + safety-sensitive
 * confidential bodies (componentTrace / sparePartOrder ledger /
 * reliabilityReport) sealed via kotoba E2E (sdk.encryptedWrite/Read,
 * ADR-2605181100). Fiat settlement EXECUTION + airworthiness grounding
 * enforcement stay etzhayyim via consent-capability.
 */
export * from "./types.js";
export {
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
} from "./registry.js";
