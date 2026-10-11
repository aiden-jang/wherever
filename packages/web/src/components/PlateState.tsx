export function PlateState({ small = false }: { small?: boolean }) {
  return (
    <img
      className={small ? "plate-state plate-state-small" : "plate-state"}
      src="/icon.svg"
      alt=""
      width={small ? 44 : 72}
      height={small ? 44 : 72}
    />
  );
}
