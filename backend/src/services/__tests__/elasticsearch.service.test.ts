import { describe, expect, it } from "vitest";
import { searchEmails } from "../elasticsearch.service";

describe("elasticsearch.service - searchEmails", () => {
  it("handles ES unavailability gracefully without throwing", async () => {
    const result = await searchEmails("user-1", { query: "test" });
    expect(result).toHaveProperty("emails");
    expect(Array.isArray(result.emails)).toBe(true);
    expect(result.page).toBe(1);
  });
});
