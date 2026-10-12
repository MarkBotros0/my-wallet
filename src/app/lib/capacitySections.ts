import type { CapacityForm, FormField } from "./capacityForm";

/**
 * The calculator's inputs as five folding sections — so the page is never one
 * long scroll — with the one-line summary a closed section shows, and which
 * section each field lives in (so "go to field" can open it first). Pure, so
 * the summaries are tested like the rest of the form.
 */

export type SectionId = "buy" | "money" | "payments" | "loan" | "extras";

export const SECTIONS: readonly { id: SectionId; title: string }[] = [
  { id: "buy", title: "How you buy" },
  { id: "money", title: "Your money" },
  { id: "payments", title: "Payments" },
  { id: "loan", title: "Bank loan" },
  { id: "extras", title: "Income & costs" },
];

const FIELD_SECTION: Partial<Record<FormField, SectionId>> = {
  cashDiscountPct: "buy",
  startingCapital: "money",
  currency: "money",
  effectiveRatePct: "money",
  nominalRatePct: "money",
  returnFeePct: "money",
  safetyBuffer: "money",
  keepPct: "money",
  planYears: "payments",
  downPaymentPct: "payments",
  yearPcts: "payments",
  resaleRemaining: "payments",
  resaleYears: "payments",
  loanSharePct: "loan",
  loanFlatRatePct: "loan",
  loanYears: "loan",
  lendingRatioPct: "loan",
  certificateRatePct: "loan",
  incomeAmount: "extras",
  incomeIncreasePct: "extras",
  maintenancePct: "extras",
  maintenanceYear: "extras",
  finishingPct: "extras",
  finishingYear: "extras",
};

/** The section a field is typed in; null for the test price (the What if tab). */
export function sectionOf(field: FormField): SectionId | null {
  if (field.startsWith("year-")) return "payments";
  return FIELD_SECTION[field] ?? null;
}

const filled = (v: string) => v.trim() !== "";
const years = (v: string) => (v.trim() === "1" ? "1 year" : `${v.trim()} years`);

function planLine(form: CapacityForm): string {
  return `${form.downPaymentPct.trim() || "0"}% down · ${years(form.planYears)} · ${form.frequency}`;
}

export function sectionSummary(id: SectionId, form: CapacityForm): string {
  switch (id) {
    case "buy": {
      const kind =
        form.purchaseKind === "resale"
          ? "Resale"
          : form.purchaseKind === "developer-cash"
            ? `Developer cash${filled(form.cashDiscountPct) ? ` · ${form.cashDiscountPct.trim()}% off` : ""}`
            : "Developer installments";
      return form.loanEnabled ? `${kind} · with a loan` : kind;
    }
    case "money": {
      const currency = form.currency.trim().toUpperCase() || "EGP";
      const rate =
        form.rateMode === "effective" ? `${form.effectiveRatePct.trim()}% return` : `${form.nominalRatePct.trim()}% nominal return`;
      const parts = [`${form.startingCapital.trim() || "0"} ${currency}`, rate];
      if (filled(form.safetyBuffer)) parts.push(`buffer ${form.safetyBuffer.trim()}`);
      return parts.join(" · ");
    }
    case "payments":
      if (form.purchaseKind === "resale") {
        return `${form.resaleRemaining.trim() || "0"} left · ${years(form.resaleYears)} · ${form.resaleFrequency}`;
      }
      return form.purchaseKind === "developer-cash" ? `Compared against ${planLine(form)}` : planLine(form);
    case "loan":
      return form.loanEnabled
        ? `${form.loanSharePct.trim()}% borrowed · ${form.loanFlatRatePct.trim()}% flat · ${years(form.loanYears)}`
        : "Off";
    case "extras": {
      const parts: string[] = [];
      if (filled(form.incomeAmount)) {
        parts.push(`${form.incomeAmount.trim()} a ${form.incomeFrequency === "monthly" ? "month" : "year"}`);
      }
      if (filled(form.maintenancePct)) parts.push(`maintenance ${form.maintenancePct.trim()}% in year ${form.maintenanceYear.trim()}`);
      if (filled(form.finishingPct)) parts.push(`finishing ${form.finishingPct.trim()}% in year ${form.finishingYear.trim()}`);
      return parts.length ? parts.join(" · ") : "None";
    }
  }
}
