import type { CalculatorInputs, SimulationResult } from "@/lib/capacity";
import { describeDeal, type DealSentence, type DealTone } from "@/app/lib/dealText";
import { formatMoney } from "@/app/lib/format";

const TONE: Record<DealTone, string> = { in: "text-gain", out: "text-loss", held: "text-white" };

/** One sentence from `dealText`: words, and amounts coloured by the money rule. */
export function Sentence({ parts, currency }: { parts: DealSentence; currency: string }) {
  return (
    <>
      {parts.map((part, j) =>
        typeof part === "string" ? (
          part
        ) : (
          <strong key={j} className={`font-mono font-semibold tabular-nums ${TONE[part.tone]}`}>
            {formatMoney(part.amount, currency)}
          </strong>
        ),
      )}
    </>
  );
}

/**
 * The deal stated as sentences: the answer to "did I enter it right?". Money
 * in is `gain`, money out `loss`, locked money white — the colour rule
 * carries the meaning of every figure.
 */
export default function DealSummary({
  inputs,
  sim,
  caption,
  currency,
}: {
  inputs: CalculatorInputs;
  sim: SimulationResult;
  /** Which price the sentences are at ("At the most you can pay."). */
  caption: string;
  currency: string;
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-white">Your deal</h3>
      <p className="mt-0.5 text-[11px] text-white/40">{caption}</p>
      <div className="mt-2 space-y-1.5 text-sm leading-relaxed text-white/70">
        {describeDeal(inputs, sim).map((sentence, i) => (
          <p key={i}>
            <Sentence parts={sentence} currency={currency} />
          </p>
        ))}
      </div>
    </section>
  );
}
