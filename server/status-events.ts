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

