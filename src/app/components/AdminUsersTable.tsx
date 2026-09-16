"use client";

import { useState } from "react";
import type { ManagedUser } from "../lib/api";

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function RoleBadge({ role }: { role: ManagedUser["role"] }) {
  if (role !== "admin") {
    return <span className="text-xs text-white/40">User</span>;
  }
  return (
    <span className="rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
      Admin
    </span>
  );
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-gain" : "bg-white/25"}`} />
      <span className={active ? "text-white/70" : "text-white/40"}>
        {active ? "Active" : "Disabled"}
      </span>
    </span>
  );
}

interface Actions {
  onResetPassword: (u: ManagedUser) => void;
  onToggleActive: (u: ManagedUser) => void;
  onDelete: (u: ManagedUser) => void;
  busyId: string | null;
  currentUserId: string | undefined;
}

/**
 * The guards that make an action impossible live on the backend; this only
 * explains why a button is missing, so an admin isn't left clicking something
 * that will always 400.
 */
function blockedReason(u: ManagedUser, currentUserId: string | undefined): string | null {
  if (u.id === currentUserId) return "This is you";
  return null;
}

function ActionButtons({
  u,
  onResetPassword,
  onToggleActive,
  onDelete,
  busyId,
  currentUserId,
  className = "",
}: Actions & { u: ManagedUser; className?: string }) {
  const blocked = blockedReason(u, currentUserId);
  const busy = busyId === u.id;

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        onClick={() => onResetPassword(u)}
        disabled={busy}
        className="min-h-[36px] rounded-md border border-white/10 px-2.5 text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
      >
        Reset password
      </button>

      {blocked ? (
        <span className="text-[11px] text-white/30">{blocked}</span>
      ) : (
        <>
          <button
            onClick={() => onToggleActive(u)}
            disabled={busy}
            className="min-h-[36px] rounded-md border border-white/10 px-2.5 text-xs text-white/70 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
          >
            {u.is_active ? "Disable" : "Enable"}
          </button>
          <button
            onClick={() => onDelete(u)}
            disabled={busy}
            className="min-h-[36px] rounded-md border border-loss/30 px-2.5 text-xs text-loss transition-colors hover:bg-loss/10 disabled:opacity-40"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}

export default function AdminUsersTable({
  users,
  ...actions
}: Actions & { users: ManagedUser[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!users.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-charcoal p-6 text-center text-sm text-white/40">
        No users yet.
      </div>
    );
  }

  return (
    <>
      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {users.map((u) => (
          <div key={u.id} className="rounded-xl border border-white/10 bg-charcoal p-4">
            <button
              onClick={() => setExpanded(expanded === u.id ? null : u.id)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-mono text-sm text-white">{u.username}</span>
                  <RoleBadge role={u.role} />
                </div>
                <div className="mt-1 flex items-center gap-3">
                  <StatusDot active={u.is_active} />
                  <span className="text-xs text-white/40">Added {formatDate(u.created_at)}</span>
                </div>
              </div>
              <span className="shrink-0 text-white/30">{expanded === u.id ? "▲" : "▼"}</span>
            </button>

            {expanded === u.id && (
              <div className="mt-3 border-t border-white/10 pt-3">
                <ActionButtons u={u} {...actions} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-xl border border-white/10 bg-charcoal md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-white/40">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Added</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono text-white">{u.username}</td>
                <td className="px-4 py-3">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3">
                  <StatusDot active={u.is_active} />
                </td>
                <td className="px-4 py-3 text-white/50">{formatDate(u.created_at)}</td>
                <td className="px-4 py-3">
                  <ActionButtons u={u} {...actions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
