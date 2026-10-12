"use client";

import { useState, type ReactNode } from "react";
import { MAX_PLAN_YEARS, durationText, lastInstallmentMonth, paymentsPerYear, type PaymentFrequency, type PlanResult } from "@/lib/capacity";
import { parseNumber, planName, type Mode, type PlanForm, type PlanKind } from "@/app/lib/capacityForm";
import { formatMoney } from "@/app/lib/format";
import { Field, FieldError, Segmented, inputClass } from "../ui";
import { CalcField, fieldId, useFormErrors } from "./formErrors";
import LoanCard from "./LoanCard";
import ScheduleEditor from "./ScheduleEditor";

/** When the last installment falls due, once the count is a valid whole number; else what the field asks. */
function resaleEndHint(plan: PlanForm): string {
  const n = parseNumber(plan.resaleInstallments);
  const max = MAX_PLAN_YEARS * paymentsPerYear(plan.resaleFrequency);
  if (n !== null && Number.isInteger(n) && n >= 1 && n <= max) {
    return `The last one is due in ${durationText(lastInstallmentMonth(n, plan.resaleFrequency))}.`;
  }
  return "How many payments the seller still owes the developer.";
}

/**
 * One plan's terms, opened inline under its card. Read top to bottom it is
 * the deal as a developer or seller would state it: who you buy from, the
 * price (required in top-up mode; an optional asking price in max mode),
 * what you pay and when, a bank loan if any, and the extra costs. The two optional parts — the loan
 * and the extra costs — stay one line until switched on or opened.
 */
