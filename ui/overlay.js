import { landing, bottomTaskbarAt } from './geometry.js';
import { snowStep } from './snow-motion.js';
import { resizeProfile } from './snow-profile.js';
import { drawPlough, drawSanta, drawSnowman, drawBall, makeSnowGrain } from './snow-art.js';
import { drawGarland, drawTree, drawGift } from './christmas-decor.js';
import { createSnowRenderer } from './snow-renderer.js';
import { makeRope, brushRope, stepRope } from './garland-physics.js';

const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const snowCanvas = document.querySelector('#snow');
let snowRenderer;
try { snowRenderer = createSnowRenderer(snowCanvas); }
catch (error) { console.warn('Snow renderer:', error.message); }
snowCanvas.hidden = !snowRenderer;
document.documentElement.dataset.snowBackend = snowRenderer ? 'webgl' : 'canvas2d';
snowCanvas.addEventListener('webglcontextlost', () => {
  snowRenderer = undefined;
  snowCanvas.hidden = true;
  document.documentElement.dataset.snowBackend = 'canvas2d';
});
const snowGrain = makeSnowGrain(ctx);
const random = (min, max) => min + Math.random() * (max - min);
const column = 6;
let width, height, previous, nextFrame, fraction = 0;
let previousScene, sceneVisible = false;
let settings = { enabled: false, intensity: 65, wind: 15, taskbar: true, paused: true };
let rectangles = [], mouse = { x: -1000, y: -1000 }, particles = [], accents = [], balls = [];
let taskbars = [];
let ground, plough, snowReady = false;
let lastDesktopSample;
let grabbed, grabOffset, capturing = false;
let placement;
let heldTree, frameRequest;
const garlands = [], trees = [];
let gifts = [];
const piles = new Map();

function resize() {
  const detailBudget = snowRenderer ? 1_050_000 : 760_000;
  const scale = Math.min(devicePixelRatio, Math.sqrt(detailBudget / (innerWidth * innerHeight)));
  if (width === innerWidth && height === innerHeight &&
      canvas.width === Math.round(width * scale) && canvas.height === Math.round(height * scale)) return;
  width = innerWidth;
  height = innerHeight;
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  snowRenderer?.resize(width, height, Math.min(devicePixelRatio, Math.sqrt(1_100_000 / (width * height))));
  const rect = { id: 'ground', left: 0, right: width, top: height, bottom: height + 1 };
  ground = { rect, profile: new Float32Array(Math.ceil(width / column)), kind: 'snow' };
  snowReady = false;
}

function releaseSnow(x, y, depth, vx, vy) {
  accents.push({
    kind: 'chunk', x, y, vx, vy, alpha: 0.94, deposit: depth,
    size: Math.min(7, Math.sqrt(depth) * 1.6),
  });
}

function spill(pile) {
  for (let index = 0; index < pile.profile.length; index++) {
    const depth = pile.profile[index];
    if (depth < 0.05) continue;
    const x = pile.rect.left + (index + 0.5) * column;
    const y = pile.rect.top - depth / 2;
    releaseSnow(x, y, depth, random(-16, 16), 0);
  }
}
function desktop(frame) {
  if (!frame.rectangles) return;
  const now = performance.now();
  const elapsed = Math.max(0.012, (now - (lastDesktopSample ?? now)) / 1000);
  lastDesktopSample = now;
  rectangles = frame.rectangles;
  taskbars = rectangles.filter(rect => rect.taskbar);
  updatePointer(frame.mouse, elapsed);
  mouse = frame.mouse;
  const byId = new Map(rectangles.map(rect => [rect.id, rect]));
  for (const [id, pile] of piles) {
    const next = byId.get(id);
    if (pile.rect.taskbar && (!settings.taskbar || settings.paused)) {
      piles.delete(id);
    } else if (!next) {
      if (!next && now - (pile.lastSeen ??= now) < 125) continue;
      spill(pile);
      piles.delete(id);
    } else {
      pile.lastSeen = now;
      const old = pile.rect;
      const oldWidth = old.right - old.left;
      const newWidth = next.right - next.left;
      if (Math.abs(oldWidth - newWidth) > 1) {
        const { retained, detached } = resizeProfile(pile.profile, old, next, column);
        for (const { x, depth } of detached) {
          if (depth < 0.05) continue;
          const edgeDelta = x < next.left ? next.left - old.left : next.right - old.right;
          releaseSnow(x, old.top - depth / 2, depth, Math.max(-180, Math.min(180, edgeDelta / elapsed * 0.35)), 0);
        }        pile.profile = retained;
      } else if (!next.taskbar) {
        const velocity = (next.left - old.left) / elapsed;
        if (Math.abs(velocity) > 135) {
          const index = velocity > 0 ? 0 : pile.profile.length - 1;
          const depth = pile.profile[index] * Math.min(0.45, (Math.abs(velocity) - 135) * elapsed / 140);
          if (depth > 0.05) {
            pile.profile[index] -= depth;
            const x = velocity > 0 ? next.left - 1 : next.right + 1;
            releaseSnow(x, next.top - depth, depth, Math.max(-150, Math.min(150, velocity * 0.18)), 0);
          }
        }
      }
      pile.rect = next;
    }
  }
}

