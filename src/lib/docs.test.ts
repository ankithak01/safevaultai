import { describe, expect, it } from "vitest";
import { daysUntil, expiryState } from "./docs";

const today = new Date(2026, 0, 1);

describe("expiry rules", () => {
  it("counts days until expiry", () => {
    expect(daysUntil("2026-01-11", today)).toBe(10);
  });
  it("marks documents within 30 days as expiring soon", () => {
    expect(expiryState("2026-01-31", today)).toBe("soon");
    expect(expiryState("2026-02-01", today)).toBe("upcoming");
  });
  it("marks past dates as expired", () => {
    expect(expiryState("2025-12-31", today)).toBe("expired");
  });
});
