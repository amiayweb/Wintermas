// Vertical coordinates increase downward on the Windows canvas.
export function snowStep(phase, rate, sway, fall, wind, dt) {
  const nextPhase = phase + rate * dt;
  const dx = wind * dt + sway / rate * (
    Math.sin(nextPhase) - Math.sin(phase) +
    0.3 / 2.3 * (Math.sin(2.3 * nextPhase) - Math.sin(2.3 * phase))
  );
  const dy = fall * (dt + 0.12 / (1.3 * rate) * (
    Math.cos(1.3 * phase) - Math.cos(1.3 * nextPhase)
  ));
  return {
    phase: nextPhase, dx, dy,
    vx: wind + sway * (Math.cos(nextPhase) + 0.3 * Math.cos(2.3 * nextPhase)),
    vy: fall * (1 + 0.12 * Math.sin(1.3 * nextPhase)),
  };
}