function configure(next) {
  const wasEnabled = settings.enabled;
  if ((!next.taskbar || next.paused) && settings.taskbar && !settings.paused) {
    for (const [id, pile] of piles) {
      if (pile.rect.taskbar) piles.delete(id);
    }
  }
  if (next.paused && !settings.paused) {
    particles = [];
    fraction = 0;
    snowReady = false;
  }
  settings = next;
  if (next.enabled && !wasEnabled) {
    previous = nextFrame = undefined;
    frameRequest = setTimeout(frame, 0);
  } else if (!next.enabled && wasEnabled) {
    clearTimeout(frameRequest);
    cancelPlacement();
    grabbed = heldTree = undefined;
    ctx.clearRect(0, 0, width, height);
    snowRenderer?.draw([], rectangles, settings.taskbar);
    sceneVisible = false;
  }
}
function addPile(hit, amount = 1) {
  const { x } = hit;
  const rect = hit.rect.id === 'ground' ? bottomTaskbarAt(taskbars, x, height) ?? hit.rect : hit.rect;
  if (rect.taskbar && (!settings.taskbar || settings.paused)) return;
  if (rect.id !== 'ground' && !piles.has(rect.id)) {
    piles.set(rect.id, { rect, profile: new Float32Array(Math.ceil((rect.right - rect.left) / column)), kind: 'snow' });
  }
  const { profile } = rect.id === 'ground' ? ground : piles.get(rect.id);
  const center = Math.max(0, Math.min(profile.length - 1, Math.floor((x - rect.left) / column)));
  for (let dx = -2; dx <= 2; dx++) {
    const i = center + dx;
    if (i < 0 || i >= profile.length) continue;
    if (rect.id === 'ground' && bottomTaskbarAt(taskbars, (i + .5) * column, height)) continue;
    const limit = rect.id === 'ground' ? 21 : 12;
    profile[i] = Math.min(limit, profile[i] + (3 - Math.abs(dx)) * 0.38 * amount);
  }
}

function spawnFlake() {
  const depth = Math.random() ** 1.65;
  return {
    kind: 'snow', x: random(0, width), y: -14, phase: random(0, Math.PI * 2),
    alpha: 0.15 + depth * 0.58, size: 0.43 + depth * 1.65,
    fall: 36 + depth * 106, vx: random(-7, 7),
    sway: random(4, 19), rate: random(0.6, 1.8), foreground: Math.random() < 0.18,
  };
}

function updateParticles(dt) {
  const budget = snowRenderer ? 950 : 360;
  if (!settings.paused && settings.intensity > 0) {
    if (!snowReady) {
      snowReady = true;
      const count = Math.min(Math.floor(budget * .65), Math.round(width * height / 3200 * settings.intensity / 100));
      for (let i = 0; i < count; i++) {
        const flake = spawnFlake();
        flake.y = random(-10, height);
        particles.push(flake);
      }
    }
    fraction += (snowRenderer ? 110 : 76) * settings.intensity / 100 * dt * Math.min(1.5, width / 1450);
    while (fraction >= 1) {
      fraction--;
      if (particles.length < budget) particles.push(spawnFlake());
    }
  }
  const byId = new Map(rectangles.map(rect => [rect.id, rect]));
  const wind = settings.wind * 0.62;
  particles = particles.filter(p => {
    const x0 = p.x, y0 = p.y;
    const motion = snowStep(p.phase, p.rate, p.sway, p.fall, wind + p.vx, dt);
    p.phase = motion.phase;
    p.x += motion.dx;
    p.y += motion.dy;
    p.swayVelocity = motion.vx;
    p.vy = motion.vy;
    const hit = p.foreground ? null : landing(rectangles, x0, y0, p.x, p.y, settings.taskbar);
    if (hit) { addPile(hit); return false; }
    if (y0 <= height && p.y >= height) {
      addPile({ rect: ground.rect, x: p.x }, 1.25);
      return false;
    }
    if (p.x < -24) p.x = width + 23;
    else if (p.x > width + 24) p.x = -23;
    return p.y < height + 28;
  });
  const trail = [];
  accents = accents.filter(p => {
    if (p.kind === 'santa') {
      p.age += dt;
      const t = Math.min(1, p.age / p.duration);
      p.x = -170 + (width + 340) * t;
      p.y = height * (.42 - .28 * Math.sin(Math.PI * t) + .062 * Math.sin(4 * Math.PI * t));
      p.tilt = Math.atan2(height * (-.28 * Math.PI * Math.cos(Math.PI * t) +
        .248 * Math.PI * Math.cos(4 * Math.PI * t)), width + 340);
      if (p.x > 24 && p.x < width - 24 && p.age >= p.nextGift && gifts.length < 24) {
        gifts.push({ x: p.x - 20, y: p.y + 14, vx: 76, vy: 18, spin: 0,
          color: ['#ba354e', '#3d8b6c', '#4368a7'][gifts.length % 3] });
        p.nextGift = p.age + Math.max(.7, p.duration / 6);
      }
      if (Math.random() < dt * 37) trail.push({
        kind: 'magic', x: p.x - 47, y: p.y + 7, vx: random(-65, -18), vy: random(-45, 6),
        life: random(.38, .9), size: random(.7, 2.4),
      });
      return t < 1;
    }
    if (p.deposit !== undefined) {
      const x0 = p.x, y0 = p.y;
      p.vy += dt * 420;
      p.x = Math.max(0, Math.min(width - 0.01, p.x + p.vx * dt));
      p.y += p.vy * dt;
      const hit = landing(rectangles, x0, y0, p.x, p.y, settings.taskbar);
      const surface = hit ?? (p.y >= height ? { rect: ground.rect, x: p.x } : null);
      if (!surface) return true;
      addPile(surface, p.deposit / 3.42);
      return false;
    }
    p.life -= dt;
    if (p.vx !== undefined) {      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += dt * 195;
    }
    return p.life > 0 && p.y < height + 60;
  });
  accents.push(...trail);
  updateSnowProps(dt, byId);
  updateGifts(dt, byId);
}

