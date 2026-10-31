export function PlateState({
  small = false,
  art,
}: {
  small?: boolean;
  art?: "table" | "waiting" | "search";
}) {
  return (
    <img
      className={
        art
          ? small
            ? "meal-artwork meal-artwork-small"
            : "meal-artwork"
          : small
            ? "plate-state plate-state-small"
            : "plate-state"
      }
      src={art ? `/art/${art}.svg` : "/icon.svg"}
      alt=""
      width={art ? (small ? 80 : 160) : small ? 44 : 72}
      height={art ? (small ? 50 : 100) : small ? 44 : 72}
    />
  );
}
