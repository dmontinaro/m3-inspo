/** The favorite star, filled or as an outline. Color comes from the surrounding text color. */
export function FavoriteStar({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={`${className ?? ""} stroke-current stroke-[1.75] ${filled ? "fill-current" : "fill-none"}`}
      strokeLinejoin="round"
    >
      <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />
    </svg>
  );
}