function updateGifts(dt, byId) {
  for (const gift of gifts) {
    if (gift.support) {
      const support = gift.support === 'ground' ? ground.rect : byId.get(gift.support);
      if (support && (!support.taskbar || settings.taskbar)) {
        gift.x = support.left + gift.offset;
        gift.y = support.top - 8;
        if (gift.x >= support.left && gift.x <= support.right) continue;
      }
      gift.support = null;
    }
    const oldX = gift.x, oldBottom = gift.y + 8;
    gift.vy += dt * 395;
    gift.x += gift.vx * dt;
    gift.y += gift.vy * dt;
    gift.spin += dt * 2;
    const hit = landing(rectangles, oldX, oldBottom, gift.x, gift.y + 8, settings.taskbar);
    const support = hit?.rect ?? (gift.y + 8 >= height ? ground.rect : null);
    if (!support) continue;
    gift.y = support.top - 8;
    if (gift.vy > 100) {
      gift.vy *= -.34;
      gift.vx *= .58;
    } else {
      gift.support = support.id;
      gift.offset = gift.x - support.left;
      gift.vx = gift.vy = 0;
    }
  }
  gifts = gifts.filter(gift => gift.x > -40 && gift.x < width + 40);
}

function anchorAt(point) {
  const rect = rectangles.find(rect => !rect.taskbar && point.x >= rect.left &&
    point.x < rect.right && point.y >= rect.top - 6 && point.y < rect.bottom);
  return rect ? { id: rect.id, x: point.x - rect.left, y: point.y - rect.top } : { x: point.x, y: point.y };
}

function resolveAnchor(anchor) {
  if (!anchor.id) return anchor;
  const rect = rectangles.find(rect => rect.id === anchor.id);
  return rect && { x: rect.left + anchor.x, y: rect.top + anchor.y };
}

function cancelPlacement() {
  placement = undefined;
  capturePointer(false);
}

function updatePointer(next, elapsed) {
  const clicked = next.pressed && !mouse.pressed;
  if (placement) {
    if (performance.now() > placement.deadline) {
      cancelPlacement();
      return;
    }
    const inside = next.x >= 0 && next.x < width && next.y >= 0 && next.y < height;
    capturePointer(inside);
    if (!inside || !clicked) return;
    const anchor = anchorAt(next);
    placement.deadline = performance.now() + 25000;
    if (placement.kind === 'tree') {
      trees.push({ anchor, color: placement.color });
      if (trees.length > 16) trees.shift();
      cancelPlacement();
    } else if (placement.start) {
      const a = resolveAnchor(placement.start);
      if (!a || Math.hypot(a.x - next.x, a.y - next.y) < 18) return;
      garlands.push({ a: placement.start, b: anchor, color: placement.color, rope: makeRope(a, next) });
      if (garlands.length > 24) garlands.shift();
      if (next.control) placement.start = anchor;
      else cancelPlacement();
    } else placement.start = anchor;
    return;
  }
  const dx = next.x - mouse.x;
  if (!next.pressed) {
    for (const garland of garlands) {
      if (resolveAnchor(garland.a) && resolveAnchor(garland.b)) brushRope(garland.rope, mouse, next);
    }
  }
  if (heldTree) {
    const { tree, offset } = heldTree;
    const point = { x: next.x + offset.x, y: next.y + offset.y };
    tree.anchor = next.pressed ? point : anchorAt(point);
    if (next.pressed) {
      const target = Math.max(-.28, Math.min(.28, -dx / elapsed * .001));
      tree.leanTarget = target;
    }
    if (!next.pressed) {
      tree.leanTarget = 0;
      heldTree = undefined;
      capturePointer(false);
    }
    return;
  }
  if (!grabbed && (!next.pressed || clicked)) {
    const tree = trees.findLast(candidate => {
      const point = resolveAnchor(candidate.anchor);
      if (!point) return false;
      const fromBase = point.y - next.y;
      return fromBase >= 0 && fromBase <= 115 &&
        Math.abs(point.x - next.x) < Math.max(10, 42 * (1 - fromBase / 122));
    });
    if (tree) {
      capturePointer(true);
      if (clicked) {
        const point = resolveAnchor(tree.anchor);
        heldTree = { tree, offset: { x: point.x - next.x, y: point.y - next.y } };
      }
      return;
    }
  }
  const gift = gifts.findLast(item => item.support && Math.abs(item.x - next.x) < 12 &&
    next.y > item.y - 17 && next.y < item.y + 10);
  if (gift && !grabbed) {
    capturePointer(true);
    if (clicked) {
      gifts.splice(gifts.indexOf(gift), 1);
      for (let i = 0; i < 24; i++) accents.push({
        kind: 'magic', x: gift.x, y: gift.y, vx: random(-125, 125), vy: random(-205, -48),
        life: random(.55, 1.05), size: random(.8, 2.5),
      });
      capturePointer(false);
    }
    return;
  }
  updateBallPointer(next, elapsed);
}

