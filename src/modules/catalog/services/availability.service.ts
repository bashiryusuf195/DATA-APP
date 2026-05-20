import { randomUUID } from "crypto";
import { getDbInstance } from "../../../db/knex";

const db = getDbInstance();

export interface GroupControl {
  id: string;
  service_type: string;
  network_operator: string;
  plan_category: string | null;
  is_active: boolean;
  reason: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupSummaryRow {
  service_type: string;
  network_operator: string;
  plan_category: string | null;
  plan_count: number;
  active_plan_count: number;
  is_active: boolean;
  reason: string | null;
  control_id: string | null;
}

export interface SetGroupControlInput {
  service_type: string;
  network_operator: string;
  plan_category: string | null;
  is_active: boolean;
  reason?: string | null;
  admin_id: string;
  ip_address?: string | null;
  user_agent?: string | null;
  request_id?: string | null;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function getGroupSummary(service_type?: string): Promise<GroupSummaryRow[]> {
  // Distinct networks from plans
  const networkGroups = await db("service_plans as sp")
    .join("catalog_services as cs", "cs.id", "sp.service_id")
    .whereNotNull("sp.network_operator")
    .modify((q) => { if (service_type) q.where("cs.service_type", service_type); })
    .groupBy("cs.service_type", "sp.network_operator")
    .orderBy("cs.service_type", "asc")
    .orderBy("sp.network_operator", "asc")
    .select<{ service_type: string; network_operator: string; plan_count: string; active_plan_count: string }[]>(
      "cs.service_type",
      "sp.network_operator",
      db.raw("COUNT(*) AS plan_count"),
      db.raw("SUM(CASE WHEN sp.is_active THEN 1 ELSE 0 END) AS active_plan_count"),
    );

  // Distinct network+category combos from plans
  const categoryGroups = await db("service_plans as sp")
    .join("catalog_services as cs", "cs.id", "sp.service_id")
    .whereNotNull("sp.network_operator")
    .whereNotNull("sp.plan_category")
    .modify((q) => { if (service_type) q.where("cs.service_type", service_type); })
    .groupBy("cs.service_type", "sp.network_operator", "sp.plan_category")
    .orderBy("cs.service_type", "asc")
    .orderBy("sp.network_operator", "asc")
    .orderBy("sp.plan_category", "asc")
    .select<{ service_type: string; network_operator: string; plan_category: string; plan_count: string; active_plan_count: string }[]>(
      "cs.service_type",
      "sp.network_operator",
      "sp.plan_category",
      db.raw("COUNT(*) AS plan_count"),
      db.raw("SUM(CASE WHEN sp.is_active THEN 1 ELSE 0 END) AS active_plan_count"),
    );

  // Existing controls
  const controls = await db("service_availability_controls")
    .modify((q) => { if (service_type) q.where("service_type", service_type); })
    .select<GroupControl[]>("*");

  const controlMap = new Map(
    controls.map((c) => [
      `${c.service_type}::${c.network_operator}::${c.plan_category ?? ""}`,
      c,
    ])
  );

  const networkRows: GroupSummaryRow[] = networkGroups.map((g) => {
    const ctrl = controlMap.get(`${g.service_type}::${g.network_operator}::`);
    return {
      service_type: g.service_type,
      network_operator: g.network_operator,
      plan_category: null,
      plan_count: parseInt(g.plan_count, 10),
      active_plan_count: parseInt(g.active_plan_count, 10),
      is_active: ctrl?.is_active ?? true,
      reason: ctrl?.reason ?? null,
      control_id: ctrl?.id ?? null,
    };
  });

  const categoryRows: GroupSummaryRow[] = categoryGroups.map((g) => {
    const ctrl = controlMap.get(`${g.service_type}::${g.network_operator}::${g.plan_category}`);
    return {
      service_type: g.service_type,
      network_operator: g.network_operator,
      plan_category: g.plan_category,
      plan_count: parseInt(g.plan_count, 10),
      active_plan_count: parseInt(g.active_plan_count, 10),
      is_active: ctrl?.is_active ?? true,
      reason: ctrl?.reason ?? null,
      control_id: ctrl?.id ?? null,
    };
  });

  return [...networkRows, ...categoryRows];
}

// ── Write ─────────────────────────────────────────────────────────────────────

export async function setGroupControl(input: SetGroupControlInput): Promise<GroupControl> {
  const {
    service_type, network_operator, plan_category,
    is_active, reason, admin_id, ip_address, user_agent, request_id,
  } = input;

  const existing = await db("service_availability_controls")
    .where({ service_type, network_operator })
    .modify((q) => {
      if (plan_category === null) q.whereNull("plan_category");
      else q.where("plan_category", plan_category);
    })
    .first<GroupControl>();

  let row: GroupControl;

  if (existing) {
    const [updated] = await db("service_availability_controls")
      .where({ id: existing.id })
      .update({ is_active, reason: reason ?? null, updated_by: admin_id, updated_at: new Date() })
      .returning("*");
    row = updated as GroupControl;
  } else {
    const [inserted] = await db("service_availability_controls")
      .insert({
        id: randomUUID(),
        service_type,
        network_operator,
        plan_category: plan_category ?? null,
        is_active,
        reason: reason ?? null,
        updated_by: admin_id,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning("*");
    row = inserted as GroupControl;
  }

  const scope = plan_category ? "category" : "network";
  const label = plan_category
    ? `${network_operator}/${plan_category} (${service_type})`
    : `${network_operator} (${service_type})`;

  // Fire-and-forget compliance audit (uses existing 'config_change' action enum value)
  db("audit_logs")
    .insert({
      id: randomUUID(),
      actor_id: admin_id,
      actor_type: "user",
      action: "config_change",
      outcome: "success",
      resource_type: "service_availability_control",
      resource_id: row.id,
      old_values: JSON.stringify({ is_active: existing?.is_active ?? null }),
      new_values: JSON.stringify({ is_active }),
      diff: JSON.stringify({ scope, service_type, network_operator, plan_category, is_active, reason, label }),
      ip_address: ip_address ?? null,
      user_agent: user_agent ?? null,
      request_id: request_id ?? null,
      metadata: JSON.stringify({ scope, label, changed_by: admin_id }),
      created_at: new Date(),
    })
    .catch(() => { /* never surface audit failures */ });

  return row;
}
