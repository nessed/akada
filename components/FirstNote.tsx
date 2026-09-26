/**
 * A thing explaining itself, once.
 *
 * The screens stay quiet for someone who knows them, so an explanation is
 * drawn only the first time a reader meets the thing, in place, and goes the
 * moment they have used it. Whoever renders this decides "first time" from
 * the reader's own data (no recall answered yet, no session logged yet)
 * rather than from a dismissed flag, so there is nothing to close and nothing
 * that can come back after it has gone. See "Explained once" in
 * readmedesign.md.
 */
export default function FirstNote({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      className={`m-0 max-w-[520px] border-l-2 border-line-strong pl-3 font-serif text-[13.5px] italic leading-[1.6] text-ink-soft ${className}`}
    >
      {children}
    </p>
  );
}
