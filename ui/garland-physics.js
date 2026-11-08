const step = 1 / 60;

export function makeRope(a, b) {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const count = Math.max(6, Math.min(64, Math.ceil(distance / 17)));
  const sag = Math.min(100, distance * .14);
  let length = 0;
  const nodes = Array.from({ length: count + 1 }, (_, i) => {
    const t = i / count;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t + 4 * t * (1 - t) * sag;
    return { x, y, px: x, py: y };
  });
  for (let i = 1; i < nodes.length; i++) {
    length += Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y);
  }
  return { nodes, rest: length / count, time: 0, active: 1.5 };
}

export function brushRope(rope, from, to) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const travel = Math.hypot(dx, dy);
  if (travel < 1 || travel > 220) return;
  const nodes = rope.nodes;
  for (let i = 1; i < nodes.length - 1; i++) {
    const node = nodes[i];
    const t = Math.max(0, Math.min(1, ((node.x - from.x) * dx + (node.y - from.y) * dy) / (travel * travel)));
    const sx = node.x - (from.x + dx * t), sy = node.y - (from.y + dy * t);
    const separation = Math.hypot(sx, sy);
    if (separation >= 20) continue;
    const strength = (1 - separation / 20) * Math.min(22, travel * .62);
    node.px -= (dx / travel + sx / 25) * strength;
    node.py -= (dy / travel + sy / 25) * strength;
    rope.active = 2.4;
  }
}

export function stepRope(rope, a, b, dt) {
  const nodes = rope.nodes;
  const last = nodes.length - 1;
  if (Math.hypot(a.x - nodes[0].x, a.y - nodes[0].y) > .02 ||
      Math.hypot(b.x - nodes[last].x, b.y - nodes[last].y) > .02) rope.active = 1.6;
  if (rope.active <= 0) return;
  rope.active -= dt;
  Object.assign(nodes[0], a);
  Object.assign(nodes[last], b);
  rope.time = Math.min(.065, rope.time + dt);
  const rest = Math.max(rope.rest, Math.hypot(b.x - a.x, b.y - a.y) / last * 1.001);
  while (rope.time >= step) {
    rope.time -= step;
    for (let i = 1; i < last; i++) {
      const node = nodes[i];
      const { x, y } = node;
      node.x += (x - node.px) * .979;
      node.y += (y - node.py) * .979 + 520 * step * step;
      node.px = x;
      node.py = y;
    }
    for (let pass = 0; pass < 8; pass++) {
      const reverse = pass % 2 !== 0;
      for (let k = 0; k < last; k++) {
        const i = reverse ? last - 1 - k : k;
        const left = nodes[i], right = nodes[i + 1];
        const dx = right.x - left.x, dy = right.y - left.y;
        const distance = Math.hypot(dx, dy);
        if (distance < .001) continue;
        const correction = (distance - rest) / distance;
        if (i > 0) {
          const weight = i + 1 === last ? 1 : .5;
          left.x += dx * correction * weight;
          left.y += dy * correction * weight;
        }
        if (i + 1 < last) {
          const weight = i === 0 ? 1 : .5;
          right.x -= dx * correction * weight;
          right.y -= dy * correction * weight;
        }
      }
    }
  }
  if (rope.active <= 0) {
    for (const node of nodes) {
      node.px = node.x;
      node.py = node.y;
    }
    rope.time = 0;
  }
}

