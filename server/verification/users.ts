// Sample dealers and users (D-08, D-09). No real user management in the demo.
export const DEALERS: Record<string, string> = {
  "d-demo": "Demo Motors Pte Ltd",
  "d-sample": "Sample Auto Pte Ltd",
};

export interface User {
  id: string;
  name: string;
  initials: string;
  kind: "dealer" | "ops";
  dealerId?: string;
  org: string;
  /** Dealer users: the dealer's company registration number and the salesperson's email (Dealer Declaration, Q5). */
  orgRegNo?: string;
  email?: string;
}

/** Whoever performs an action: a signed-in user. Background work is recorded as actor "system". */
export type Actor = User;

export const USERS: User[] = [
  { id: "u-alex", name: "Alex Tan", initials: "AT", kind: "dealer", dealerId: "d-demo", org: "Demo Motors Pte Ltd", orgRegNo: "202612345D", email: "alex.tan@demomotors.sg" },
  { id: "u-priya", name: "Priya Nair", initials: "PN", kind: "ops", org: "VMAF Ops" },
];
