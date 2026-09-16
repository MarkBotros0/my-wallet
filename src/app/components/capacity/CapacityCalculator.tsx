"use client";

import { useMemo, useState } from "react";
import {
  maxFeasiblePrice,
  sensitivity,
  simulate,
  type IncomeFrequency,
  type SimulationResult,
} from "@/lib/capacity";
import { parseForm } from "@/app/lib/capacityForm";
import { useCapacityForm } from "@/app/lib/capacityFormStore";
import { formatMoney, formatPct } from "@/app/lib/format";
import BalanceChart from "./BalanceChart";
import RateInput from "./RateInput";
import ScheduleEditor from "./ScheduleEditor";
import SensitivityTable from "./SensitivityTable";
import YearTable from "./YearTable";
import { Card, Field, NumberInput, Segmented, Stat, inputClass } from "./ui";

/**
 * Installment buying capacity — the page.
 *
 * Inputs on the left (stacked above on a phone), results on the right. The
 * engine is pure and fast (a plan is at most 180 months; the solver probes a
 * few hundred prices), so everything recomputes live as the user types; when
 * the form does not parse, the results column shows what to fix instead.
 */
export default function CapacityCalculator() {
  const [form, update, reset] = useCapacityForm();
  const [detailsFor, setDetailsFor] = useState<"max" | "test">("max");

  const parsed = useMemo(() => parseForm(form), [form]);
  const { inputs, errors, testPrice, testPriceError } = parsed;

  const capacity = useMemo(() => (inputs ? maxFeasiblePrice(inputs) : null), [inputs]);
  const rows = useMemo(() => (inputs ? sensitivity(inputs) : null), [inputs]);
  const tested = useMemo(
    () => (inputs && testPrice !== null ? simulate(inputs, testPrice) : null),
    [inputs, testPrice],
  );

  const currency = form.currency.trim().toUpperCase() || "EGP";
  const money = (n: number) => formatMoney(n, currency);

  // Which scenario the chart and table describe: the maximum by default, the
  // tested price when the user asks. Derived, so removing the test price
  // falls back to the maximum without a stale toggle.
  const showing: SimulationResult | null =
    detailsFor === "test" && tested ? tested : (capacity?.simulation ?? null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Real Estate</h1>
          <p className="mt-1 text-sm text-white/50">
            Installment buying capacity — the most expensive property your fund can carry.
          </p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="min-h-[36px] shrink-0 rounded-md border border-white/10 px-2.5 text-xs text-white/60 transition-colors hover:bg-white/5 hover:text-white"
        >
          Reset inputs
        </button>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* ------------------------------------------------------------ inputs */}
        <div className="space-y-4">
          <Card title="Capital & returns">
            <div className="space-y-4">
              <div className="grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
                <Field label="Starting capital" hint="Your savings in the fund today.">
                  <NumberInput
                    value={form.startingCapital}
                    onChange={(v) => update({ startingCapital: v })}
                    placeholder="5,000,000"
                  />
                </Field>
                <Field label="Currency">
                  <input
                    type="text"
                    maxLength={3}
                    autoCapitalize="characters"
                    value={form.currency}
                    onChange={(e) => update({ currency: e.target.value.toUpperCase() })}
                    className={`${inputClass} font-mono uppercase`}
                    aria-label="Currency code"
                  />
                </Field>
              </div>
              <RateInput form={form} update={update} />
              <Field label="Fees or taxes on returns" hint="Deducted from every period's return. 0 if none.">
                <NumberInput
                  value={form.returnFeePct}
                  onChange={(v) => update({ returnFeePct: v })}
                  suffix="%"
                  placeholder="0"
                />
              </Field>
            </div>
          </Card>

          <Card title="Payment plan">
            <ScheduleEditor form={form} update={update} />
          </Card>

          <Card title="Extra income">
            <div className="space-y-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                <Field label="Amount" hint="Salary or other income you can put towards installments.">
                  <NumberInput
                    value={form.incomeAmount}
                    onChange={(v) => update({ incomeAmount: v })}
                    placeholder="0"
                  />
                </Field>
                <div className="pb-5">
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
              </div>
              <Field label="Annual increase" hint="Yearly income lands at the end of each year.">
                <NumberInput
                  value={form.incomeIncreasePct}
                  onChange={(v) => update({ incomeIncreasePct: v })}
                  suffix="%"
                  placeholder="0"
                />
              </Field>
            </div>
          </Card>

          <Card title="Extra costs & safety">
            <div className="space-y-4">
              <CostRow
                label="Maintenance deposit"
                pct={form.maintenancePct}
                year={form.maintenanceYear}
                onPct={(v) => update({ maintenancePct: v })}
                onYear={(v) => update({ maintenanceYear: v })}
              />
              <CostRow
                label="Finishing cost"
                pct={form.finishingPct}
                year={form.finishingYear}
                onPct={(v) => update({ finishingPct: v })}
                onYear={(v) => update({ finishingYear: v })}
              />
              <p className="-mt-2 text-[11px] text-white/40">
                Both are a percentage of the price, charged at the end of the year they are due.
              </p>
              <Field label="Safety buffer" hint="The fund must never drop below this. 0 for none.">
                <NumberInput
                  value={form.safetyBuffer}
                  onChange={(v) => update({ safetyBuffer: v })}
                  placeholder="0"
                />
              </Field>
              <Field
                label="Keep at the end of the plan"
                hint="Share of your starting capital that must still be in the fund once the last installment is paid. 0 for no requirement."
              >
                <NumberInput
                  value={form.keepPct}
                  onChange={(v) => update({ keepPct: v })}
                  suffix="% of capital"
                  placeholder="0"
                />
              </Field>
            </div>
          </Card>
        </div>

        {/* ----------------------------------------------------------- results */}
        <div className="mt-6 space-y-4 lg:mt-0">
          {!inputs ? (
            <Card title="Fix these to see a result">
              <ul className="space-y-1.5 text-sm text-loss">
                {errors.map((e) => (
                  <li key={e} className="flex gap-2">
                    <span aria-hidden>•</span>
                    <span>{e}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : capacity && capacity.maxPrice === null ? (
            <Card>
              <h2 className="text-lg font-bold text-white">Nothing is affordable with these numbers</h2>
              <p className="mt-2 text-sm text-white/60">
                {inputs.startingCapital < inputs.safetyBuffer
                  ? `Your starting capital (${money(inputs.startingCapital)}) is already below the safety buffer (${money(
                      inputs.safetyBuffer,
                    )}), so no property — not even a free one — keeps the fund above it.`
                  : "Even a very small price pushes the fund below the buffer or the keep target somewhere in the plan."}{" "}
                Try a lower buffer or keep target, a longer plan, a smaller down payment, or more income.
              </p>
            </Card>
          ) : (
            capacity?.simulation && (
              <Hero
                sim={capacity.simulation}
                capital={inputs.startingCapital}
                buffer={inputs.safetyBuffer}
                currency={currency}
              />
            )
          )}

          {inputs && (
            <Card title="Test a specific price">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <Field label="Price to test" hint={testPriceError ?? "Leave blank to only see the maximum."}>
                  <NumberInput
                    value={form.testPrice}
                    onChange={(v) => update({ testPrice: v })}
                    placeholder="e.g. 7,500,000"
                  />
                </Field>
                {tested && (
                  <div className="pb-5">
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
              </div>
              {tested && <Verdict sim={tested} capital={inputs.startingCapital} buffer={inputs.safetyBuffer} currency={currency} />}
            </Card>
          )}

          {inputs && showing && (
            <>
              <Card
                title={`Fund balance over the plan${showing === tested ? ` — testing ${money(showing.price)}` : ""}`}
              >
                <BalanceChart points={showing.monthly} buffer={inputs.safetyBuffer} currency={currency} />
              </Card>

              <Card title={`Year by year${showing === tested ? ` — testing ${money(showing.price)}` : ""}`}>
                <YearTable years={showing.years} buffer={inputs.safetyBuffer} currency={currency} />
              </Card>
            </>
          )}

          {inputs && rows && capacity?.maxPrice !== null && (
            <Card title="If the fund's return changes">
              <SensitivityTable rows={rows} currency={currency} />
            </Card>
          )}

          {inputs && (
            <p className="px-1 text-xs text-white/40">
              Estimates assume a constant return rate. Fund returns vary and are not guaranteed.
            </p>
          )}
        </div>
      </div>
    </div>
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
      <div className="mt-1 text-4xl font-bold leading-none text-white md:text-5xl">
        {formatMoney(sim.price, "")}
        <span className="ml-2 text-base font-medium text-white/40">{currency}</span>
      </div>
      <p className="mt-2 text-xs text-white/40">
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
      <div className="mt-3 rounded-lg border border-gain/30 bg-gain/10 px-3 py-2.5 text-sm">
        <div className="font-semibold text-gain">✓ Affordable</div>
        <p className="mt-0.5 text-xs text-white/70">
          {money(sim.price)} keeps the fund above the buffer all the way. Lowest balance {money(sim.minBalance)}; ends
          with {money(sim.finalBalance)} ({formatPct(sim.keptShareOfCapital, 0)} of your capital kept).
        </p>
      </div>
    );
  }

  const breach = sim.firstBreach;
  return (
    <div className="mt-3 rounded-lg border border-loss/30 bg-loss/10 px-3 py-2.5 text-sm">
      <div className="font-semibold text-loss">✕ Not affordable</div>
      <p className="mt-0.5 text-xs text-white/70">
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
  );
}

function CostRow({
  label,
  pct,
  year,
  onPct,
  onYear,
}: {
  label: string;
  pct: string;
  year: string;
  onPct: (v: string) => void;
  onYear: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
      <Field label={label}>
        <NumberInput value={pct} onChange={onPct} suffix="% of price" placeholder="0" ariaLabel={`${label} percent`} />
      </Field>
      <Field label="Due in year">
        <NumberInput value={year} onChange={onYear} placeholder="1" ariaLabel={`${label} year due`} />
      </Field>
    </div>
  );
}
