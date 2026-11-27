import { randomUUID } from "node:crypto";
import type { CoreEvent } from "@codeteams/shared";
import { eventsTable, type CodeTeamsStorage } from "@codeteams/storage";
import { and, asc, eq, gt } from "drizzle-orm";

export type EventSubscriber = (event: CoreEvent) => void;

const EPHEMERAL_EVENT_TYPES = new Set(["message.delta", "thought.delta"]);

export class CoreEventBus {
  private readonly subscribers = new Set<EventSubscriber>();
  private ephemeralSeq = 0;

  constructor(private readonly storage: CodeTeamsStorage) {}

  subscribe(listener: EventSubscriber): () => void {
    this.subscribers.add(listener);
    return () => {
      this.subscribers.delete(listener);
    };
  }

  emit(input: {
    projectId: string;
    conversationId?: string;
    runId?: string;
    nodeRunId?: string;
    sessionId?: string;
    type: string;
    payload: unknown;
  }): CoreEvent {
    const eventId = randomUUID();
    const timestamp = new Date().toISOString();

    let seq: number;
    if (EPHEMERAL_EVENT_TYPES.has(input.type)) {
      // High-frequency streaming token deltas are emitted directly without blocking
      // the event loop on per-token SQLite disk transactions (full messages are persisted on completion).
      seq = ++this.ephemeralSeq;
    } else {
      const payloadJson = JSON.stringify(input.payload ?? {});
      const inserted = this.storage.db
        .insert(eventsTable)
        .values({
          eventId,
          projectId: input.projectId,
          conversationId: input.conversationId ?? null,
          runId: input.runId ?? null,
          nodeRunId: input.nodeRunId ?? null,
          sessionId: input.sessionId ?? null,
          type: input.type,
          payloadJson,
          createdAt: timestamp,
        })
        .returning({ seq: eventsTable.seq })
        .get();
      seq = inserted.seq;
    }

    const event: CoreEvent = {
      eventId,
      seq,
      timestamp,
      projectId: input.projectId,
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.nodeRunId ? { nodeRunId: input.nodeRunId } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      type: input.type,
      payload: input.payload,
    };

    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch {
        // Subscriber failure must never break event emission
      }
    }

    return event;
  }

  getLatestSeq(): number {
    const row = this.storage.sqlite
      .query<{ maxSeq: number | null }, []>("SELECT MAX(seq) AS maxSeq FROM events")
      .get();
    return row?.maxSeq ?? 0;
  }

  snapshotAfterCursor(params: {
    afterSeq: number;
    projectId?: string;
    conversationId?: string;
    runId?: string;
    limit?: number;
  }): CoreEvent[] {
    const conditions = [gt(eventsTable.seq, params.afterSeq)];
    if (params.projectId) {
      conditions.push(eq(eventsTable.projectId, params.projectId));
    }
    if (params.conversationId) {
      conditions.push(eq(eventsTable.conversationId, params.conversationId));
    }
    if (params.runId) {
      conditions.push(eq(eventsTable.runId, params.runId));
    }

    const rows = this.storage.db
      .select()
      .from(eventsTable)
      .where(and(...conditions))
      .orderBy(asc(eventsTable.seq))
      .limit(params.limit ?? 500)
      .all();

    return rows.map((row) => ({
      eventId: row.eventId,
      seq: row.seq,
      timestamp: row.createdAt,
      projectId: row.projectId,
      ...(row.conversationId ? { conversationId: row.conversationId } : {}),
      ...(row.runId ? { runId: row.runId } : {}),
      ...(row.nodeRunId ? { nodeRunId: row.nodeRunId } : {}),
      ...(row.sessionId ? { sessionId: row.sessionId } : {}),
      type: row.type,
      payload: JSON.parse(row.payloadJson),
    }));
  }
}
