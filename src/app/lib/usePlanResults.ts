import { useMemo } from "react";
import { bestPlan, commonHorizon, solvePlans, type Ask, type CalculatorInputs, type PlanResult } from "@/lib/capacity";
import { parseForm, type CapacityForm, type ParsedForm } from "./capacityForm";

export interface PlanResults {
  parsed: ParsedForm;
  /** Each plan's answer by id; null for a plan that could not be solved (bad input, or no price in top-up mode). */
  results: Record<string, PlanResult | null>;
  /** The id of the best solved plan, or null. */
  best: string | null;
  /** The years every solved plan is simulated over; null when nothing is solved. */
  horizon: number | null;
}

interface Solvable {
  id: string;
  inputs: CalculatorInputs;
  price: number | null;
}

/**
 * The parsed form and every plan's answer. Only plans that parse — and, in
 * top-up mode, carry a price — are handed to `solvePlans`, so the common
 * horizon is the horizon of the plans actually being compared; the results
 * are mapped back by id.
 *
 * Solving is the expensive part (a binary search per plan), so it is memoised
 * on a string of exactly what it reads: typing in a field that does not reach
 * the engine (a plan's name, the currency) re-parses but never re-solves. The
 * solver reads its inputs back from that string, so the memo cannot depend on
 * anything the key leaves out.
 */
export function usePlanResults(form: CapacityForm): PlanResults {
  const parsed = useMemo(() => parseForm(form), [form]);

  const key = useMemo(() => {
    const solvable: Solvable[] = [];
    for (const p of parsed.plans) {
      if (p.inputs === null) continue;
      if (form.mode === "topUp" && p.price === null) continue;
      solvable.push({ id: p.id, inputs: p.inputs, price: form.mode === "topUp" ? p.price : null });
    }
    return JSON.stringify({ mode: form.mode, solvable });
  }, [parsed, form.mode]);

  const solved = useMemo(() => {
    const { mode, solvable } = JSON.parse(key) as { mode: Ask["mode"]; solvable: Solvable[] };
    if (solvable.length === 0) return { byId: {} as Record<string, PlanResult>, best: null, horizon: null };
    const inputs = solvable.map((s) => s.inputs);
    const ask: Ask = mode === "max" ? { mode } : { mode, prices: solvable.map((s) => s.price ?? NaN) };
    const results = solvePlans(inputs, ask);
    const byId: Record<string, PlanResult> = {};
    solvable.forEach((s, i) => (byId[s.id] = results[i]));
    const bestIndex = bestPlan(results, mode);
    return { byId, best: bestIndex === null ? null : solvable[bestIndex].id, horizon: commonHorizon(inputs) };
  }, [key]);

  const results = useMemo(() => {
    const out: Record<string, PlanResult | null> = {};
    for (const p of form.plans) out[p.id] = solved.byId[p.id] ?? null;
    return out;
  }, [form.plans, solved]);

  return { parsed, results, best: solved.best, horizon: solved.horizon };
}
