"use client";

import type { ReactNode } from "react";
import type { PlanAnswer } from "@/app/lib/planAnswer";

/**
 * One plan as a card: its name, its terms in one line, and its answer, live.
 * It carries Edit / Duplicate / Delete and opens its editor inline beneath
 * (`children`). Step ③ lists plans with `PlanRanking` instead.
 */
export default function PlanCard({
  id,
  name,
  terms,
  answer,
  best = false,
  editing = false,
  onEdit,
  onDuplicate,
  onDelete,
  children,
}: {
  /** The plan's id — names the inline editor's element for aria-controls. */
  id: string;
  name: string;
  terms: string;
  answer: PlanAnswer;
  best?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onDuplicate?: () => void;
  /** Absent on the last plan — there is always one. */
  onDelete?: () => void;
  children?: ReactNode;
}) {
  const editorId = `plan-editor-${id}`;
  const head = (
    <div className="flex items-start gap-3 p-4 md:px-5">
      <div className="min-w-0 flex-1">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
          <span className="min-w-0 break-words">{name}</span>
          {best && (
            <span className="rounded-full border border-accent/40 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-accent">
              Best
            </span>
          )}
        </h3>
        <p className="mt-0.5 text-xs leading-snug text-white/50">{terms}</p>
      </div>
      <div className="max-w-[48%] shrink-0 text-right">
        <div className="text-[10px] font-medium uppercase tracking-wider text-white/40">{answer.label}</div>
        <div
          className={`mt-0.5 text-sm ${
            answer.tone === "answer"
              ? "font-mono font-semibold tabular-nums text-white"
              : answer.tone === "problem"
                ? "font-medium text-loss"
                : "text-white/50"
          }`}
        >
          {answer.value}
        </div>
      </div>
    </div>
  );

  return (
    <article className={`surface overflow-hidden ${editing ? "ring-1 ring-accent/40" : ""}`}>
      {head}
      <div className="flex border-t border-white/5 px-2 md:px-3">
        <Action
          onClick={onEdit}
          accent
          ariaExpanded={editing}
          ariaControls={editing ? editorId : undefined}
          ariaLabel={`${editing ? "Close" : "Edit"} ${name}`}
        >
          {editing ? "Close" : "Edit"}
        </Action>
        {onDuplicate && (
          <Action onClick={onDuplicate} ariaLabel={`Duplicate ${name}`}>
            Duplicate
          </Action>
        )}
        {onDelete && (
          <Action onClick={onDelete} ariaLabel={`Delete ${name}`}>
            Delete
          </Action>
        )}
      </div>
      {editing && (
        <div id={editorId} className="animate-rise border-t border-white/10 p-4 md:p-5">
          {children}
        </div>
      )}
    </article>
  );
}

function Action({
  onClick,
  children,
  accent = false,
  ariaExpanded,
  ariaControls,
  ariaLabel,
}: {
  onClick?: () => void;
  children: ReactNode;
  accent?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
  /** The action with the plan's name — "Delete" alone is ambiguous in a list of cards. */
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-controls={ariaControls}
      aria-label={ariaLabel}
      className={`min-h-[44px] cursor-pointer rounded-lg px-3 text-xs font-medium transition-colors hover:bg-white/5 active:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        accent ? "text-accent" : "text-white/60 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
