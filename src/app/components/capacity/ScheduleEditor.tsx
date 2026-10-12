"use client";

import type { ReactNode } from "react";
import { MAX_PLAN_YEARS, MIN_PLAN_YEARS, type PaymentFrequency } from "@/lib/capacity";
import { equalYearPcts, parseNumber, resizeYearPcts, type PlanForm } from "@/app/lib/capacityForm";
import { CheckRow, FieldError, Segmented } from "../ui";
import { CalcField, useFormErrors } from "./formErrors";

/** Whole-percent tolerance for "exactly 100%" as the user types (0.01 pp). */
const TOTAL_TOLERANCE_PCT = 0.005;

/**
 * A developer plan's payments: what is paid now, and how the rest is spread —
 * over how many years, how often, and (only if asked) each year's own share.
 * At 100% now there is no "rest", so the length and frequency are not asked.
 * A custom split shows a live total, and the plan does not solve until it is
 * exactly 100% — a schedule that pays 97% of a property is a typo, not a plan.
 */
export default function ScheduleEditor({
  plan,
  onChange,
  nowHint,
}: {
  plan: PlanForm;
  onChange: (patch: Partial<PlanForm>) => void;
  /** Replaces the "Paid now" hint — e.g. the amounts it comes to at the price entered. */
  nowHint?: ReactNode;
}) {
  const { errorFor } = useFormErrors();
  const at = (key: string) => `plan.${plan.id}.${key}` as const;
  const years = clampYears(parseNumber(plan.planYears));
  const nowPct = parseNumber(plan.nowPct);
  const allNow = nowPct !== null && nowPct >= 100;

  const changeYears = (raw: string) => {
    const next = clampYears(parseNumber(raw));
    onChange({
      planYears: raw,
      // Keep the custom list as long as the plan so year N always has a field —
      // padded with 0 rather than a guessed share.
      yearPcts: next === null ? plan.yearPcts : resizeYearPcts(plan.yearPcts, next),
    });
  };

  const setCustom = (custom: boolean) => {
    if (custom && years !== null) {
      // Start from the equal split, so the total already reads 100% and the
      // user edits from a valid plan rather than from zeros.
      const hasValues = plan.yearPcts.length === years && plan.yearPcts.some((p) => parseNumber(p));
      onChange({ scheduleMode: "custom", yearPcts: hasValues ? plan.yearPcts : equalYearPcts(nowPct ?? 0, years) });
      return;
    }
    onChange({ scheduleMode: custom ? "custom" : "equal" });
  };

  const setYearPct = (i: number, value: string) => {
    const next = [...plan.yearPcts];
    next[i] = value;
    onChange({ yearPcts: next });
  };

  const custom = plan.scheduleMode === "custom";
  const total = custom ? (nowPct ?? 0) + plan.yearPcts.reduce((a, p) => a + (parseNumber(p) ?? 0), 0) : 100;
  const totalOk = Math.abs(total - 100) <= TOTAL_TOLERANCE_PCT;
  const equalEach = years && nowPct !== null && nowPct >= 0 && nowPct < 100 ? (100 - nowPct) / years : null;
  // A problem with the set of years the total row is not already showing.
  const groupError = errorFor(at("yearPcts"));

  return (
    <div className="space-y-4">
      <CalcField
        field={at("nowPct")}
        label="Paid now"
        hint={nowHint ?? "What you pay when you sign. 100 means you pay it all now."}
        value={plan.nowPct}
        onChange={(v) => onChange({ nowPct: v })}
        suffix="% of the price"
        placeholder="10"
      />

      {!allNow && (
        <>
          <CalcField
            field={at("planYears")}
            label="The rest is paid over"
            hint={`${MIN_PLAN_YEARS}–${MAX_PLAN_YEARS} whole years.`}
            value={plan.planYears}
            onChange={changeYears}
            suffix="years"
            placeholder="8"
          />

          <div>
            <span className="mb-1.5 block text-xs font-medium text-white/60">How often</span>
            <Segmented<PaymentFrequency>
              ariaLabel="How often installments are paid"
              value={plan.frequency}
              onChange={(frequency) => onChange({ frequency })}
              options={[
                { value: "yearly", label: "Yearly" },
                { value: "quarterly", label: "Quarterly" },
                { value: "monthly", label: "Monthly" },
              ]}
            />
            <p className="mt-1.5 text-[11px] leading-snug text-white/40">
              {plan.frequency === "yearly"
                ? "Paid at the end of each year."
                : "Each year's share is split equally across its payments."}
            </p>
          </div>

          <CheckRow
            checked={custom}
            onChange={setCustom}
            label="Set each year's share"
            hint={
              custom
                ? "Type what each year pays, as a % of the price."
                : equalEach !== null
                  ? `Off: each year pays ${trimPct(equalEach)}% of the price.`
                  : "Off: the rest is split equally across the years."
            }
          />

          {custom && (
            <div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {plan.yearPcts.map((p, i) => (
                  <CalcField
                    key={i}
                    field={at(`year-${i}`)}
                    label={`Year ${i + 1}`}
                    value={p}
                    onChange={(v) => setYearPct(i, v)}
                    suffix="%"
                    ariaLabel={`Year ${i + 1} share of the price`}
                  />
                ))}
              </div>
              <div
                className={`mt-3 flex min-h-[44px] items-center justify-between gap-3 rounded-lg border px-3 py-2 text-xs ${
                  totalOk ? "border-white/10 bg-white/[0.03] text-white/60" : "border-loss/30 bg-loss/10 text-loss"
                }`}
                role="status"
              >
                <span>Paid now + every year</span>
                <span className="font-mono tabular-nums">
                  {trimPct(total)}% {totalOk ? <span className="text-white/40">= 100%</span> : <span>— must be 100%</span>}
                </span>
              </div>
              {groupError && totalOk && <FieldError>{groupError}</FieldError>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function clampYears(n: number | null): number | null {
  if (n === null || !Number.isInteger(n)) return null;
  if (n < MIN_PLAN_YEARS || n > MAX_PLAN_YEARS) return null;
  return n;
}

function trimPct(n: number): string {
  return Number(n.toFixed(2)).toString();
}
