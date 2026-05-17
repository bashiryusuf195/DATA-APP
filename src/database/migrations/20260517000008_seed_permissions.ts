import type { Knex } from "knex";

const PERMISSIONS: Array<{ resource: string; action: string; description: string }> = [
  // wallet
  { resource: "wallet",       action: "read",    description: "View wallet balances and ledger" },
  { resource: "wallet",       action: "create",  description: "Create wallets" },
  { resource: "wallet",       action: "update",  description: "Update wallet settings" },
  { resource: "wallet",       action: "execute", description: "Execute wallet operations (debit/credit)" },
  // transaction
  { resource: "transaction",  action: "read",    description: "View transaction records" },
  { resource: "transaction",  action: "create",  description: "Create transactions" },
  { resource: "transaction",  action: "update",  description: "Update transaction status" },
  { resource: "transaction",  action: "execute", description: "Execute transaction operations" },
  { resource: "transaction",  action: "export",  description: "Export transaction data" },
  // user
  { resource: "user",         action: "read",    description: "View user accounts" },
  { resource: "user",         action: "create",  description: "Create user accounts" },
  { resource: "user",         action: "update",  description: "Update user accounts" },
  { resource: "user",         action: "delete",  description: "Delete user accounts" },
  { resource: "user",         action: "approve", description: "Approve user KYC or status changes" },
  { resource: "user",         action: "reject",  description: "Reject user KYC or status changes" },
  // provider
  { resource: "provider",     action: "read",    description: "View provider configurations" },
  { resource: "provider",     action: "create",  description: "Create providers" },
  { resource: "provider",     action: "update",  description: "Update provider configurations" },
  { resource: "provider",     action: "delete",  description: "Delete providers" },
  // routing_rule
  { resource: "routing_rule", action: "read",    description: "View routing rules" },
  { resource: "routing_rule", action: "create",  description: "Create routing rules" },
  { resource: "routing_rule", action: "update",  description: "Update routing rules" },
  { resource: "routing_rule", action: "delete",  description: "Delete routing rules" },
  // funding
  { resource: "funding",      action: "read",    description: "View funding transactions" },
  { resource: "funding",      action: "execute", description: "Execute funding operations" },
  { resource: "funding",      action: "approve", description: "Approve funding requests" },
  // refund
  { resource: "refund",       action: "read",    description: "View refund records" },
  { resource: "refund",       action: "create",  description: "Initiate refunds" },
  { resource: "refund",       action: "execute", description: "Execute refund operations" },
  { resource: "refund",       action: "approve", description: "Approve refund requests" },
  // notification
  { resource: "notification", action: "read",    description: "View notifications" },
  { resource: "notification", action: "create",  description: "Create and send notifications" },
  { resource: "notification", action: "execute", description: "Broadcast notifications to users" },
  // catalog
  { resource: "catalog",      action: "read",    description: "View service catalog" },
  { resource: "catalog",      action: "create",  description: "Create catalog entries" },
  { resource: "catalog",      action: "update",  description: "Update catalog entries" },
  { resource: "catalog",      action: "delete",  description: "Delete catalog entries" },
  // audit_log
  { resource: "audit_log",    action: "read",    description: "View audit logs" },
  { resource: "audit_log",    action: "export",  description: "Export audit logs" },
  // role
  { resource: "role",         action: "read",    description: "View roles and permissions" },
  { resource: "role",         action: "create",  description: "Create roles" },
  { resource: "role",         action: "update",  description: "Update roles and assign permissions" },
  { resource: "role",         action: "delete",  description: "Delete non-system roles" },
  // report
  { resource: "report",       action: "read",    description: "View reports and analytics" },
  { resource: "report",       action: "export",  description: "Export reports and analytics data" },
  // queue
  { resource: "queue",        action: "read",    description: "View queue status and failed jobs" },
  { resource: "queue",        action: "execute", description: "Execute queue operations (retry, purge)" },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    "wallet:read", "wallet:create", "wallet:update", "wallet:execute",
    "transaction:read", "transaction:create", "transaction:update", "transaction:execute", "transaction:export",
    "user:read", "user:create", "user:update", "user:approve", "user:reject",
    "provider:read", "provider:create", "provider:update", "provider:delete",
    "routing_rule:read", "routing_rule:create", "routing_rule:update", "routing_rule:delete",
    "funding:read", "funding:execute", "funding:approve",
    "refund:read", "refund:create", "refund:execute", "refund:approve",
    "notification:read", "notification:create", "notification:execute",
    "catalog:read", "catalog:create", "catalog:update", "catalog:delete",
    "audit_log:read", "audit_log:export",
    "role:read", "role:create", "role:update",
    "report:read", "report:export",
    "queue:read", "queue:execute",
  ],
  support_agent: [
    "user:read",
    "transaction:read",
    "wallet:read",
    "notification:read",
  ],
  compliance: [
    "user:read", "user:approve", "user:reject",
    "transaction:read",
    "audit_log:read", "audit_log:export",
    "report:read", "report:export",
  ],
  finance: [
    "wallet:read",
    "transaction:read", "transaction:export",
    "funding:read", "funding:execute", "funding:approve",
    "refund:read", "refund:create", "refund:execute", "refund:approve",
    "report:read", "report:export",
  ],
  customer: [
    "wallet:read",
    "transaction:read",
    "notification:read",
  ],
  merchant: [
    "wallet:read",
    "transaction:read", "transaction:create",
    "notification:read",
  ],
  agent: [
    "user:read",
    "transaction:read",
    "wallet:read",
  ],
};

export async function up(knex: Knex): Promise<void> {
  await knex("permissions")
    .insert(PERMISSIONS)
    .onConflict(["resource", "action"])
    .ignore();

  for (const [roleSlug, permKeys] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await knex("roles").where({ slug: roleSlug }).first("id");
    if (!role) continue;

    for (const key of permKeys) {
      const [resource, action] = key.split(":");
      const perm = await knex("permissions").where({ resource, action }).first("id");
      if (!perm) continue;

      await knex("role_permissions")
        .insert({ role_id: role.id, permission_id: perm.id })
        .onConflict(["role_id", "permission_id"])
        .ignore();
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const { resource, action } of PERMISSIONS) {
    await knex("permissions").where({ resource, action }).delete();
  }
}
