/** Return the first visible top edge crossed along a particle's trajectory. */
export function landing(rectangles, x0, y0, x1, y1, useTaskbar) {
  if (y1 <= y0) return null;
  let hit = null;
  for (let z = 0; z < rectangles.length; z++) {
    const rect = rectangles[z];
    if ((rect.taskbar && !useTaskbar) || rect.top < y0 || rect.top > y1) continue;
    const x = x0 + (x1 - x0) * ((rect.top - y0) / (y1 - y0));
    if (x < rect.left || x >= rect.right || (hit && hit.rect.top <= rect.top)) continue;
    let hidden = false;
    for (let i = 0; i < z; i++) {
      const other = rectangles[i];
      if (x >= other.left && x < other.right && rect.top >= other.top && rect.top < other.bottom) {
        hidden = true;
        break;
      }
    }
    if (!hidden) hit = { rect, x };
  }
  return hit;
}

export function driftFollows(previous, next) {
  return next && Math.abs(previous.left - next.left) < 26 &&
    Math.abs(previous.top - next.top) < 18 &&
    Math.abs((previous.right - previous.left) - (next.right - next.left)) < 18;
}

/** Find the taskbar occupying the bottom edge below a ground deposit. */
export function bottomTaskbarAt(rectangles, x, height) {
  return rectangles.find(rect => rect.taskbar && rect.bottom >= height - 1 &&
    x >= rect.left && x < rect.right);
}

