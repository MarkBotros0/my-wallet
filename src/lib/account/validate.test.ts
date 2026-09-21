import { describe, expect, it } from "vitest";
import {
  MIN_PASSWORD_LENGTH,
  normalizeUsername,
  validateCredentials,
  validatePasswordChange,
} from "./validate";

describe("normalizeUsername", () => {
  it("trims and lower-cases", () => {
    expect(normalizeUsername("  Mark.B ")).toBe("mark.b");
  });

  it("is empty for a non-string", () => {
    expect(normalizeUsername(undefined)).toBe("");
    expect(normalizeUsername(42)).toBe("");
  });
});

describe("validateCredentials", () => {
  it("accepts a valid pair and returns the normalized username", () => {
    const r = validateCredentials({ username: " Alice_1 ", password: "hunter22" });
    expect(r).toEqual({ ok: true, value: { username: "alice_1", password: "hunter22" } });
  });

  it("keeps the password exactly as typed — no trimming", () => {
    const r = validateCredentials({ username: "alice", password: " spaced out " });
    expect(r.ok && r.value.password).toBe(" spaced out ");
  });

  it.each([
    ["ab", "too short"],
    ["a".repeat(33), "too long"],
    ["al ice", "a space"],
    ["al!ce", "punctuation outside . - _"],
    ["", "empty"],
  ])("rejects username %j (%s)", (username) => {
    const r = validateCredentials({ username, password: "hunter22" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.errors[0]).toMatch(/^Username/);
  });

  it("accepts the edges: 3 and 32 chars, dot, dash, underscore, digits", () => {
    for (const username of ["abc", "a".repeat(32), "a.b-c_9"]) {
      expect(validateCredentials({ username, password: "hunter22" }).ok).toBe(true);
    }
  });

  it("rejects a short password", () => {
    const r = validateCredentials({ username: "alice", password: "1234567" });
    expect(r).toEqual({
      ok: false,
      errors: [`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`],
    });
  });

  it("accepts a password of exactly the minimum length", () => {
    expect(validateCredentials({ username: "alice", password: "12345678" }).ok).toBe(true);
  });

  it("reports both problems at once", () => {
    const r = validateCredentials({ username: "x", password: "y" });
    expect(!r.ok && r.errors).toHaveLength(2);
  });

  it("rejects a non-object body", () => {
    expect(validateCredentials(null).ok).toBe(false);
    expect(validateCredentials("alice:pw").ok).toBe(false);
  });

  it("treats a missing password as empty", () => {
    const r = validateCredentials({ username: "alice" });
    expect(!r.ok && r.errors[0]).toMatch(/^Password/);
  });
});

describe("validatePasswordChange", () => {
  it("accepts a current password and a different new one", () => {
    const r = validatePasswordChange({ currentPassword: "hunter22", newPassword: "hunter23!" });
    expect(r).toEqual({
      ok: true,
      value: { currentPassword: "hunter22", newPassword: "hunter23!" },
    });
  });

  it("keeps both passwords exactly as typed — no trimming", () => {
    const r = validatePasswordChange({ currentPassword: " old one ", newPassword: " new one " });
    expect(r.ok && r.value).toEqual({ currentPassword: " old one ", newPassword: " new one " });
  });

  it("requires the current password", () => {
    const r = validatePasswordChange({ currentPassword: "", newPassword: "hunter23!" });
    expect(r).toEqual({ ok: false, errors: ["Enter your current password."] });
  });

  it("holds the new password to the sign-up minimum, with the sign-up message", () => {
    const r = validatePasswordChange({ currentPassword: "hunter22", newPassword: "1234567" });
    expect(r).toEqual({
      ok: false,
      errors: [`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`],
    });
  });

  it("accepts a new password of exactly the minimum length", () => {
    expect(validatePasswordChange({ currentPassword: "hunter22", newPassword: "12345678" }).ok).toBe(true);
  });

  it("rejects a new password equal to the current one", () => {
    const r = validatePasswordChange({ currentPassword: "hunter22", newPassword: "hunter22" });
    expect(r).toEqual({
      ok: false,
      errors: ["The new password must differ from the current one."],
    });
  });

  it("reports both problems at once", () => {
    const r = validatePasswordChange({ currentPassword: "", newPassword: "short" });
    expect(!r.ok && r.errors).toHaveLength(2);
  });

  it("treats a missing field as empty", () => {
    const r = validatePasswordChange({ currentPassword: "hunter22" });
    expect(!r.ok && r.errors[0]).toMatch(/^Password/);
  });

  it("rejects a non-object body", () => {
    expect(validatePasswordChange(null).ok).toBe(false);
    expect(validatePasswordChange("old:new").ok).toBe(false);
  });
});
