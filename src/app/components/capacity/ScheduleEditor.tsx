"use client";

import { MAX_PLAN_YEARS, MIN_PLAN_YEARS, type PaymentFrequency } from "@/lib/capacity";
import { equalYearPcts, parseNumber, resizeYearPcts, type CapacityForm } from "@/app/lib/capacityForm";
import { Field, NumberInput, Segmented } from "./ui";

/** Whole-percent tolerance for "exactly 100%" as the user types (0.01 pp). */
const TOTAL_TOLERANCE_PCT = 0.005;

/**
 * Down payment + how the rest is spread over the years, and how often within
 * a year it is paid. Custom mode shows a live total and the calculator refuses
 * to run until it is exactly 100% — a schedule that pays 97% of a property is
 * not a plan, it is a typo.
 */
export default function ScheduleEditor({
  form,
  update,
}: {
  form: CapacityForm;
  update: (patch: Partial<CapacityForm>) => void;
}) {
  const years = clampYears(parseNumber(form.planYears));
  const downPct = parseNumber(form.downPaymentPct);

  const changeYears = (raw: string) => {
    const next = clampYears(parseNumber(raw));
    update({
      planYears: raw,
      // Keep the custom list the same length as the plan so year N always has
      // a field — padding with 0 rather than guessing a share.
      yearPcts: next === null ? form.yearPcts : resizeYearPcts(form.yearPcts, next),
    });
  };

  const changeMode = (scheduleMode: CapacityForm["scheduleMode"]) => {
    if (scheduleMode === "custom" && years !== null) {
      // Start custom from the equal split, so the total already reads 100%
      // and the user edits from a valid plan rather than from zeros.
      const hasValues = form.yearPcts.length === years && form.yearPcts.some((p) => parseNumber(p));
      update({
        scheduleMode,
        yearPcts: hasValues ? form.yearPcts : equalYearPcts(downPct ?? 0, years),
      });
      return;
    }
    update({ scheduleMode });
  };

  const setYearPct = (i: number, value: string) => {
    const next = [...form.yearPcts];
    next[i] = value;
    update({ yearPcts: next });
  };

  const total =
    form.scheduleMode === "custom"
      ? (downPct ?? 0) + form.yearPcts.reduce((a, p) => a + (parseNumber(p) ?? 0), 0)
      : 100;
  const totalOk = Math.abs(total - 100) <= TOTAL_TOLERANCE_PCT;
  const equalEach = years && downPct !== null ? (100 - downPct) / years : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Plan length" hint={`${MIN_PLAN_YEARS}–${MAX_PLAN_YEARS} years`}>
          <NumberInput value={form.planYears} onChange={changeYears} suffix="years" placeholder="8" />
        </Field>
        <Field label="Down payment">
          <NumberInput
            value={form.downPaymentPct}
            onChange={(v) => update({ downPaymentPct: v })}
            suffix="%"
            placeholder="10"
          />
        </Field>
      </div>

      <div>
        <span className="mb-1.5 block text-xs font-medium text-white/60">Remaining balance</span>
        <Segmented<CapacityForm["scheduleMode"]>
          ariaLabel="How installments are spread across years"
          value={form.scheduleMode}
          onChange={changeMode}
          options={[
            { value: "equal", label: "Equal installments" },
            { value: "custom", label: "Custom per year" },
          ]}
        />
      </div>

      {form.scheduleMode === "equal" ? (
        <p className="text-xs text-white/50">
          {equalEach !== null ? (
            <>
              Each year pays <span className="font-mono text-white/80">{trimPct(equalEach)}%</span> of the
              price after the down payment.
            </>
          ) : (
            "Enter the plan length and down payment."
          )}
        </p>
      ) : (
        <div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {form.yearPcts.map((p, i) => (
              <Field key={i} label={`Year ${i + 1}`}>
                <NumberInput
                  value={p}
                  onChange={(v) => setYearPct(i, v)}
                  suffix="%"
                  ariaLabel={`Year ${i + 1} share of the price`}
                />
              </Field>
            ))}
          </div>
          <div
            className={`mt-3 flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
              totalOk ? "border-white/10 bg-white/[0.03] text-white/60" : "border-loss/30 bg-loss/10 text-loss"
            }`}
            role="status"
          >
            <span>Down payment + years</span>
            <span className="font-mono">
              {trimPct(total)}%{" "}
              {totalOk ? <span className="text-white/40">= 100%</span> : <span>— must be exactly 100%</span>}
            </span>
          </div>
        </div>
      )}

      <div>
        <span className="mb-1.5 block text-xs font-medium text-white/60">Paid</span>
        <Segmented<PaymentFrequency>
          ariaLabel="Installment frequency within a year"
          value={form.frequency}
          onChange={(frequency) => update({ frequency })}
          options={[
            { value: "yearly", label: "Yearly" },
            { value: "quarterly", label: "Quarterly" },
            { value: "monthly", label: "Monthly" },
          ]}
        />
        <p className="mt-1.5 text-[11px] text-white/40">
          A year&apos;s share is split equally across its payments; yearly installments fall at the end of
          the year.
        </p>
      </div>
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
