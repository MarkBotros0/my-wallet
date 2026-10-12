"use client";

import type { ReactNode } from "react";
import type { IncomeFrequency, SavingsVehicle } from "@/lib/capacity";
import type { MoneyForm } from "@/app/lib/capacityForm";
import { updateMoney } from "@/app/lib/capacityFormStore";
import { Field, FieldError, Segmented, useFieldState } from "../ui";
import { CalcField, fieldId, useFormErrors } from "./formErrors";

/**
 * Step ① — the user's money, entered once and shared by every plan. Four
 * small cards, each one question with a short title: what you have, where it
 * sits, what you add, how safe you want to stay. Every field carries a
 * one-line hint, so nothing needs explaining elsewhere.
 */
export default function MoneyStep({ money, currency }: { money: MoneyForm; currency: string }) {
  const perIncome = money.incomeFrequency === "monthly" ? "month" : "year";
  return (
    <div className="space-y-4">
      <StepCard title="Your savings" lead="What you have today, ready to put towards a home.">
        <CapitalRow money={money} />
      </StepCard>

      <StepCard title="Where they sit" lead="Your savings keep earning while you pay.">
        <div className="space-y-4">
          <Segmented<SavingsVehicle>
            ariaLabel="Where your savings sit"
            value={money.savingsVehicle}
            onChange={(savingsVehicle) => updateMoney({ savingsVehicle })}
            options={[
              { value: "fund", label: "Fund (e.g. Thndr)" },
              { value: "certificate", label: "Bank certificate" },
            ]}
          />
          {money.savingsVehicle === "fund" ? (
            <CalcField
              field="money.fundRatePct"
              label="Yearly return"
              hint="What the fund earned over a year, after its own fees."
              value={money.fundRatePct}
              onChange={(v) => updateMoney({ fundRatePct: v })}
              suffix="% a year"
              placeholder="20"
            />
          ) : (
            <CalcField
              field="money.certificateRatePct"
              label="Certificate rate, paid monthly"
              hint="The rate the bank quotes; interest is paid every month."
              value={money.certificateRatePct}
              onChange={(v) => updateMoney({ certificateRatePct: v })}
              suffix="% a year"
              placeholder="22"
            />
          )}
          <CalcField
            field="money.returnFeePct"
            label="Fees or tax on returns"
            hint="Taken off every return before it is added. Leave blank if none."
            value={money.returnFeePct}
            onChange={(v) => updateMoney({ returnFeePct: v })}
            suffix="% of returns"
            placeholder="0"
          />
        </div>
      </StepCard>

      <StepCard title="Income you add" lead="Salary or other money you can put towards the payments. Optional.">
        <div className="space-y-4">
          <Segmented<IncomeFrequency>
            ariaLabel="How often you add income"
            value={money.incomeFrequency}
            onChange={(incomeFrequency) => updateMoney({ incomeFrequency })}
            options={[
              { value: "monthly", label: "Every month" },
              { value: "yearly", label: "Once a year" },
            ]}
          />
          <CalcField
            field="money.incomeAmount"
            label="Amount"
            hint={
              money.incomeFrequency === "monthly"
                ? "Added to your savings every month. Leave blank if none."
                : "Added to your savings at the end of each year. Leave blank if none."
            }
            group
            value={money.incomeAmount}
            onChange={(v) => updateMoney({ incomeAmount: v })}
            suffix={`${currency} / ${perIncome}`}
            placeholder="0"
          />
          <CalcField
            field="money.incomeIncreasePct"
            label="Yearly raise"
            hint="How much the amount grows each year. Leave blank if it stays the same."
            value={money.incomeIncreasePct}
            onChange={(v) => updateMoney({ incomeIncreasePct: v })}
            suffix="% a year"
            placeholder="0"
          />
        </div>
      </StepCard>

      <StepCard title="Safety" lead="How much must stay untouched. Both are optional.">
        <div className="space-y-4">
          <CalcField
            field="money.safetyBuffer"
            label="Never go below"
            hint="Your savings never drop under this, in any month."
            group
            value={money.safetyBuffer}
            onChange={(v) => updateMoney({ safetyBuffer: v })}
            suffix={currency}
            placeholder="0"
          />
          <CalcField
            field="money.keepPct"
            label="Keep at the end"
            hint="Of today's savings, the share still there after the last payment."
            value={money.keepPct}
            onChange={(v) => updateMoney({ keepPct: v })}
            suffix="% of savings"
            placeholder="0"
          />
        </div>
      </StepCard>
    </div>
  );
}

/** One question of a step: a short title, one line of context, the fields. */
export function StepCard({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="surface p-4 md:p-5">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      {lead && <p className="mt-0.5 text-xs leading-snug text-white/50">{lead}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Savings with the currency code beside it. The code's column is narrow, so
 * the pair shares one error line underneath — the amount's problem first,
 * since it is the one that stops the answer.
 */
function CapitalRow({ money }: { money: MoneyForm }) {
  const { errorFor, bind } = useFormErrors();
  const error = errorFor("money.startingCapital") ?? errorFor("money.currency");
  const errorId = `${fieldId("money.startingCapital")}-row-error`;
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
        <CalcField
          field="money.startingCapital"
          label="Savings"
          hint="Everything you can use, in one number."
          errorId={errorId}
          group
          value={money.startingCapital}
          onChange={(v) => updateMoney({ startingCapital: v })}
          placeholder="5,000,000"
        />
        <Field label="Currency" error={errorFor("money.currency")} errorId={errorId}>
          <CurrencyInput value={money.currency} onChange={(currency) => updateMoney({ currency })} {...bind("money.currency")} />
        </Field>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

/** The three-letter code next to the savings; a raw input, so it reads the Field's error state itself. */
function CurrencyInput({
  value,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { invalid, errorId } = useFieldState();
  return (
    <input
      id={fieldId("money.currency")}
      type="text"
      maxLength={3}
      autoCapitalize="characters"
      autoComplete="off"
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      onFocus={onFocus}
      onBlur={onBlur}
      aria-label="Currency code"
      aria-invalid={invalid || undefined}
      aria-describedby={errorId}
      placeholder="EGP"
      className={`w-full rounded-lg border bg-white/5 px-3 py-2.5 font-mono text-[16px] uppercase text-white placeholder:text-white/25 outline-none transition-colors focus:ring-2 md:text-sm ${
        invalid ? "border-loss/50 focus:border-loss/70 focus:ring-loss/20" : "border-white/10 focus:border-accent/60 focus:ring-accent/20"
      }`}
    />
  );
}
