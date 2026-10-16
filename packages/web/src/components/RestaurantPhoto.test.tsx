import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { RestaurantPhoto } from "./RestaurantPhoto.js";

afterEach(cleanup);
it("tries a changed photo after the previous URL failed", () => {
  const view = render(<RestaurantPhoto imageUrl="/missing.jpg" category="pizza" />);
  fireEvent.error(view.container.querySelector("img")!);
  expect(view.container.querySelector("img")).toBeNull();
  view.rerender(<RestaurantPhoto imageUrl="/available.jpg" category="pizza" />);
  expect(view.container.querySelector("img")?.getAttribute("src")).toBe("/available.jpg");
  fireEvent.error(view.container.querySelector("img")!);
  expect(view.container.querySelector("img")).toBeNull();
  view.rerender(<RestaurantPhoto imageUrl={null} category="pizza" />);
  expect(view.container.textContent).not.toBe("");
});
