import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { applyVibe, DEFAULT_FILTERS } from "@wherever/shared";
import { VibeDial } from "./VibeDial.js";

afterEach(cleanup);
it("describes the active preset's actual filters and identifies host customization", () => {
  const props = { counts: { quick: 1 }, mine: "quick" as const, groupSize: 1, onPick: vi.fn() };
  const filters = applyVibe(DEFAULT_FILTERS, "quick");
  const view = render(<VibeDial {...props} filters={filters} />);
  expect(screen.getByRole("status").textContent).toMatch(/quick applied.*0.5 mi.*takeout/);
  view.rerender(<VibeDial {...props} filters={{ ...filters, radiusMeters: 8000 }} />);
  expect(screen.getByRole("status").textContent).toMatch(/quick · Customized.*5 mi/);
  view.rerender(<VibeDial {...props} filters={filters} />);
  expect(screen.getByRole("status").textContent).toContain("quick applied");
});
