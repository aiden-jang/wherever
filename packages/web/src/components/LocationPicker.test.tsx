import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_FILTERS } from "@wherever/shared";
import { LocationPicker } from "./LocationPicker.js";
import { geocode } from "../api.js";
vi.mock("../api.js", () => ({ geocode: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
describe("location search", () => {
  it("distinguishes an unavailable search from a place with no matches", async () => {
    vi.mocked(geocode).mockRejectedValue(new Error("Location search is unavailable. Try again shortly."));
    render(<LocationPicker filters={DEFAULT_FILTERS} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "ZIP code or town" }), {
      target: { value: "Denver" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Location search is unavailable");
  });

  it("keeps a newly typed query when the previous lookup finishes", async () => {
    let resolve!: (hit: { lat: number; lng: number; label: string }) => void;
    vi.mocked(geocode).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onChange = vi.fn();
    render(<LocationPicker filters={DEFAULT_FILTERS} onChange={onChange} />);
    const field = screen.getByRole("textbox", { name: "ZIP code or town" });
    fireEvent.change(field, { target: { value: "Denver" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.change(field, { target: { value: "Boulder" } });
    await act(async () => resolve({ lat: 39.7, lng: -104.9, label: "Denver" }));
    expect(onChange).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe("Boulder");
    expect(screen.getByRole("button", { name: "Search" }).hasAttribute("disabled")).toBe(false);
  });

  it("retains dinner filters changed while a location lookup is pending", async () => {
    let resolve!: (hit: { lat: number; lng: number; label: string }) => void;
    vi.mocked(geocode).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onChange = vi.fn();
    const view = render(<LocationPicker filters={DEFAULT_FILTERS} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "ZIP code or town" }), {
      target: { value: "Denver" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    view.rerender(
      <LocationPicker filters={{ ...DEFAULT_FILTERS, categories: ["pizza"] }} onChange={onChange} />,
    );
    await act(async () => resolve({ lat: 39.7, lng: -104.9, label: "Denver" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ categories: ["pizza"], locationLabel: "Denver" }),
    );
  });

  it("pauses a delayed lookup while exploring neighborhoods and keeps the typed town", async () => {
    let resolve!: (hit: { lat: number; lng: number; label: string }) => void;
    vi.mocked(geocode).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const onChange = vi.fn();
    render(<LocationPicker filters={DEFAULT_FILTERS} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox", { name: "ZIP code or town" }), {
      target: { value: "Denver" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    fireEvent.click(screen.getByRole("button", { name: "Explore NYC" }));
    expect(vi.mocked(geocode).mock.calls[0]?.[1]?.aborted).toBe(true);
    await act(async () => resolve({ lat: 39.7, lng: -104.9, label: "Denver" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back to ZIP or town" }));
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "ZIP code or town" });
    expect(field.value).toBe("Denver");
    fireEvent.click(screen.getByRole("button", { name: "Explore NYC" }));
    fireEvent.click(screen.getByRole("button", { name: "Williamsburg" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ area: "williamsburg" }));
  });
});