function paintDecor(now, dt) {
  for (const garland of garlands) {
    const a = resolveAnchor(garland.a), b = resolveAnchor(garland.b);
    if (!a || !b) continue;
    stepRope(garland.rope, a, b, dt);
    drawGarland(ctx, a, b, garland.color, now, false, garland.rope.nodes);
  }
  for (const tree of trees) {
    const point = resolveAnchor(tree.anchor);
    tree.tilt ??= 0;
    tree.velocity = ((tree.velocity ?? 0) + ((tree.leanTarget ?? 0) - tree.tilt) * 47 * dt) * Math.exp(-4.1 * dt);
    tree.tilt = Math.max(-.34, Math.min(.34, tree.tilt + tree.velocity * dt));
    if (point) drawTree(ctx, point.x, point.y, tree.color, now, tree.tilt);
  }
  for (const gift of gifts) drawGift(ctx, gift);
  if (!placement || mouse.x < 0 || mouse.y < 0 || mouse.x >= width || mouse.y >= height) return;
  const start = placement.start && resolveAnchor(placement.start);
  if (start) drawGarland(ctx, start, mouse, placement.color, now, true);
  if (placement.kind === 'tree') drawTree(ctx, mouse.x, mouse.y, placement.color, now);
  const label = placement.kind === 'tree' ? 'Click to place the tree' :
    placement.start ? 'Ctrl+click: add · Click: finish' : 'Click to attach the first end';
  ctx.fillStyle = '#122a23';
  ctx.fillRect(Math.min(mouse.x + 10, width - 200), Math.max(0, mouse.y - 33), 188, 24);
  ctx.font = '12px Segoe UI';
  ctx.fillStyle = '#ecfff1';
  ctx.fillText(label, Math.min(mouse.x + 18, width - 192), Math.max(16, mouse.y - 17));
}

function updatePileRaster(pile, now) {
  const { rect, profile } = pile;
  const rasterWidth = Math.ceil(rect.right - rect.left);
  if (rasterWidth < 1) return null;
  const cache = pile.raster ??= { canvas: document.createElement('canvas') };
  const resized = cache.width !== rasterWidth || cache.profile?.length !== profile.length;
  if (!resized && now - cache.updatedAt < 90) return cache;
  if (!resized && !profile.some((depth, i) => depth !== cache.profile[i])) return cache;

  const maxDepth = Math.max(5, ...profile);
  const rasterHeight = Math.max(24, Math.ceil(maxDepth) + 2);
  const surface = cache.canvas;
  if (surface.width !== rasterWidth) surface.width = rasterWidth;
  if (surface.height !== rasterHeight) surface.height = rasterHeight;
  const paint = surface.getContext('2d');
  const baseline = rasterHeight - 1;
  paint.clearRect(0, 0, rasterWidth, rasterHeight);
  const gradient = paint.createLinearGradient(0, baseline - maxDepth, 0, baseline + 1);
  gradient.addColorStop(0, '#fbfdff');
  gradient.addColorStop(0.55, '#e8eef9');
  gradient.addColorStop(1, '#c0cfe7');
  paint.beginPath();
  paint.moveTo(0, baseline);
  for (let i = 0; i < profile.length; i++) {
    const x = Math.min(rasterWidth, (i + 0.5) * column);
    const nextX = Math.min(rasterWidth, (i + 1) * column);
    paint.quadraticCurveTo(x, baseline - profile[i], nextX,
      baseline - (profile[i] + (profile[i + 1] ?? 0)) / 2);
  }
  paint.lineTo(rasterWidth, baseline);
  paint.closePath();
  paint.fillStyle = gradient;
  paint.fill();
  if (snowGrain) {
    paint.fillStyle = snowGrain;
    paint.fill();
  }
  cache.width = rasterWidth;
  cache.baseline = baseline;
  cache.profile = profile.slice();
  cache.updatedAt = now;
  return cache;
}

