import type { PlanResult } from "@/lib/capacity";
import type { FormError, Mode, PlanForm } from "./capacityForm";
import { formatMoney } from "./format";

/**
 * What a plan answers, in one label and one value — the same words on its
 * card, on the phone's sticky strip and in the desktop header, so the three
 * can never disagree.
 */
export interface PlanAnswer {
  /** Small caps above the value: what the value is. */
  label: string;
  value: string;
  /**
   * `answer`: a real figure. `muted`: a non-answer that is no one's fault
   * ("Nothing affordable", "Enter a price"). `problem`: an input is wrong or
   * the plan cannot work — the one case worth red.
   */
  tone: "answer" | "muted" | "problem";
  /** Why there is no figure: the money step is broken, this plan is, or it has no price yet. */
  missing: "money" | "plan" | "price" | null;
}

/**
 * A blank price in top-up mode is a question not yet asked, not a mistake:
 * it never counts as an error, never turns a field red, and the card asks
 * for it in plain words.
 */
export function isBlankPrice(plan: PlanForm, mode: Mode): boolean {
  return mode === "topUp" && plan.price.trim() === "";
}

/** The plan's blocking errors, minus a blank top-up price. */
export function realErrors(plan: PlanForm, mode: Mode, errors: FormError[]): FormError[] {
  if (!isBlankPrice(plan, mode)) return errors;
  const price = `plan.${plan.id}.price`;
  return errors.filter((e) => e.field !== price);
}

export function planAnswer({
  plan,
  mode,
  result,
  errors,
  moneyBroken,
  currency,
}: {
  plan: PlanForm;
  mode: Mode;
  result: PlanResult | null;
  /** The plan's own blocking errors (from parseForm). */
  errors: FormError[];
  moneyBroken: boolean;
  currency: string;
}): PlanAnswer {
  const label = mode === "max" ? (plan.kind === "resale" ? "Most to the seller" : "Most you can pay") : "Add each year";
  if (moneyBroken) return { label, value: "Fix your money first", tone: "problem", missing: "money" };
  if (realErrors(plan, mode, errors).length > 0) return { label, value: "Fix this plan", tone: "problem", missing: "plan" };
  if (isBlankPrice(plan, mode)) return { label, value: "Enter a price", tone: "muted", missing: "price" };
  if (result === null) return { label, value: "—", tone: "muted", missing: null };

  if (mode === "max") {
    return result.price === null
      ? { label, value: "Nothing affordable", tone: "muted", missing: null }
      : { label, value: formatMoney(result.price, currency), tone: "answer", missing: null };
  }
  if (result.topUp === null) return { label, value: "Can't work", tone: "problem", missing: null };
  if (result.topUp <= 0) return { label, value: "0 — covered", tone: "answer", missing: null };
  return { label, value: formatMoney(result.topUp, currency), tone: "answer", missing: null };
}
