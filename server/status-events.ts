import { pool } from "./db.js";

export type StatusEventActorType = "admin" | "agent" | "system";

export interface StatusEvent {
  id: number;
  agentId: number;
  eventType: string;
  actorType: StatusEventActorType;
  actorId: string;
  oldValue: string;
  newValue: string;
  metadataJson: string;
  createdAt: string;
}

export interface AdminStatusEvent extends StatusEvent {
  agentName: string;
  agentSubscriptionStatus: string;
  agentPipelineStage: string;
  agentCompanyEmail: string;
}

export async function logStatusEvent(input: {
  agentId: number;
  eventType: string;
  actorType: StatusEventActorType;
  actorId?: string;
  oldValue?: string;
  newValue?: string;
  metadata?: unknown;
}) {
  const nowIso = new Date().toISOString();
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : "";

  await pool.query(
    `
      insert into hr_status_events (
        agent_id,
        event_type,
        actor_type,
        actor_id,
        old_value,
        new_value,
        metadata_json,
        created_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8)
    `,
    [
      input.agentId,
      input.eventType,
      input.actorType,
      input.actorId ?? "",
      input.oldValue ?? "",
      input.newValue ?? "",
      metadataJson,
      nowIso,
    ],
  );

  return nowIso;
}

export async function listStatusEvents(agentId: number, limit = 12): Promise<StatusEvent[]> {
  const result = await pool.query<{
    id: number;
    agent_id: number;
    event_type: string;
    actor_type: StatusEventActorType;
    actor_id: string;
    old_value: string;
    new_value: string;
    metadata_json: string;
    created_at: string;
  }>(
    `
      select id, agent_id, event_type, actor_type, actor_id, old_value, new_value, metadata_json, created_at
      from hr_status_events
      where agent_id = $1
      order by id desc
      limit $2
    `,
    [agentId, limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    eventType: row.event_type,
    actorType: row.actor_type,
    actorId: row.actor_id,
    oldValue: row.old_value,
    newValue: row.new_value,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
  }));
}

export async function listStatusEventsPage(input: {
  agentId: number;
  limit: number;
  beforeId?: number;
}): Promise<StatusEvent[]> {
  const limit = Math.min(Math.max(Math.floor(input.limit), 1), 250);
  const values: unknown[] = [input.agentId];
  let clause = "where agent_id = $1";
  if (typeof input.beforeId === "number" && Number.isFinite(input.beforeId) && input.beforeId > 0) {
    values.push(input.beforeId);
    clause += ` and id < $${values.length}`;
  }
  values.push(limit);

  const result = await pool.query<{
    id: number;
    agent_id: number;
    event_type: string;
    actor_type: StatusEventActorType;
    actor_id: string;
    old_value: string;
    new_value: string;
    metadata_json: string;
    created_at: string;
  }>(
    `
      select id, agent_id, event_type, actor_type, actor_id, old_value, new_value, metadata_json, created_at
      from hr_status_events
      ${clause}
      order by id desc
      limit $${values.length}
    `,
    values,
  );

  return result.rows.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    eventType: row.event_type,
    actorType: row.actor_type,
    actorId: row.actor_id,
    oldValue: row.old_value,
    newValue: row.new_value,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
  }));
}

export async function listAdminStatusEvents(input: {
  limit: number;
  beforeId?: number;
  agentId?: number;
}): Promise<AdminStatusEvent[]> {
  const limit = Math.min(Math.max(Math.floor(input.limit), 1), 250);
  const values: unknown[] = [];
  const clauses: string[] = [];

  if (typeof input.beforeId === "number" && Number.isFinite(input.beforeId) && input.beforeId > 0) {
    values.push(input.beforeId);
    clauses.push(`e.id < $${values.length}`);
  }

  if (typeof input.agentId === "number" && Number.isFinite(input.agentId) && input.agentId > 0) {
    values.push(input.agentId);
    clauses.push(`e.agent_id = $${values.length}`);
  }

  values.push(limit);
  const whereSql = clauses.length ? `where ${clauses.join(" and ")}` : "";

  const result = await pool.query<{
    id: number;
    agent_id: number;
    event_type: string;
    actor_type: StatusEventActorType;
    actor_id: string;
    old_value: string;
    new_value: string;
    metadata_json: string;
    created_at: string;
    agent_name: string;
    subscription_status: string;
    crm_pipeline_stage: string;
    company_email: string;
  }>(
    `
      select
        e.id,
        e.agent_id,
        e.event_type,
        e.actor_type,
        e.actor_id,
        e.old_value,
        e.new_value,
        e.metadata_json,
        e.created_at,
        a.name as agent_name,
        a.subscription_status,
        a.crm_pipeline_stage,
        a.company_email
      from hr_status_events e
      join hr_agents a on a.id = e.agent_id
      ${whereSql}
      order by e.id desc
      limit $${values.length}
    `,
    values,
  );

  return result.rows.map((row) => ({
    id: row.id,
    agentId: row.agent_id,
    eventType: row.event_type,
    actorType: row.actor_type,
    actorId: row.actor_id,
    oldValue: row.old_value,
    newValue: row.new_value,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
    agentName: row.agent_name,
    agentSubscriptionStatus: row.subscription_status,
    agentPipelineStage: row.crm_pipeline_stage,
    agentCompanyEmail: row.company_email,
  }));
}