function paintProfile(pile, covers, now) {
  const { rect, profile } = pile;
  if (!profile.some(depth => depth > 0.05)) return;
  const raster = updatePileRaster(pile, now);
  if (!raster) return;
  const top = rect.top - raster.baseline;
  ctx.save();
  for (const cover of covers) {
    if (cover.right <= rect.left || cover.left >= rect.right || cover.bottom <= top || cover.top >= rect.top + 1) continue;
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.rect(cover.left, cover.top, cover.right - cover.left, cover.bottom - cover.top);
    ctx.clip('evenodd');
  }
  ctx.drawImage(raster.canvas, rect.left, top);
  ctx.restore();
}

function paintPiles(now) {
  paintProfile(ground, taskbars, now);
  const visible = new Set(rectangles.map(rect => rect.id));
  for (const [id, pile] of piles) {
    if (!visible.has(id)) paintProfile(pile, rectangles, now);
  }
  rectangles.forEach((rect, z) => {
    const pile = piles.get(rect.id);
    if (pile) paintProfile(pile, rectangles.slice(0, z), now);
  });
}

function stackRoot(ball) {
  while (ball.stack) ball = ball.stack;
  return ball;
}

function stackMembers(root) {
  const members = [root];
  let top = root;
  while ((top = balls.find(ball => ball.stack === top && !ball.broken))) members.push(top);
  return members;
}

function alignStack(root) {
  const members = stackMembers(root);
  for (let i = 1; i < members.length; i++) {
    const base = members[i - 1];
    const ball = members[i];
    ball.x = base.x;
    ball.y = base.y - base.size - ball.size + 2;
    ball.support = root.support;
  }
}

function updateSnowProps(dt, byId) {
  if (plough) {
    plough.x -= 245 * dt;
    for (const pile of [ground, ...piles.values()]) {
      if (pile !== ground && !pile.rect.taskbar) continue;
      const edge = Math.floor((plough.x - 26 - pile.rect.left) / column);
      for (let i = edge; i <= edge + 6; i++) {
        if (i < 0 || i >= pile.profile.length || pile.profile[i] < 0.3) continue;
        const depth = pile.profile[i];
        pile.profile[i] = 0;
        plough.heap[0] += depth * column / 3;
        accents.push({
          kind: 'chunk', x: pile.rect.left + i * column, y: pile.rect.top - depth,
          vx: random(-165, -35), vy: random(-105, -30), size: random(1, 4), life: 0.6,
        });
      }
    }
    // Transfer mass away from the blade whenever adjacent columns exceed a stable slope.
    const heap = plough.heap;
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < heap.length - 1; i++) {
        const flow = Math.max(0, heap[i] - heap[i + 1] - 2.4) * Math.min(.42, dt * 20);
        heap[i] -= flow;
        heap[i + 1] += flow;
      }
    }
    if (heap[heap.length - 1] > 1.6) {
      const amount = Math.min(heap[heap.length - 1], dt * 24);
      heap[heap.length - 1] -= amount;
      releaseSnow(plough.x - 30 - heap.length * 3, height - amount - 2, amount, -120, -35);
    }
    if (plough.x < -80) plough = undefined;
  }
  for (const ball of balls) {
    if (ball === grabbed) continue;
    if (ball.stack) {
      if (balls.includes(ball.stack)) continue;
      ball.stack = null;
      ball.support = null;
    }
    if (ball.support) {
      const rect = ball.support === 'ground' ? ground.rect : byId.get(ball.support);
      if (rect && (!rect.taskbar || settings.taskbar)) {
        ball.x += rect.left - ball.previousSupport.left;
        ball.y = rect.top - ball.size;
        ball.previousSupport = rect;
        ball.x += ball.vx * dt;
        if (!balls.some(part => part.stack === ball)) {
          ball.rotation = (ball.rotation ?? 0) + ball.vx * dt / ball.size;
        }
        ball.vx *= Math.exp(-dt * 1.9);
        if (ball.x >= rect.left + ball.size * 0.28 && ball.x <= rect.right - ball.size * 0.28) continue;
      }
      ball.support = null;
      ball.vy = 35;
    }
    const oldX = ball.x;
    const oldBottom = ball.y + ball.size;
    ball.vy += dt * 510;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    const hit = landing(rectangles, oldX, oldBottom, ball.x, ball.y + ball.size, settings.taskbar);
    const members = stackMembers(ball);
    const base = members.length === 1 && balls.find(other => other !== ball && !other.broken &&
      stackRoot(other) !== grabbed && other.support &&
      !other.stack?.stack &&
      !balls.some(child => child.stack === other) && Math.abs(other.x - ball.x) < other.size * 0.72 &&
      oldBottom <= other.y - other.size + 2 && ball.y + ball.size >= other.y - other.size + 2);
    if (base && Math.hypot(ball.vx, ball.vy) < 300) {
      ball.stack = base;
      ball.support = base.support;
      ball.x = base.x;
      ball.y = base.y - base.size - ball.size + 2;
      ball.vx = ball.vy = 0;
      continue;
    }
    const support = hit?.rect ?? (ball.y + ball.size >= height ? ground.rect : null);
    if (support) {
      ball.y = support.top - ball.size;
      ball.x = Math.max(ball.size * 0.35, Math.min(width - ball.size * 0.35, ball.x));
      const impactSpeed = Math.hypot(ball.vx * 0.65, ball.vy);
      if (ball.thrown && impactSpeed > (members.length > 1 ? 265 : 330)) {
        alignStack(ball);
        for (const part of members) {
          addPile({ rect: support, x: hit?.x ?? ball.x }, part.size * 0.33);
          for (let n = 0; n < 16; n++) {
            releaseSnow(part.x, part.y + part.size * 0.4, random(0.25, 1.5),
              ball.vx * 0.25 + random(-155, 155), random(-210, -45));
          }
          part.broken = true;
        }
        continue;
      }
      if (ball.vy > 105) {
        ball.vy *= -0.27;
        ball.vx *= 0.76;
      } else {
        ball.support = support.id;
        ball.previousSupport = support;
        ball.vy = 0;
      }
    }
  }
  balls = balls.filter(ball => {
    const root = stackRoot(ball);
    return !ball.broken && root.x >= -80 && root.x <= width + 80;
  });
  for (const ball of balls) if (!ball.stack) alignStack(ball);
}

