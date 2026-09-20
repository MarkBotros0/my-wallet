"use client";

import { useMemo, useState } from "react";
import {
  maxFeasiblePrice,
  sensitivity,
  simulate,
  type IncomeFrequency,
  type SimulationResult,
} from "@/lib/capacity";
import { parseForm, type CapacityForm, type FormError, type FormField } from "@/app/lib/capacityForm";
import { useCapacityForm } from "@/app/lib/capacityFormStore";
import { formatMoney, formatPct } from "@/app/lib/format";
import BalanceChart from "./BalanceChart";
import { CalcField, FormErrorsProvider, fieldId, focusField, useFormErrors, useVisibleErrors } from "./formErrors";
import LiveResult from "./LiveResult";
import RateInput from "./RateInput";
import ScheduleEditor from "./ScheduleEditor";
import SensitivityTable from "./SensitivityTable";
import YearTable from "./YearTable";
import { Card, Field, FieldError, Segmented, Stat, useFieldState } from "../ui";

/**
 * Installment buying capacity — the page.
 *
 * Inputs on the left (stacked above on a phone), results on the right. The
 * engine is pure and fast (a plan is at most 180 months; the solver probes a
 * few hundred prices), so everything recomputes live as the user types.
 *
 * When the form does not parse, every problem is shown under its own field
 * and listed above the results — each item jumps to the field — while the
 * last result that DID compute stays on screen, dimmed, so clearing a field
 * to retype it does not blank the page. On a phone a sticky strip under the
 * nav carries the answer (or the error count) down the form.
 */
