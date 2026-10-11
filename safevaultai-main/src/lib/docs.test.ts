import { describe, expect, it } from "vitest";
import { daysUntil, expiryState, humanDays, formatBytes, formatDate } from "./docs";

const today = new Date(2026, 0, 1);

describe("document expiry rules and nullable handling", () => {
  it("counts days until expiry correctly", () => {
    expect(daysUntil("2026-01-11", today)).toBe(10);
  });

  it("handles null and empty expiry dates safely without fabrication", () => {
    expect(daysUntil(null, today)).toBeNull();
    expect(daysUntil("", today)).toBeNull();
    expect(expiryState(null, today)).toBe("none");
    expect(expiryState("", today)).toBe("none");
    expect(humanDays(null)).toBe("—");
    expect(formatDate(null)).toBe("—");
  });

  it("marks documents within 30 days as expiring soon", () => {
    expect(expiryState("2026-01-31", today)).toBe("soon");
    expect(expiryState("2026-02-01", today)).toBe("upcoming");
  });

  it("marks past dates as expired", () => {
    expect(expiryState("2025-12-31", today)).toBe("expired");
  });

  it("formats human relative days correctly", () => {
    expect(humanDays(-5)).toBe("5 days ago");
    expect(humanDays(12)).toBe("12 days");
    expect(humanDays(90)).toBe("3 months");
  });

  it("formats byte sizes properly", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(1048576 * 5)).toBe("5.0 MB");
  });
});