function capturePointer(value) {
  if (capturing === value) return;
  capturing = value;
  wintermas.snowballPointer(value);
}

function snowAt(point, tolerance = 2) {
  const surfaces = [...rectangles.map(rect => piles.get(rect.id)), ground];
  for (const pile of surfaces) {
    if (pile?.kind !== 'snow') continue;
    const index = Math.floor((point.x - pile.rect.left) / column);
    const depth = pile.profile[index];
    if (depth >= 1 && point.y < pile.rect.top + (tolerance > 2 ? 4 : 0) &&
        point.y >= pile.rect.top - depth - tolerance) {
      return { pile, index };
    }
  }
  return null;
}

function rollOnSnow(ball, point, travel) {
  const radius = Math.min(30, ball.size);
  const contact = snowAt({ x: point.x, y: point.y + radius - 1 }, 7) ?? snowAt(point, 7);
  if (!contact || travel < 0.1) return;
  const { pile, index } = contact;
  const reach = Math.ceil(radius / column);
  let gathered = 0;
  for (let i = Math.max(0, index - reach); i <= Math.min(pile.profile.length - 1, index + reach); i++) {
    const amount = Math.min(pile.profile[i], travel * 0.16 * (1 - Math.abs(i - index) / (reach + 1)));
    pile.profile[i] -= amount;
    gathered += amount * column;
  }
  ball.size = Math.min(34, Math.sqrt(ball.size ** 2 + gathered * 0.85));
  ball.y = pile.rect.top - ball.size + 1;
}

function updateBallPointer(next, dt) {

  const hovered = balls.findLast(ball => Math.hypot(ball.x - next.x, ball.y - next.y) <= ball.size + 3);
  const snow = snowAt(next);
  if (!next.pressed || grabbed) capturePointer(Boolean(grabbed || hovered || snow));
  if (next.pressed && !mouse.pressed && (hovered || snow)) {
    const root = hovered && stackRoot(hovered);
    const assembled = root && stackMembers(root).length >= 3;
    grabbed = assembled ? root : hovered;
    if (!grabbed) {
      const { pile, index } = snow;
      pile.profile[index] -= Math.min(1, pile.profile[index]);
      grabbed = { x: next.x, y: pile.rect.top - 6, size: 6, rotation: 0 };
      balls.push(grabbed);
      if (balls.length > 24) balls.shift();
    }
    grabOffset = assembled ? { x: grabbed.x - next.x, y: grabbed.y - next.y } : { x: 0, y: 0 };
    Object.assign(grabbed, { support: null, stack: null, vx: 0, vy: 0, thrown: false });
    return;
  }
  if (!grabbed) {
    if (next.pressed || mouse.pressed) return;
    const dx = next.x - mouse.x;
    if (Math.abs(dx) < 0.4) return;
    for (const ball of balls) {
      if (!ball.support || ball.stack || stackMembers(ball).length > 1) continue;
      const oldSide = mouse.x - ball.x;
      const side = next.x - ball.x;
      const rim = ball.size + 3;
      if (Math.abs(next.y - ball.y) > ball.size * 0.73 ||
          (dx > 0 ? oldSide > -rim || side < -rim : oldSide < rim || side > rim)) continue;
      ball.vx = dx > 0 ? Math.min(360, Math.max(45, dx / dt * 0.62)) :
        -Math.min(360, Math.max(45, -dx / dt * 0.62));
    }
    return;
  }
  if (!next.pressed) {
    const ball = grabbed;
    const bottom = ball.y + ball.size;
    const slow = Math.hypot(ball.vx, ball.vy) < 175;
    const aboveBall = balls.some(other => stackRoot(other) !== ball && other.support &&
      Math.abs(other.x - ball.x) < other.size * 0.72 &&
      Math.abs(bottom - (other.y - other.size)) < 16);
    const support = slow && !aboveBall && landing([...rectangles, ground.rect], ball.x, bottom - 12,
      ball.x, bottom + 16, settings.taskbar)?.rect;
    if (support && ball.x > support.left && ball.x < support.right) {
      Object.assign(ball, { support: support.id, previousSupport: support,
        y: support.top - ball.size, vx: 0, vy: 0, thrown: false });
      alignStack(ball);
    } else ball.thrown = true;
    grabbed = undefined;
    capturePointer(Boolean(hovered || snow));
    return;
  }
  const clamp = value => Math.max(-1600, Math.min(1600, value));
  grabbed.vx = grabbed.vx * 0.5 + clamp((next.x - mouse.x) / dt) * 0.5;
  grabbed.vy = grabbed.vy * 0.5 + clamp((next.y - mouse.y) / dt) * 0.5;
  grabbed.x = next.x + grabOffset.x;
  grabbed.y = next.y + grabOffset.y;
  grabbed.rotation = (grabbed.rotation ?? 0) + (next.x - mouse.x) / grabbed.size;
  if (stackMembers(grabbed).length === 1) {
    rollOnSnow(grabbed, next, Math.hypot(next.x - mouse.x, next.y - mouse.y));
  } else alignStack(grabbed);
}

