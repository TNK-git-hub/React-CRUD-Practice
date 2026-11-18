// In-memory state with optional JSON-file persistence (D-37). One Node process owns the file.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Application, AuditEvent, OutboxMessage } from "./model.ts";

interface State {
  version: 2;
  applications: Application[];
  outbox: OutboxMessage[];
  audit: AuditEvent[];
}

const empty = (): State => ({ version: 2, applications: [], outbox: [], audit: [] });

export class Db {
  private state: State = empty();
  private readonly file: string | null;

  constructor(file: string | null = null) {
    this.file = file;
    if (file && existsSync(file)) {
      const loaded = JSON.parse(readFileSync(file, "utf8")) as Partial<State>;
      // data of the previous model (before 2026-11-18) is dropped, not migrated
      if (loaded.version === 2) this.state = loaded as State;
    }
  }

  get applications(): Application[] {
    return this.state.applications;
  }

  get outbox(): OutboxMessage[] {
    return this.state.outbox;
  }

  get audit(): AuditEvent[] {
    return this.state.audit;
  }

  save(): void {
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.state, null, 2));
  }

  /** D-02: hard delete. */
  reset(): void {
    this.state = empty();
    this.save();
  }
}
