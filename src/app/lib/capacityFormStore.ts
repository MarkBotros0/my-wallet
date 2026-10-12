import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_FORM, normalizeForm, type CapacityForm, type MoneyForm, type PlanForm } from "./capacityForm";

/**
 * The calculator remembers what you last typed — per device, in localStorage,
 * the same approach as the auth session. Read through `useSyncExternalStore`
 * so the server renders the defaults, the client swaps in the saved form
 * during hydration, and no effect ever has to setState.
 */

const STORAGE_KEY = "wallet.capacity.form";

let snapshot: CapacityForm | null = null;
const listeners = new Set<() => void>();

function read(): CapacityForm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeForm(JSON.parse(raw)) : DEFAULT_FORM;
  } catch {
    return DEFAULT_FORM;
  }
}

function getSnapshot(): CapacityForm {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

function getServerSnapshot(): CapacityForm {
  return DEFAULT_FORM;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function write(next: CapacityForm) {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private window or full quota: the form still works, it just won't be
    // remembered.
  }
  for (const listener of listeners) listener();
}

export function useCapacityForm(): [CapacityForm, (patch: Partial<CapacityForm>) => void, () => void] {
  const form = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const update = useCallback((patch: Partial<CapacityForm>) => {
    write({ ...getSnapshot(), ...patch });
  }, []);
  const reset = useCallback(() => write(DEFAULT_FORM), []);
  return [form, update, reset];
}

/**
 * `update` is shallow, so editing one field of the money block or of one plan
 * goes through these: each reads the CURRENT snapshot (not a render's copy, so
 * two quick edits never undo each other) and spreads the patch in place.
 */
export function updateMoney(patch: Partial<MoneyForm>) {
  const form = getSnapshot();
  write({ ...form, money: { ...form.money, ...patch } });
}

/** Any edit to a plan means the examples are now the user's own. */
export function updatePlan(id: string, patch: Partial<PlanForm>) {
  const form = getSnapshot();
  write({
    ...form,
    plans: form.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    examplesEdited: true,
  });
}

/** Replace the plan list (add, duplicate, delete), keeping the selection on a plan that exists. */
export function setPlans(plans: PlanForm[], selectedPlanId?: string) {
  const form = getSnapshot();
  const wanted = selectedPlanId ?? form.selectedPlanId;
  write({
    ...form,
    plans,
    selectedPlanId: plans.some((p) => p.id === wanted) ? wanted : plans[0].id,
    examplesEdited: true,
  });
}