function paintSnowProps(now) {
  for (const ball of balls) {
    drawBall(ctx, ball.x, ball.y, ball.size, ball.rotation);
  }
  for (const head of balls) {
    if (head.stack?.stack && !head.stack.stack.stack) drawSnowman(ctx, head, head.stack);
  }
  if (plough) drawPlough(ctx, plough.x, height - 3, plough.heap, snowGrain, now);
}

// Paint flake sprites once. The soft edge keeps distant flakes from reading as white dots.
const flakeSprite = document.createElement('canvas');
flakeSprite.width = flakeSprite.height = 32;
const flakeContext = flakeSprite.getContext('2d');
const flakeLight = flakeContext.createRadialGradient(15, 14, 0, 16, 16, 16);
flakeLight.addColorStop(0, '#f9fcff');
flakeLight.addColorStop(0.43, '#eaf2ffdb');
flakeLight.addColorStop(0.75, '#d5e3fa57');
flakeLight.addColorStop(1, '#c6dbfb00');
flakeContext.fillStyle = flakeLight;
flakeContext.fillRect(0, 0, 32, 32);

function paintParticle(p, now) {
  const { x, y, size, kind } = p;
  ctx.globalAlpha = p.alpha ?? Math.min(1, p.life * 2.5);
  if (kind === 'snow' || kind === 'chunk') {
    const span = size * 2.9;
    const tail = kind === 'snow' ? Math.min(size * 1.25, p.vy * 0.013) : 0;
    const offset = Math.max(-1.5, Math.min(1.5, (p.swayVelocity ?? 0) * .013));
    ctx.drawImage(flakeSprite, x - span / 2 - offset, y - span / 2 - tail, span, span + tail);
  } else if (kind === 'magic') {
    ctx.fillStyle = '#ffd989';
    ctx.beginPath();
    ctx.moveTo(x - size * 1.9, y); ctx.lineTo(x, y - size * .42);
    ctx.lineTo(x + size * 1.9, y); ctx.lineTo(x, y + size * .42); ctx.fill();
    ctx.fillRect(x - .45, y - size * 1.75, .9, size * 3.5);
  } else if (kind === 'santa') {
    drawSanta(ctx, x, y, now, p.tilt ?? 0);
  }
  ctx.globalAlpha = 1;
}

