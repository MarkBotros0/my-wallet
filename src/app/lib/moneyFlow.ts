import {
  purchaseOf,
  type CalculatorInputs,
  type FlowTotals,
  type PurchaseKind,
  type SavingsVehicle,
  type SimulationResult,
  type YearSummary,
} from "@/lib/capacity";

/**
 * Where the money goes, as groups of signed rows: + came into the fund,
 * − left it. Pledged and released money is "held": it moves between spendable
 * and locked, still signed. Pure — the component formats and colours.
 *
 *   start + Σ group subtotals = end
 */

export type FlowGroupId = "savings" | "added" | "developer" | "bank" | "costs";
export type FlowTone = "in" | "out" | "held" | "neutral";
export interface FlowRow {
  key: string;
  label: string;
  amount: number;
  tone: FlowTone;
}
export interface FlowGroup {
  id: FlowGroupId;
  title: string;
  rows: FlowRow[];
  /** The full net of the rows, held ones included, so `start + Σ subtotals = end` reconciles. */
  subtotal: number;
  /**
   * The colour the subtotal wears: the direction of the money that really
   * came in or went out — in/out rows only. The guarantee locked or returned
   * is still the user's money, so it never turns a subtotal green or red.
   */
  tone: FlowTone;
}

/** The direction of a group's real money: Σ in/out rows, held excluded; under half a unit is no direction. */
export function groupTone(rows: FlowRow[]): FlowTone {
  const net = rows.reduce((s, r) => (r.tone === "in" || r.tone === "out" ? s + r.amount : s), 0);
  return net >= 0.5 ? "in" : net <= -0.5 ? "out" : "neutral";
}

export function flowGroups(
  flows: FlowTotals | YearSummary,
  ctx: { vehicle: SavingsVehicle; kind: PurchaseKind; hasLoan: boolean; start?: number },
): FlowGroup[] {
  const resale = ctx.kind === "resale";
  const row = (key: string, label: string, amount: number, tone: FlowTone): FlowRow => ({ key, label, amount, tone });
  const keep = (rows: FlowRow[]) => rows.filter((r) => r.amount !== 0);
  const group = (id: FlowGroupId, title: string, rows: FlowRow[], start?: FlowRow): FlowGroup => {
    const kept = keep(rows);
    const subtotal = kept.reduce((s, r) => s + r.amount, 0);
    const real = groupTone(kept);
    // A guarantee coming back can flip the sign: a "+" painted as money out
    // (or a "−" as money in) reads as a contradiction, so it stays neutral.
    const tone = (real === "in" && subtotal < 0) || (real === "out" && subtotal > 0) ? "neutral" : real;
    return { id, title, rows: start ? [start, ...kept] : kept, subtotal, tone };
  };

  const groups = [
    group(
      "savings",
      "Your savings",
      [row("returns", ctx.vehicle === "certificate" ? "Certificate interest" : "Fund returns", flows.returns, "in")],
      ctx.start === undefined ? undefined : row("start", "You start with", ctx.start, "neutral"),
    ),
    group("added", "What you add", [
      row("income", "Income", flows.income, "in"),
      row("topUp", "Yearly top-up", flows.topUp, "in"),
    ]),
    group("developer", resale ? "Seller and developer" : "Developer", [
      row("upFront", resale ? "Cash to the seller" : "Paid now", -flows.upFront, "out"),
      row("installments", resale ? "Developer installments" : "Installments", -flows.installments, "out"),
    ]),
    group("bank", "Bank loan", [
      row("loanReceived", "Loan received", flows.loanReceived, "in"),
      row("bankInstallments", "Bank installments", -flows.bankInstallments, "out"),
      row("pledged", "Locked as guarantee", -flows.pledged, "held"),
      row("released", "Guarantee returned", flows.released, "held"),
      row("certificateInterest", "Interest on the guarantee", flows.certificateInterest, "in"),
    ]),
    group("costs", "Extra costs", [row("extraCosts", "Maintenance and finishing", -flows.extraCosts, "out")]),
  ];
  return groups.filter((g) => g.rows.length > 0);
}

/** The whole deal: the starting capital, every group, the final balance. */
export function dealBreakdown(
  inputs: CalculatorInputs,
  sim: SimulationResult,
): { start: number; groups: FlowGroup[]; end: number } {
  const start = sim.startingCapital;
  return {
    start,
    groups: flowGroups(sim.totals, {
      vehicle: inputs.savingsVehicle ?? "fund",
      kind: purchaseOf(inputs).kind,
      hasLoan: !!sim.loan && sim.loan.amount > 0,
      start,
    }),
    end: sim.finalBalance,
  };
}
