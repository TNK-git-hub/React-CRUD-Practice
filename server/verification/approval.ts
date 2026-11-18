// AA conditions (flow item 12). A list so that more conditions can be added later (documents, open queries,
// second approver) once ValueMax confirms them; today the only one is Singpass (D-11). No setting turns it off.
import { currentLink } from "./model.ts";
import type { Application, LinkStatus } from "./model.ts";

export interface AaUnmet {
  condition: "singpass";
  partyId: string;
  label: string;
  name: string;
  status: LinkStatus;
}

export type AaCondition = (app: Application) => AaUnmet[];

/** Every party's current link must be FULFILLED. */
const singpassFulfilled: AaCondition = (app) =>
  app.parties
    .filter((p) => currentLink(p).status !== "FULFILLED")
    .map((p) => ({ condition: "singpass", partyId: p.id, label: p.label, name: p.name, status: currentLink(p).status }));

export const AA_CONDITIONS: readonly AaCondition[] = [singpassFulfilled];

export function checkAa(app: Application): { ready: boolean; missing: AaUnmet[] } {
  const missing = AA_CONDITIONS.flatMap((c) => c(app));
  return { ready: missing.length === 0, missing };
}
