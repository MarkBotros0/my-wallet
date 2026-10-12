import type { CalculatorInputs, SimulationResult } from "@/lib/capacity";
import { describeDeal, type DealTone } from "@/app/lib/dealText";
import { formatMoney } from "@/app/lib/format";
import { Card } from "../ui";

const TONE: Record<DealTone, string> = { in: "text-gain", out: "text-loss", held: "text-white" };

/**
 * The deal stated as sentences, before any chart: the answer to "did I enter
 * it right?". Money in is `gain`, money out `loss`, locked money white — the
 * colour rule carries the meaning of every figure.
 */
export default function DealSummary({
  inputs,
  sim,
  atPrice,
  currency,
}: {
  inputs: CalculatorInputs;
  sim: SimulationResult;
  atPrice: "max" | "test";
  currency: string;
}) {
  return (
    <Card title="Your deal" className="animate-rise" style={{ animationDelay: "40ms" }}>
      <p className="-mt-1 mb-2 text-[11px] text-white/40">
        {atPrice === "max" ? "At the maximum price." : "At the price you're checking."}
      </p>
      <div className="space-y-1.5 text-sm leading-relaxed text-white/70">
        {describeDeal(inputs, sim).map((sentence, i) => (
          <p key={i}>
            {sentence.map((part, j) =>
              typeof part === "string" ? (
                part
              ) : (
                <strong key={j} className={`font-mono font-semibold tabular-nums ${TONE[part.tone]}`}>
                  {formatMoney(part.amount, currency)}
                </strong>
              ),
            )}
          </p>
        ))}
      </div>
    </Card>
  );
}
