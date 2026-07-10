/**
 * Visually-hidden polite live region. Screen readers announce its text when it changes, so the
 * realtime moments (someone joins/leaves, the verdict) aren't silent for non-sighted users.
 * Rendered empty first, then updated, which is what SRs need to actually announce.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