export default function CapacityCalculator() {
  const [form, update, reset] = useCapacityForm();
  const [detailsFor, setDetailsFor] = useState<"max" | "test">("max");

  const parsed = useMemo(() => parseForm(form), [form]);
  const { inputs, errors, byField, testPrice } = parsed;
  const visible = useVisibleErrors(byField);

  // The last inputs that parsed. Adjusted during render (React's "previous
  // render" pattern) rather than in an effect, so there is no setState-in-
  // effect and no frame where the results flash empty.
  const [lastInputs, setLastInputs] = useState(inputs);
  if (inputs !== null && inputs !== lastInputs) setLastInputs(inputs);
  const shown = inputs ?? lastInputs;
  const stale = inputs === null;

  const capacity = useMemo(() => (shown ? maxFeasiblePrice(shown) : null), [shown]);
  const rows = useMemo(() => (shown ? sensitivity(shown) : null), [shown]);
  const tested = useMemo(
    () => (shown && testPrice !== null ? simulate(shown, testPrice) : null),
    [shown, testPrice],
  );

  const currency = form.currency.trim().toUpperCase() || "EGP";
  const money = (n: number) => formatMoney(n, currency);

  // Which scenario the chart and table describe: the maximum by default, the
  // tested price when the user asks. Derived, so removing the test price
  // falls back to the maximum without a stale toggle.
  const showing: SimulationResult | null =
    detailsFor === "test" && tested ? tested : (capacity?.simulation ?? null);

  const resetAll = () => {
    if (!confirm("Reset every input to the defaults? What you typed here will be lost.")) return;
    reset();
    visible.reset();
  };

  return (
    <FormErrorsProvider value={visible}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Real Estate</h1>
            <p className="mt-1 text-sm text-white/50">
              Installment buying capacity — the most expensive property your fund can carry.
            </p>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="min-h-[44px] shrink-0 cursor-pointer rounded-lg border border-white/10 px-3 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white active:bg-white/10"
          >
            Reset
          </button>
        </div>

        <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
          {/* ------------------------------------------------------------ inputs */}
          <div className="space-y-4">
            <LiveResult maxPrice={capacity ? capacity.maxPrice : undefined} currency={currency} errors={errors} />

            <Card title="Capital & returns">
              <div className="space-y-4">
                <CapitalRow form={form} update={update} />
                <RateInput form={form} update={update} />
                <CalcField
                  field="returnFeePct"
                  label="Fees or taxes on returns"
                  hint="Deducted from every period's return. 0 if none."
                  value={form.returnFeePct}
                  onChange={(v) => update({ returnFeePct: v })}
                  suffix="%"
                  placeholder="0"
                />
              </div>
            </Card>

            {/* The two floors on the fund — one during the plan, one at its
                end — right under the capital they are measured against. */}
            <Card title="What must stay in the fund">
              <div className="space-y-4">
                <CalcField
                  field="safetyBuffer"
                  label="Safety buffer"
                  hint="The fund must never drop below this during the plan. 0 for none."
                  group
                  value={form.safetyBuffer}
                  onChange={(v) => update({ safetyBuffer: v })}
                  suffix={currency}
                  placeholder="0"
                />
                <CalcField
                  field="keepPct"
                  label="Savings to keep at the end"
                  hint="Of your starting capital, how much must still be in the fund after the last installment — 30 means keep 30% of it. 0 means it can all go into the property."
                  value={form.keepPct}
                  onChange={(v) => update({ keepPct: v })}
                  suffix="% of capital"
                  placeholder="0"
                />
              </div>
            </Card>

            <Card title="Payment plan">
              <ScheduleEditor form={form} update={update} />
            </Card>

            <Card title="Extra income">
              <div className="space-y-4">
                <div>
                  <span className="mb-1.5 block text-xs font-medium text-white/60">How often</span>
                  <Segmented<IncomeFrequency>
                    ariaLabel="Income frequency"
                    value={form.incomeFrequency}
                    onChange={(incomeFrequency) => update({ incomeFrequency })}
                    options={[
                      { value: "monthly", label: "Monthly" },
                      { value: "yearly", label: "Yearly" },
                    ]}
                  />
                </div>
                <CalcField
                  field="incomeAmount"
                  label="Amount"
                  hint={
                    form.incomeFrequency === "monthly"
                      ? "Salary or other income you can put towards installments, added every month."
                      : "Income you can put towards installments, added at the end of each year."
                  }
                  group
                  value={form.incomeAmount}
                  onChange={(v) => update({ incomeAmount: v })}
                  suffix={`${currency} / ${form.incomeFrequency === "monthly" ? "month" : "year"}`}
                  placeholder="0"
                />
                <CalcField
                  field="incomeIncreasePct"
                  label="Annual increase"
                  hint="How much the amount grows each year. 0–100%."
                  value={form.incomeIncreasePct}
                  onChange={(v) => update({ incomeIncreasePct: v })}
                  suffix="% a year"
                  placeholder="0"
                />
              </div>
            </Card>

            <Card title="Extra costs">
              <div className="space-y-4">
                <CostRow
                  label="Maintenance deposit"
                  pctField="maintenancePct"
                  yearField="maintenanceYear"
                  pct={form.maintenancePct}
                  year={form.maintenanceYear}
                  onPct={(v) => update({ maintenancePct: v })}
                  onYear={(v) => update({ maintenanceYear: v })}
                />
                <CostRow
                  label="Finishing cost"
                  pctField="finishingPct"
                  yearField="finishingYear"
                  pct={form.finishingPct}
                  year={form.finishingYear}
                  onPct={(v) => update({ finishingPct: v })}
                  onYear={(v) => update({ finishingYear: v })}
                />
                <p className="-mt-2 text-[11px] leading-snug text-white/40">
                  Both are a percentage of the price, charged at the end of the year they are due.
                </p>
              </div>
            </Card>
          </div>

          {/* ----------------------------------------------------------- results */}
          <div
            id="results"
            className="mt-6 space-y-4 lg:mt-0"
            style={{ scrollMarginTop: "calc(var(--top-nav-clearance) + 12px)" }}
          >
            {errors.length > 0 && <ErrorSummary errors={errors} hasResult={shown !== null} />}

            {shown && (
              <div className={`space-y-4 transition-opacity ${stale ? "opacity-50" : ""}`} aria-busy={stale}>
                {capacity && capacity.maxPrice === null ? (
                  <Card>
                    <h2 className="text-lg font-bold text-white">Nothing is affordable with these numbers</h2>
                    <p className="mt-2 text-sm leading-relaxed text-white/60">
                      {shown.startingCapital < shown.safetyBuffer
                        ? `Your starting capital (${money(shown.startingCapital)}) is already below the safety buffer (${money(
                            shown.safetyBuffer,
                          )}), so no property — not even a free one — keeps the fund above it.`
                        : "Even a very small price pushes the fund below the buffer or the keep target somewhere in the plan."}{" "}
                      Try a lower buffer or keep target, a longer plan, a smaller down payment, or more income.
                    </p>
                  </Card>
                ) : (
                  capacity?.simulation && (
                    <Hero
                      sim={capacity.simulation}
                      capital={shown.startingCapital}
                      buffer={shown.safetyBuffer}
                      currency={currency}
                    />
                  )
                )}

                <Card title="Test a specific price">
                  <CalcField
                    field="testPrice"
                    label="Price to test"
                    hint="Leave blank to only see the maximum."
                    group
                    value={form.testPrice}
                    onChange={(v) => update({ testPrice: v })}
                    suffix={currency}
                    placeholder="e.g. 7,500,000"
                  />
                  {tested && (
                    <div className="mt-3">
                      <Segmented<"max" | "test">
                        ariaLabel="Which price the chart and table show"
                        value={detailsFor === "test" ? "test" : "max"}
                        onChange={setDetailsFor}
                        options={[
                          { value: "max", label: "Show maximum" },
                          { value: "test", label: "Show tested" },
                        ]}
                      />
                    </div>
                  )}
                  {tested && (
                    <Verdict sim={tested} capital={shown.startingCapital} buffer={shown.safetyBuffer} currency={currency} />
                  )}
                </Card>

                {showing && (
                  <>
                    <Card
                      title={`Fund balance over the plan${showing === tested ? ` — testing ${money(showing.price)}` : ""}`}
                    >
                      <BalanceChart points={showing.monthly} buffer={shown.safetyBuffer} currency={currency} />
                    </Card>

                    <Card title={`Year by year${showing === tested ? ` — testing ${money(showing.price)}` : ""}`}>
                      <YearTable years={showing.years} buffer={shown.safetyBuffer} currency={currency} />
                    </Card>
                  </>
                )}

                {rows && capacity?.maxPrice !== null && (
                  <Card title="If the fund's return changes">
                    <SensitivityTable rows={rows} currency={currency} />
                  </Card>
                )}

                <p className="px-1 text-xs text-white/40">
                  Estimates assume a constant return rate. Fund returns vary and are not guaranteed.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </FormErrorsProvider>
  );
}

/**
 * Every problem that stops the calculator, in page order, each a tap away
 * from its field. On a phone this sits under the form, so the jump matters;
 * on desktop it is the first thing in the results column.
 */
function ErrorSummary({ errors, hasResult }: { errors: FormError[]; hasResult: boolean }) {
  return (
    <Card className="border-loss/30">
      <h2 className="text-sm font-semibold text-white">
        {errors.length === 1 ? "One input needs fixing" : `${errors.length} inputs need fixing`}
      </h2>
      <p className="mt-0.5 text-xs text-white/50">
        {hasResult ? "Below is the last result that worked, until these are fixed." : "There is no result until these are fixed."}
      </p>
      <ul className="mt-2 divide-y divide-white/5">
        {errors.map((e, i) => (
          <li key={`${e.field}-${i}`}>
            <button
              type="button"
              onClick={() => focusField(e.field)}
              className="flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-md px-1 text-left text-sm transition-colors hover:bg-white/[0.03] active:bg-white/5"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-loss" aria-hidden />
              <span className="flex-1 text-white/80">{e.message}</span>
              <span className="shrink-0 text-[11px] font-medium text-accent">Go to field</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The headline: the maximum price, big, with the figures that make it up. */
function Hero({
  sim,
  capital,
  buffer,
  currency,
}: {
  sim: SimulationResult;
  capital: number;
  buffer: number;
  currency: string;
}) {
  const money = (n: number) => formatMoney(n, currency);
  return (
    <Card>
      <div className="text-xs font-medium text-white/50">Maximum buying capacity</div>
      {/* The hero figure: same sans as everything else, proportional digits. */}
      <div className="mt-1 text-4xl font-bold leading-none tracking-tight text-white md:text-5xl">
        {formatMoney(sim.price, "")}
        <span className="ml-2 text-base font-medium text-white/40">{currency}</span>
      </div>
      <p className="mt-2 text-xs leading-snug text-white/40">
        The most expensive property this plan carries without the fund dropping below {money(buffer)}.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Down payment" value={money(sim.downPayment)} />
        <Stat label="Total installments" value={money(sim.totalInstallments)} />
        <Stat label="Extra costs" value={money(sim.totalExtraCosts)} />
        <Stat label="Final balance" value={money(sim.finalBalance)} sub={`end of year ${sim.years.length}`} />
      </div>

      {/* Where the money ended up: into the property vs still in the fund. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat
          label="Paid into the property"
          value={money(sim.paidIntoProperty)}
          sub={`${formatPct(sim.paidIntoProperty / capital, 0)} of your starting capital`}
        />
        <Stat
          label="Kept in the fund"
          value={money(sim.keptInFund)}
          sub={`${formatPct(sim.keptShareOfCapital, 0)} of your starting capital`}
        />
      </div>
    </Card>
  );
}

/** Affordable / not affordable for the tested price, with the reason and the numbers. */
function Verdict({
  sim,
  capital,
  buffer,
  currency,
}: {
  sim: SimulationResult;
  capital: number;
  buffer: number;
  currency: string;
}) {
  const money = (n: number) => formatMoney(n, currency);

  if (sim.feasible) {
    return (
      <div role="status" className="mt-3 flex gap-2.5 rounded-lg border border-gain/30 bg-gain/10 px-3 py-2.5 text-sm">
        <VerdictIcon ok />
        <div className="min-w-0">
          <div className="font-semibold text-gain">Affordable</div>
          <p className="mt-0.5 text-xs leading-snug text-white/70">
            {money(sim.price)} keeps the fund above the buffer all the way. Lowest balance {money(sim.minBalance)};
            ends with {money(sim.finalBalance)} ({formatPct(sim.keptShareOfCapital, 0)} of your capital kept).
          </p>
        </div>
      </div>
    );
  }

  const breach = sim.firstBreach;
  return (
    <div role="status" className="mt-3 flex gap-2.5 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm">
      <VerdictIcon ok={false} />
      <div className="min-w-0">
        <div className="font-semibold text-loss">Not affordable</div>
        <p className="mt-0.5 text-xs leading-snug text-white/70">
          {breach
            ? breach.month === 0
              ? `The down payment alone (${money(sim.downPayment)}) leaves the fund ${money(breach.shortfall)} short of the buffer.`
              : `Money runs out in month ${breach.month} (year ${Math.ceil(breach.month / 12)}): the balance falls ${money(
                  breach.shortfall,
                )} short of the ${money(buffer)} buffer.`
            : sim.endShortfall
              ? `The buffer holds, but the plan ends with ${money(sim.finalBalance)} — ${money(
                  sim.endShortfall.shortfall,
                )} short of the ${money(sim.endShortfall.target)} (${formatPct(sim.endShortfall.target / capital, 0)}) you want to keep.`
              : "The plan does not hold."}
        </p>
      </div>
    </div>
  );
}

/** A tick or a cross in the verdict's colour — the outcome is real money in or out of reach, so it earns it. */
function VerdictIcon({ ok }: { ok: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`mt-0.5 h-5 w-5 shrink-0 ${ok ? "text-gain" : "text-loss"}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="10" cy="10" r="8" />
      {ok ? <path d="m6.5 10.5 2.25 2.25L13.5 8" /> : <path d="m7.5 7.5 5 5m0-5-5 5" />}
    </svg>
  );
}

/**
 * Starting capital with its currency code beside it. The code's column is
 * narrow, so like a cost row the pair shares one error line underneath —
 * the capital's problem first, since it is the one that stops the result.
 */
function CapitalRow({ form, update }: { form: CapacityForm; update: (patch: Partial<CapacityForm>) => void }) {
  const { errorFor, bind } = useFormErrors();
  const error = errorFor("startingCapital") ?? errorFor("currency");
  const errorId = `${fieldId("startingCapital")}-row-error`;
  return (
    <div>
      <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
        <CalcField
          field="startingCapital"
          label="Starting capital"
          hint="Your savings in the fund today."
          errorId={errorId}
          group
          value={form.startingCapital}
          onChange={(v) => update({ startingCapital: v })}
          placeholder="5,000,000"
        />
        <Field label="Currency" error={errorFor("currency")} errorId={errorId}>
          <CurrencyInput value={form.currency} onChange={(currency) => update({ currency })} {...bind("currency")} />
        </Field>
      </div>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}

/**
 * The three-letter code next to the capital. A raw input rather than a
 * NumberInput, so it reads the Field's error state itself.
 */
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
      id={fieldId("currency")}
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

/**
 * A cost's share and its due year side by side. Two narrow fields, so the
 * error line is rendered once beneath the pair with room to read, and each
 * field only turns red and points at it.
 */
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
  pctField: FormField;
  yearField: FormField;
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
          label="Due in year"
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