function paintSnowFallback() {
  ctx.fillStyle = '#eaf3ff';
  for (let band = 0; band < 4; band++) {
    ctx.globalAlpha = (band + 1) * .19;
    ctx.beginPath();
    for (const flake of particles) {
      if (Math.min(3, Math.floor(flake.alpha * 5)) !== band) continue;
      const radius = Math.max(.58, flake.size * .84);
      ctx.moveTo(flake.x + radius, flake.y);
      ctx.arc(flake.x, flake.y, radius, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function frame() {
  const now = performance.now();
  const interval = 1000 / 60;
  if (settings.paused && !particles.length && !accents.length && !balls.length && !gifts.length &&
      !placement && !plough && !garlands.length && !trees.length && !piles.size &&
      !ground.profile.some(Boolean)) {
    // Clear the last animation frame once, then avoid sending empty frames to DWM.
    if (previous !== undefined || !document.documentElement.dataset.rendered) {
      ctx.clearRect(0, 0, width, height);
      snowRenderer?.draw([], rectangles, settings.taskbar);
      sceneVisible = false;
      document.documentElement.dataset.rendered = 'true';
    }
    previous = undefined;
    nextFrame = undefined;
    frameRequest = setTimeout(frame, 80);
    return;
  }
  // The transparent overlay can receive compositor callbacks at an unrelated cadence.
  nextFrame = nextFrame === undefined || now - nextFrame >= interval
    ? now + interval : nextFrame + interval;
  const dt = Math.min(0.045, (now - (previous ?? now)) / 1000);
  previous = now;
  updateParticles(dt);
  snowRenderer?.draw(particles, rectangles, settings.taskbar);
  const sceneNeeded = !snowRenderer && particles.length || accents.length || balls.length ||
    gifts.length || placement || plough || garlands.length || trees.length || piles.size ||
    ground.profile.some(Boolean);
  const fastScene = !snowRenderer && particles.length || grabbed || heldTree || plough ||
    accents.length || balls.some(ball => !ball.support || Math.abs(ball.vx) > 1) ||
    gifts.some(gift => !gift.support) || garlands.some(garland => garland.rope.active > 0) ||
    trees.some(tree => Math.abs(tree.tilt ?? 0) > .003 || Math.abs(tree.velocity ?? 0) > .02);
  if (sceneNeeded && (fastScene || previousScene === undefined || now - previousScene >= 32)) {
    const sceneDt = Math.min(.08, (now - (previousScene ?? now)) / 1000);
    previousScene = now;
    drawScene(now, sceneDt);
    sceneVisible = true;
  } else if (!sceneNeeded && sceneVisible) {
    ctx.clearRect(0, 0, width, height);
    sceneVisible = false;
    previousScene = undefined;
  }
  if (!document.documentElement.dataset.rendered) document.documentElement.dataset.rendered = 'true';
  frameRequest = setTimeout(frame, Math.max(0, nextFrame - performance.now()));
}

function drawScene(now, dt) {
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  if (!settings.taskbar) {
    for (const rect of rectangles) {
      if (!rect.taskbar) continue;
      ctx.beginPath();
      ctx.rect(0, 0, width, height);
      ctx.rect(rect.left, rect.top - 1, rect.right - rect.left, rect.bottom - rect.top + 1);
      ctx.clip('evenodd');
    }
  }
  paintPiles(now);
  if (!snowRenderer && particles.length) paintSnowFallback();
  for (const p of accents) paintParticle(p, now);
  paintSnowProps(now);
  paintDecor(now, dt);
  ctx.restore();
}
wintermas.onDesktop(desktop);
wintermas.onSettings(configure);
wintermas.onAction(action => {
  if (action?.placement === 'garland' || action?.placement === 'tree') {
    placement = { kind: action.placement, color: action.color, deadline: performance.now() + 25000 };
    return;
  }
  if (action === 'decor-cancel' || action === 'decor-reset') {
    cancelPlacement();
    if (action === 'decor-reset') {
      heldTree = undefined;
      garlands.length = trees.length = 0;
      gifts = [];
    }
  } else if (action === 'reset') {
    piles.clear();
    ground.profile.fill(0);
    ground.raster = undefined;
    particles = [];
    accents = [];
    balls = [];
    gifts = [];
    grabbed = undefined;
    plough = undefined;
    fraction = 0;
    cancelPlacement();
  } else if (action === 'clear') {
    if (plough) return;
    plough = { x: width + 70, heap: new Float32Array(34) };
  } else if (action === 'santa') {
    accents.push({ kind: 'santa', x: -170, y: height * .42, age: 0,
      duration: (width + 340) / 230, nextGift: 0, alpha: 1 });
  } else if (action === 'gather') {
    const pile = [...piles.values(), ground].find(candidate =>
      mouse.x >= candidate.rect.left && mouse.x < candidate.rect.right &&
      Math.abs(candidate.rect.top - mouse.y) < 52 && candidate.kind === 'snow');
    if (!pile) return;
    const center = Math.floor((mouse.x - pile.rect.left) / column);
    const first = Math.max(0, center - 4);
    const end = Math.min(pile.profile.length, center + 5);
    const gathered = pile.profile.slice(first, end).reduce((sum, depth) => sum + depth, 0);
    if (gathered < 3) return;
    for (let i = first; i < end; i++) pile.profile[i] *= .35;
    const size = Math.max(10, Math.min(26, Math.sqrt(gathered) * 3.8));
    balls.push({ x: mouse.x, y: pile.rect.top - size, size, vx: 0, vy: 0,
      support: pile.rect.id, previousSupport: pile.rect });
  } else if (action === 'snowball') {
    const ledge = rectangles.find(rect => !rect.taskbar && rect.top > height * 0.18 && rect.right - rect.left > 140);
    const x = ledge ? (Math.max(0, ledge.left) + Math.min(width, ledge.right)) / 2 : width * 0.45;
    const y = (ledge?.top ?? height * 0.72) - 95;
    balls.push({ x, y, size: random(16, 23), vx: random(-22, 22), vy: -15 });
  }
  if (balls.length > 24) balls.splice(balls.findIndex(ball => ball !== grabbed), 1);
});
wintermas.settings().then(configure).catch(console.error);
addEventListener('resize', resize);
resize();
document.documentElement.dataset.ready = 'true';




