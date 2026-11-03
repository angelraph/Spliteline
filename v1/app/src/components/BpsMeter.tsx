export function BpsMeter({ sum }: { sum: number }) {
  const pct = Math.min(100, (sum / 10_000) * 100);
  const complete = sum === 10_000;
  const over = sum > 10_000;

  return (
    <div className="bps-meter">
      <div className="bps-meter-track">
        <div
          className={`bps-meter-fill ${complete ? "complete" : over ? "over" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`bps-meter-label ${complete ? "complete" : over ? "over" : ""}`}>
        {(sum / 100).toFixed(2)}%{complete ? " — ready to create" : over ? " — over 100%" : " of 100%"}
      </span>
    </div>
  );
}
