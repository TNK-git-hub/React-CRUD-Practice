// Shared test harness: the verification service wired to the simulated gateway, a fake clock and a fake mailer.
import type { Clock } from "../server/clock.ts";
import { loadConfig } from "../server/config.ts";
import { MockGatewayAdapter, SimulatedGateway } from "../server/gateway/simulated.ts";
import { Db } from "../server/verification/db.ts";
import type { ApplicationInput, Party } from "../server/verification/model.ts";
import { VerificationService } from "../server/verification/service.ts";
import type { EmailMessage } from "../server/verification/service.ts";
import { USERS } from "../server/verification/users.ts";
import type { Actor } from "../server/verification/users.ts";

export const T0 = Date.UTC(2026, 10, 18, 2, 0);
export const H = 3_600_000;

export class FakeClock implements Clock {
  t: number;
  constructor(t: number) {
    this.t = t;
  }
  now(): number {
    return this.t;
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

export const DEALER = USERS.find((u) => u.id === "u-alex") as Actor;
export const OPS = USERS.find((u) => u.kind === "ops") as Actor;

export function applicationInput(): ApplicationInput {
  return {
    hirer: { name: "Heng Shi Zheng", nric: "F4440488P", email: "hirer@example.com", mobile: "9123 4567" },
    guarantors: [{ name: "Rajesh Kumar", nric: "G4440425M", email: "guarantor@example.com", mobile: "98765432" }],
    ltaCode: "A7K29Q",
  };
}

export function harness(env: Record<string, string> = {}) {
  const clock = new FakeClock(T0);
  const config = loadConfig({ PUBLIC_BASE_URL: "https://demo.test", ...env });
  const gatewaySystem = new SimulatedGateway(clock);
  const gateway = new MockGatewayAdapter(gatewaySystem, config.publicBaseUrl);
  const db = new Db();
  const emails: EmailMessage[] = [];
  const service = new VerificationService({
    db,
    gateway,
    clock,
    config,
    email: {
      send: async (m) => {
        emails.push(m);
        return { delivered: true };
      },
    },
    seal: (person) => `sealed:${JSON.stringify(person)}`,
  });
  return { clock, config, gatewaySystem, gateway, db, service, emails };
}

export type Harness = ReturnType<typeof harness>;

export function outboxFor(h: Harness, party: Party, channel: "email" | "sms") {
  return h.db.outbox.filter((m) => m.partyId === party.id && m.channel === channel);
}
