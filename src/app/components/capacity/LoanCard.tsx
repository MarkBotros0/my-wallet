"use client";

import { useState } from "react";
import { decliningRateFromFlat, type LoanSummary, type PledgeRelease } from "@/lib/capacity";
import type { CapacityForm } from "@/app/lib/capacityForm";
import { formatMoney, formatPct } from "@/app/lib/format";
import { parseNumber } from "@/app/lib/numbers";
import { CheckRow, Segmented } from "../ui";
import Explain from "./Explain";
import { CalcField, useFormErrors } from "./formErrors";

/**
 * Paying with a bank loan against certificates — closed until asked for.
 * Fields come in the order a person decides: how much to borrow, what the
 * bank charges, what the certificates pay; the rarely-changed bank terms sit
 * behind a one-line sentence. Under each field, the offer read back in money
 * AT THE PRICE THE RESULTS SHOW (the form has no price — it is solved for),
 * which is what makes a flat rate stop being confusing.
 */
export default function LoanCard({
  form,
  update,
  loan,
  atPrice,
  currency,
}: {
  form: CapacityForm;
  update: (patch: Partial<CapacityForm>) => void;
  /** The loan at the shown price; null before there is a result. */
  loan: LoanSummary | null;
  atPrice: "max" | "test";
  currency: string;
}) {
  const { errorFor } = useFormErrors();
  const [termsOpen, setTermsOpen] = useState(false);
  const money = (n: number) => formatMoney(n, currency);
  const at = atPrice === "max" ? "at the maximum" : "at the price you're checking";

  const flat = parseNumber(form.loanFlatRatePct);
  const years = parseNumber(form.loanYears);
  const cert = parseNumber(form.certificateRatePct);
  const declining =
    flat !== null && years !== null && years >= 1 && flat >= 0 ? decliningRateFromFlat(flat / 100, years) : null;
  const yearsText = years === 1 ? "1 year" : `${form.loanYears} years`;
  const ratio = form.lendingRatioPct.trim() || "—";
  const releaseText = form.pledgeRelease === "at-end" ? "when the loan is paid off" : "bit by bit as you repay";
  const termsForcedOpen = errorFor("lendingRatioPct") !== undefined;

  return (
    <div className="space-y-4">
      <CheckRow
        checked={form.loanEnabled}
        onChange={(loanEnabled) => update({ loanEnabled })}
        label="Pay with a bank loan"
        hint="Borrow against your certificates and pay the bank monthly instead."
      />

      {form.loanEnabled && (
        <div className="space-y-4">
          {!form.loanRatesEdited && (
            <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/60">
              The rates below are <span className="font-semibold text-white">examples</span> — enter your bank&apos;s offer.
            </p>
          )}

          <CalcField
            field="loanSharePct"
            label="Borrow"
            hint={loan ? `= ${money(loan.amount)} ${at}.` : "Of what you pay up front; the rest comes from savings."}
            value={form.loanSharePct}
            onChange={(v) => update({ loanSharePct: v })}
            suffix="% of the up-front payment"
            placeholder="100"
          />

          <div>
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <CalcField
                field="loanFlatRatePct"
                label="Flat rate"
                value={form.loanFlatRatePct}
                onChange={(v) => update({ loanFlatRatePct: v, loanRatesEdited: true })}
                suffix="% a year"
                placeholder="12"
              />
              <CalcField
                field="loanYears"
                label="Years"
                value={form.loanYears}
                onChange={(v) => update({ loanYears: v })}
                placeholder="5"
              />
            </div>
            <p className="mt-1.5 text-xs leading-snug text-white/60" aria-live="polite">
              {loan ? (
                <>
                  <span className="font-mono font-semibold tabular-nums text-loss">{money(loan.monthlyInstallment)} / month</span>{" "}
                  for {yearsText} · {money(loan.totalInterest)} interest in total
                  {declining !== null && <> · ≈ {formatPct(declining, 1)} on a declining balance</>} ({at})
                </>
              ) : declining !== null ? (
                <>≈ {formatPct(declining, 1)} on a declining balance</>
              ) : null}
            </p>
            <Explain term="What's a flat rate?">
              Interest on the full loan for every year, even as you repay it — so 12% flat over 5 years costs about what
              20% does on a normal loan. The line above shows the normal-loan rate for your numbers.
            </Explain>
          </div>

          <div>
            <CalcField
              field="certificateRatePct"
              label="Certificate rate"
              hint={
                loan && cert !== null
                  ? `Your ${money(loan.pledge)} in certificates pays you ${money((loan.pledge * cert) / 100 / 12)} / month while it is pledged (${at}).`
                  : "What your certificates pay a year, after tax."
              }
              value={form.certificateRatePct}
              onChange={(v) => update({ certificateRatePct: v, loanRatesEdited: true })}
              suffix="% a year"
              placeholder="11"
            />
            <Explain term="What's a pledge?">
              Savings you put in certificates at the bank as security for the loan. They keep paying you interest, but
              you cannot spend them until the bank releases them — so the safety buffer does not count them.
            </Explain>
          </div>

          <details
            open={termsOpen || termsForcedOpen}
            onToggle={(e) => setTermsOpen(e.currentTarget.open)}
            className="rounded-lg border border-white/10 bg-white/[0.03]"
          >
            <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-xs text-white/60 [&::-webkit-details-marker]:hidden">
              <span>
                Bank lends <span className="text-white">{ratio}%</span> of the certificates · releases them{" "}
                <span className="text-white">{releaseText}</span>
              </span>
              <span className="shrink-0 font-medium text-accent">Change</span>
            </summary>
            <div className="space-y-4 border-t border-white/10 px-3 py-3">
              <CalcField
                field="lendingRatioPct"
                label="Bank lends"
                hint="Most banks lend 90–100%. Your pledge is the loan divided by this."
                value={form.lendingRatioPct}
                onChange={(v) => update({ lendingRatioPct: v })}
                suffix="% of the certificates"
                placeholder="100"
              />
              <div>
                <span className="mb-1.5 block text-xs font-medium text-white/60">Certificates come back</span>
                <Segmented<PledgeRelease>
                  ariaLabel="When the bank releases the certificates"
                  value={form.pledgeRelease}
                  onChange={(pledgeRelease) => update({ pledgeRelease })}
                  options={[
                    { value: "at-end", label: "When the loan ends" },
                    { value: "gradual", label: "As I repay" },
                  ]}
                />
              </div>
              <Explain term="What's the lending ratio?">
                How much the bank lends for each pound of certificates. At 100% a 9M loan needs 9M pledged; at 90% it
                needs 10M.
              </Explain>
              <Explain term="What does release mean?">
                When the bank hands your certificates back so you can spend them again — all at once when the loan is
                paid off, or a part every month as what you owe goes down.
              </Explain>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}
