/** Transfer snow by overlap, keeping the mass of partially clipped columns. */
export function resizeProfile(profile, old, next, column) {
  const retained = new Float32Array(Math.ceil((next.right - next.left) / column));
  const detached = [];
  for (let i = 0; i < profile.length; i++) {
    const left = old.left + i * column;
    const right = Math.min(old.right, left + column);
    const depth = profile[i];
    if (!depth || right <= left) continue;
    const start = Math.max(left, next.left);
    const stop = Math.min(right, next.right);
    for (let x = start; x < stop;) {
      const index = Math.min(retained.length - 1, Math.floor((x - next.left) / column));
      const end = Math.min(stop, next.left + (index + 1) * column);
      if (end <= x) break;
      const cellLeft = next.left + index * column;
      const cellWidth = Math.min(column, next.right - cellLeft);
      retained[index] += depth * (end - x) / cellWidth;
      x = end;
    }
    for (const [a, b] of [[left, Math.min(right, next.left)], [Math.max(left, next.right), right]]) {
      if (b > a) detached.push({ x: (a + b) / 2, depth: depth * (b - a) / column });
    }
  }
  return { retained, detached };
}
