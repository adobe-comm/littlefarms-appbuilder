type CommerceLoaderProps = {
  cover?: "content" | "screen" | "local";
};

const SPOKES = 12;

export function CommerceLoader({ cover = "content" }: CommerceLoaderProps) {
  const scope = cover === "content" ? "" : ` lf-loading-mask-${cover}`;
  return (
    <div className={`lf-loading-mask${scope}`} role="status" aria-live="polite" aria-label="Please wait">
      <div className="lf-loader">
        <div className="lf-loader-spinner" aria-hidden="true">
          {Array.from({ length: SPOKES }, (_, index) => (
            <span key={index} />
          ))}
        </div>
        <p>Please wait...</p>
      </div>
    </div>
  );
}
