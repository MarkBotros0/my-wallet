import { describe, expect, it } from "vitest";
import { MIN_PASSWORD_LENGTH, normalizeUsername, validateCredentials } from "./validate";

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