export default function PlanEditor({
  plan,
  mode,
  currency,
  result,
  onChange,
  onDone,
}: {
  plan: PlanForm;
  mode: Mode;
  currency: string;
  result: PlanResult | null;
  onChange: (patch: Partial<PlanForm>) => void;
  onDone: () => void;
}) {
  const at = (key: string) => `plan.${plan.id}.${key}` as const;
  const resale = plan.kind === "resale";
  const price = parseNumber(plan.price);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <Field label="Name (optional)" hint="Leave blank and the plan is named after its terms.">
          <input
            id={fieldId(at("name"))}
            type="text"
            autoComplete="off"
            value={plan.name}
            placeholder={planName({ ...plan, name: "" })}
            onChange={(e) => onChange({ name: e.target.value })}
            className={inputClass}
          />
        </Field>
        <div>
          <span className="mb-1.5 block text-xs font-medium text-white/60">Buying from</span>
          <Segmented<PlanKind>
            ariaLabel="Buying from"
            value={plan.kind}
            onChange={(kind) => onChange({ kind })}
            options={[
              { value: "developer", label: "Developer" },
              { value: "resale", label: "Resale" },
            ]}
          />
        </div>
      </div>

      <Group title="What you pay">
        {resale ? (
          <>
            <CalcField
              field={at("price")}
              label={mode === "topUp" ? "Cash to the seller" : "Cash to the seller (optional)"}
              hint={
                mode === "topUp"
                  ? "What you pay the old owner now, on top of what is still owed to the developer."
                  : "The old owner's asking price. Leave blank and the calculator finds the most you can pay them; enter it to see whether it fits."
              }
              group
              value={plan.price}
              onChange={(v) => onChange({ price: v })}
              suffix={currency}
              placeholder="e.g. 3,000,000"
            />
            <CalcField
              field={at("resaleRemaining")}
              label="What's still owed to the developer"
              hint="The installments the seller has not paid yet, which you take over."
              group
              value={plan.resaleRemaining}
              onChange={(v) => onChange({ resaleRemaining: v })}
              suffix={currency}
              placeholder="0"
            />
            <div>
              <span className="mb-1.5 block text-xs font-medium text-white/60">How often</span>
              <Segmented<PaymentFrequency>
                ariaLabel="How often the remaining installments are paid"
                value={plan.resaleFrequency}
                onChange={(resaleFrequency) => onChange({ resaleFrequency })}
                options={[
                  { value: "yearly", label: "Yearly" },
                  { value: "quarterly", label: "Quarterly" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
            </div>
            <CalcField
              field={at("resaleInstallments")}
              label="Installments left"
              hint={resaleEndHint(plan)}
              value={plan.resaleInstallments}
              onChange={(v) => onChange({ resaleInstallments: v })}
              suffix={plan.resaleFrequency}
              placeholder="4"
            />
          </>
        ) : (
          <>
            <CalcField
              field={at("price")}
              label={mode === "topUp" ? "Price" : "Price (optional)"}
              hint={
                mode === "topUp"
                  ? "The developer's list price, before any discount."
                  : "The developer's list price. Leave blank and the calculator finds the most you can pay; enter it to see whether it fits."
              }
              group
              value={plan.price}
              onChange={(v) => onChange({ price: v })}
              suffix={currency}
              placeholder="e.g. 9,000,000"
            />
            <CalcField
              field={at("discountPct")}
              label="Discount"
              hint="Off the list price for paying this way. Leave blank if none."
              value={plan.discountPct}
              onChange={(v) => onChange({ discountPct: v })}
              suffix="% off"
              placeholder="0"
            />
            <ScheduleEditor
              plan={plan}
              onChange={onChange}
              nowHint={price !== null ? payLine(plan, price, currency) : undefined}
            />
          </>
        )}
      </Group>

      <Group title="Bank loan">
        <LoanCard
          plan={plan}
          onChange={onChange}
          loan={result?.simulation?.loan ?? null}
          atPrice={mode === "max" ? "max" : "price"}
          currency={currency}
        />
      </Group>

      <ExtraCosts plan={plan} onChange={onChange} />

      <button type="button" onClick={onDone} className="btn-primary min-h-[44px] w-full rounded-lg px-4 text-sm font-medium">
        Done
      </button>
    </div>
  );
}

/** "You pay X now, Y over the plan" — the percentages read back as money at the price entered. */
function payLine(plan: PlanForm, price: number, currency: string): ReactNode {
  const off = parseNumber(plan.discountPct) ?? 0;
  const now = parseNumber(plan.nowPct);
  if (now === null || off < 0 || off >= 100 || now < 0) return undefined;
  const cost = price * (1 - off / 100);
  const upFront = cost * Math.min(now, 100) / 100;
  const money = (n: number) => <span className="font-mono text-white/70">{formatMoney(n, currency)}</span>;
  return now >= 100 ? (
    <>You pay {money(upFront)} now.</>
  ) : (
    <>
      You pay {money(upFront)} now, {money(cost - upFront)} over the plan.
    </>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4 border-t border-white/10 pt-5">
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Maintenance and finishing, as a share of the price in a given year. Most
 * plans have neither, so this is one line saying so until opened — and it
 * is always open while one of its fields has a problem.
 */
function ExtraCosts({ plan, onChange }: { plan: PlanForm; onChange: (patch: Partial<PlanForm>) => void }) {
  const { errorFor } = useFormErrors();
  const [open, setOpen] = useState(false);
  const at = (key: string) => `plan.${plan.id}.${key}` as const;
  const keys = ["maintenancePct", "maintenanceYear", "finishingPct", "finishingYear"] as const;
  const forced = keys.some((k) => errorFor(at(k)) !== undefined);
  const shown = open || forced;

  const part = (pct: string, year: string, what: string) => {
    const n = parseNumber(pct);
    return n ? `${what} ${n}% in year ${year || "1"}` : null;
  };
  const summary =
    [part(plan.maintenancePct, plan.maintenanceYear, "Maintenance"), part(plan.finishingPct, plan.finishingYear, "Finishing")]
      .filter(Boolean)
      .join(" · ") || "None";

  return (
    <section className="border-t border-white/10 pt-5">
      <button
        type="button"
        onClick={() => !forced && setOpen(!shown)}
        aria-expanded={shown}
        aria-disabled={forced || undefined}
        aria-controls={`extras-${plan.id}`}
        className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-white">Extra costs</span>
          <span className="block truncate text-xs text-white/50">{summary}</span>
        </span>
        {/* While a field inside has a problem it cannot close, so it offers no toggle. */}
        {!forced && <span className="shrink-0 text-xs font-medium text-accent">{shown ? "Hide" : "Change"}</span>}
      </button>
      {shown && (
        <div id={`extras-${plan.id}`} className="mt-3 space-y-4">
          <CostRow
            label="Maintenance deposit"
            pctField={at("maintenancePct")}
            yearField={at("maintenanceYear")}
            pct={plan.maintenancePct}
            year={plan.maintenanceYear}
            onPct={(v) => onChange({ maintenancePct: v })}
            onYear={(v) => onChange({ maintenanceYear: v })}
          />
          <CostRow
            label="Finishing"
            pctField={at("finishingPct")}
            yearField={at("finishingYear")}
            pct={plan.finishingPct}
            year={plan.finishingYear}
            onPct={(v) => onChange({ finishingPct: v })}
            onYear={(v) => onChange({ finishingYear: v })}
          />
          <p className="text-[11px] leading-snug text-white/40">
            A share of the price, paid at the end of the year it is due. Leave blank if none.
          </p>
        </div>
      )}
    </section>
  );
}

/** A cost's share and its year side by side, sharing one error line beneath the pair. */
function CostRow({
  label,
  pctField,
  yearField,
  pct,
  year,
  onPct,
  onYear,
}: {
  label: string;
  pctField: `plan.${string}.${string}`;
  yearField: `plan.${string}.${string}`;
  pct: string;
  year: string;
  onPct: (v: string) => void;
  onYear: (v: string) => void;
}) {
  const { errorFor } = useFormErrors();
  const error = errorFor(pctField) ?? errorFor(yearField);
  const errorId = `${fieldId(pctField)}-row-error`;
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
        <CalcField
          field={pctField}
          label={label}
          errorId={errorId}
          value={pct}
          onChange={onPct}
          suffix="% of price"
          placeholder="0"
          ariaLabel={`${label} percent`}
        />
        <CalcField
          field={yearField}
          label="In year"
          errorId={errorId}
          value={year}
          onChange={onYear}
          placeholder="1"
          ariaLabel={`${label} year due`}
        />
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
