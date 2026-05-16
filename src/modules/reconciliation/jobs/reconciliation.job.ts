export interface ReconciliationJobPayload {
  report_type: string;
  triggered_by: "scheduler" | "manual";
}
