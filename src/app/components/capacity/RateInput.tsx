"use client";

import {
  dailyRate,
  effectiveFromNominal,
  monthlyRate,
  nominalFromEffective,
  type CompoundingFrequency,
} from "@/lib/capacity";
import {
  COMPOUNDING_LABELS,
  parseNumber,
  type CapacityForm,
  type CompoundingOption,
  type RateEntryMode,
} from "@/app/lib/capacityForm";
import { formatPct } from "@/app/lib/format";
import { Field, NumberInput, Segmented, Select } from "../ui";

const COMPOUNDING_OPTIONS = (Object.keys(COMPOUNDING_LABELS) as CompoundingOption[]).map((v) => ({
  value: v,
  label: `${COMPOUNDING_LABELS[v]} (${v})`,
}));

/**
 * The fund's return, entered EITHER as an effective annual yield OR as a
 * nominal rate plus compounding — whichever the fund's fact sheet quotes. The
 * other form is derived live, and switching the toggle carries the current
 * value across so the rate never jumps.
 */
export default function RateInput({
  form,
  update,
}: {
  form: CapacityForm;
  update: (patch: Partial<CapacityForm>) => void;
}) {
  const n = Number(form.compounding) as CompoundingFrequency;
  const effectivePct = parseNumber(form.effectiveRatePct);
  const nominalPct = parseNumber(form.nominalRatePct);

  // The effective rate is what everything downstream uses.
  const effective =
    form.rateMode === "effective"
      ? effectivePct === null
        ? null
        : effectivePct / 100
      : nominalPct === null
        ? null
        : effectiveFromNominal(nominalPct / 100, n);

  const switchMode = (mode: RateEntryMode) => {
    if (mode === form.rateMode || effective === null) {
      update({ rateMode: mode });
      return;
    }
    // Carry the value across so the number does not jump.
    update(
      mode === "nominal"
        ? { rateMode: mode, nominalRatePct: pct(nominalFromEffective(effective, n)) }
        : { rateMode: mode, effectiveRatePct: pct(effective) },
    );
  };

  const changeCompounding = (compounding: CompoundingOption) => {
    // In effective mode the compounding only affects the DERIVED nominal, so
    // nothing else moves. In nominal mode the typed number now means a
    // different growth — keep the effective rate the user had and restate the
    // nominal for the new frequency, which is what they would expect to see.
    if (form.rateMode === "nominal" && effective !== null) {
      const newN = Number(compounding) as CompoundingFrequency;
      update({ compounding, nominalRatePct: pct(nominalFromEffective(effective, newN)) });
    } else {
      update({ compounding });
    }
  };

  return (
    <div className="space-y-3">
      <Segmented<RateEntryMode>
        ariaLabel="How the return rate is entered"
        value={form.rateMode}
        onChange={switchMode}
        options={[
          { value: "effective", label: "Effective annual yield" },
          { value: "nominal", label: "Nominal rate + compounding" },
        ]}
      />

      {form.rateMode === "effective" ? (
        <Field label="Effective annual yield" hint="What 100 grows to in a year, e.g. 20.33 for 120.33.">
          <NumberInput
            value={form.effectiveRatePct}
            onChange={(v) => update({ effectiveRatePct: v })}
            suffix="%"
            placeholder="20.33"
          />
        </Field>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nominal annual rate">
            <NumberInput
              value={form.nominalRatePct}
              onChange={(v) => update({ nominalRatePct: v })}
              suffix="%"
              placeholder="18.51"
            />
          </Field>
          <Field label="Compounded">
            <Select<CompoundingOption>
              value={form.compounding}
              onChange={changeCompounding}
              options={COMPOUNDING_OPTIONS}
              ariaLabel="Compounding frequency"
            />
          </Field>
        </div>
      )}

      {/* The other form, plus the two period rates the reader will meet on a
          statement — derived, never typed, so they cannot disagree. */}
      <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3 text-xs">
        {effective === null ? (
          <span className="text-white/40">Enter a rate to see its other forms.</span>
        ) : form.rateMode === "effective" ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-white/50">Equivalent nominal rate, compounded</span>
              <Select<CompoundingOption>
                compact
                value={form.compounding}
                onChange={changeCompounding}
                options={COMPOUNDING_OPTIONS}
                ariaLabel="Compounding frequency for the equivalent nominal rate"
              />
              <span className="ml-auto font-mono text-white">
                {formatPct(nominalFromEffective(effective, n))}
              </span>
            </div>
            <PeriodRates effective={effective} />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-white/50">Equivalent effective annual yield</span>
              <span className="font-mono text-white">{formatPct(effective)}</span>
            </div>
            <PeriodRates effective={effective} />
          </div>
        )}
      </div>
    </div>
  );
}

function PeriodRates({ effective }: { effective: number }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/5 pt-2 text-white/50">
      <span>
        Monthly <span className="font-mono text-white/80">{formatPct(monthlyRate(effective), 3)}</span>
      </span>
      <span>
        Daily <span className="font-mono text-white/80">{formatPct(dailyRate(effective), 4)}</span>
      </span>
    </div>
  );
}

/** Fraction → percent string with the noise trimmed: 0.185124… → "18.5124". */
function pct(fraction: number): string {
  return Number((fraction * 100).toFixed(4)).toString();
}
