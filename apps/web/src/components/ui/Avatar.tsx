import { cn } from "../../lib/cn";

const sizes = {
  sm: "h-8 w-8 text-2xs rounded-md",
  md: "h-11 w-11 text-xs rounded-lg",
  lg: "h-16 w-16 text-base rounded-xl",
};

/** Square brand/person avatar that falls back to initials when no image exists. */
export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name?: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const initials = (name ?? "?").trim().slice(0, 2).toUpperCase();

  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center overflow-hidden bg-brand font-bold text-white",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- Cloudinary URLs are remote and unoptimised by design.
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}
