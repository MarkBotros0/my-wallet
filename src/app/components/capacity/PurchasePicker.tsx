"use client";

import type { PaymentFrequency, PurchaseKind } from "@/lib/capacity";
import type { CapacityForm } from "@/app/lib/capacityForm";
import { formatMoney } from "@/app/lib/format";
import { parseNumber } from "@/app/lib/numbers";
import { Segmented } from "../ui";
import { CalcField } from "./formErrors";

const CHOICES: { kind: PurchaseKind; title: string; line: string }[] = [
  {
    kind: "developer-plan",
    title: "From the developer, in installments",
    line: "Down payment now, the rest over the developer's plan.",
  },
  { kind: "developer-cash", title: "From the developer, in cash", line: "Pay the cash price up front, usually at a discount." },
  { kind: "resale", title: "Resale", line: "Pay a seller in cash and take over what they still owe the developer." },
];

const EVERY: Record<PaymentFrequency, string> = {
  yearly: "a year, at the end of each year",
  quarterly: "a quarter",
  monthly: "a month",
};
const PER_YEAR: Record<PaymentFrequency, number> = { yearly: 1, quarterly: 4, monthly: 12 };

/**
 * The first question the calculator asks, in words before any number: how
 * the property is bought. Three real radio buttons dressed as cards (native
 * arrow-key and screen-reader behaviour), then only the fields that kind
 * needs. Switching keeps every kind's values, so comparing costs nothing.
 */
export default function PurchasePicker({
  form,
  update,
}: {
  form: CapacityForm;
  update: (patch: Partial<CapacityForm>) => void;
}) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="sr-only">How are you buying?</legend>
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-1">
          {CHOICES.map((c) => {
            const on = form.purchaseKind === c.kind;
            return (
              <label
                key={c.kind}
                className={`pressable flex min-h-[44px] cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40 ${
                  on ? "border-accent/60 bg-accent/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                }`}
              >
                <input
                  type="radio"
                  name="purchase-kind"
                  value={c.kind}
                  checked={on}
                  onChange={() => update({ purchaseKind: c.kind })}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-white">{c.title}</span>
                <span className="text-xs leading-snug text-white/50">{c.line}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      {form.purchaseKind === "developer-cash" && <CashFields form={form} update={update} />}
    </div>
  );
}

function CashFields({ form, update }: { form: CapacityForm; update: (patch: Partial<CapacityForm>) => void }) {
  const pct = parseNumber(form.cashDiscountPct) ?? 0;
  return (
    <CalcField
      field="cashDiscountPct"
      label="Cash discount"
      hint={
        pct > 0 && pct < 100
          ? `You pay ${Number((100 - pct).toFixed(2))}% of the installment price, all up front.`
          : "How much less the developer charges for paying everything now."
      }
      value={form.cashDiscountPct}
      onChange={(v) => update({ cashDiscountPct: v })}
      suffix="% off"
      placeholder="0"
    />
  );
}

/** The resale's remaining developer balance — shown in the Payments section, where the plan would be. */
export function ResaleFields({
  form,
  update,
  currency,
}: {
  form: CapacityForm;
  update: (patch: Partial<CapacityForm>) => void;
  currency: string;
}) {
  const remaining = parseNumber(form.resaleRemaining);
  const yearsLeft = parseNumber(form.resaleYears);
  const each =
    remaining !== null && remaining > 0 && yearsLeft !== null && yearsLeft >= 1
      ? remaining / (yearsLeft * PER_YEAR[form.resaleFrequency])
      : null;
  return (
    <div className="space-y-4">
      <CalcField
        field="resaleRemaining"
        label="Still owed to the developer"
        hint="What the seller has left to pay on their contract — you take it over. 0 if it is paid off."
        group
        value={form.resaleRemaining}
        onChange={(v) => update({ resaleRemaining: v })}
        suffix={currency}
        placeholder="5,000,000"
      />
      <div className="grid grid-cols-[7rem_minmax(0,1fr)] items-end gap-3">
        <CalcField
          field="resaleYears"
          label="Years left"
          value={form.resaleYears}
          onChange={(v) => update({ resaleYears: v })}
          placeholder="4"
        />
        <div>
          <span className="mb-1.5 block text-xs font-medium text-white/60">Paid</span>
          <Segmented<PaymentFrequency>
            ariaLabel="How often the remaining balance is paid"
            value={form.resaleFrequency}
            onChange={(resaleFrequency) => update({ resaleFrequency })}
            options={[
              { value: "yearly", label: "Yearly" },
              { value: "quarterly", label: "Quarterly" },
              { value: "monthly", label: "Monthly" },
            ]}
          />
        </div>
      </div>
      {each !== null && (
        <p className="-mt-2 text-xs text-white/50">
          That&apos;s <span className="font-mono tabular-nums text-white">{formatMoney(each, currency)}</span>{" "}
          {EVERY[form.resaleFrequency]}.
        </p>
      )}
    </div>
  );
}
