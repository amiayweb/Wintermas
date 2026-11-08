const palettes = {
  classic: ['#ff7569', '#ffd377', '#70e7a5', '#82b9ff'],
  warm: ['#ffe2a1', '#fff6db'],
  ice: ['#8edfff', '#b6b4ff', '#ecfbff'],
  holly: ['#ff665e', '#72e7a5'],
};

function lights(color) {
  if (typeof color !== 'string') return palettes.classic;
  if (Object.hasOwn(palettes, color)) return palettes[color];
  return /^#[0-9a-f]{6}$/i.test(color) ? [color] : palettes.classic;
}

const bulbSprites = new Map();
function bulb(ctx, x, y, color, pulse, size = 2.8) {
  let sprite = bulbSprites.get(color);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const paint = sprite.getContext('2d');
    const glow = paint.createRadialGradient(16, 16, 1, 16, 16, 15);
    glow.addColorStop(0, color);
    glow.addColorStop(.27, color + 'a0');
    glow.addColorStop(1, color + '00');
    paint.fillStyle = glow;
    paint.fillRect(0, 0, 32, 32);
    paint.fillStyle = color;
    paint.beginPath(); paint.ellipse(16, 16, 4, 5, 0, 0, Math.PI * 2); paint.fill();
    paint.fillStyle = '#fff7db'; paint.fillRect(15, 13, 2, 3);
    if (bulbSprites.size >= 32) bulbSprites.delete(bulbSprites.keys().next().value);
    bulbSprites.set(color, sprite);
  }
  const extent = size * 4.5;
  ctx.globalAlpha = pulse;
  ctx.drawImage(sprite, x - extent, y - extent, extent * 2, extent * 2);
  ctx.globalAlpha = 1;
}

export function drawGarland(ctx, a, b, color, now, preview = false, nodes) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const sag = Math.min(160, length * .28);
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2 + sag;
  ctx.save();
  ctx.strokeStyle = preview ? '#9ce2bc' : '#18392b';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(a.x, a.y);
  if (nodes) {
    for (let i = 1; i < nodes.length - 1; i++) {
      const p = nodes[i], next = nodes[i + 1];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + next.x) / 2, (p.y + next.y) / 2);
    }
    ctx.lineTo(b.x, b.y);
  } else ctx.quadraticCurveTo(midX, midY, b.x, b.y);
  ctx.stroke();
  const colors = lights(color);
  const count = nodes ? nodes.length - 1 : Math.max(1, Math.min(64, Math.floor(length / 17)));
  for (let i = 0; i < count; i++) {
    const t = (i + .5) / count, u = 1 - t;
    const x = nodes ? (nodes[i].x + nodes[i + 1].x) / 2 : u * u * a.x + 2 * u * t * midX + t * t * b.x;
    const y = nodes ? (nodes[i].y + nodes[i + 1].y) / 2 : u * u * a.y + 2 * u * t * midY + t * t * b.y;
    ctx.fillStyle = '#28503d'; ctx.fillRect(x - 1, y, 2, 4);
    bulb(ctx, x, y + 5, colors[i % colors.length], .28 + .72 * (.5 + .5 * Math.sin(now / 180 - i * .66)) ** 2);
  }
  ctx.restore();
}

let treeSprite;
function makeTreeSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 208;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.translate(52, 125);
  ctx.fillStyle = '#614332'; ctx.fillRect(-6, -26, 12, 24);
  const pot = ctx.createLinearGradient(-14, 0, 14, 0);
  pot.addColorStop(0, '#712735'); pot.addColorStop(.35, '#bf5356'); pot.addColorStop(1, '#652432');
  ctx.fillStyle = pot;
  ctx.beginPath(); ctx.roundRect(-15, -14, 30, 14, 4); ctx.fill();
  ctx.fillStyle = '#e5b779'; ctx.fillRect(-15, -13, 30, 2);
  const shades = ['#13352c', '#194638', '#235440', '#327052', '#49836a'];
  for (let row = 0; row < 19; row++) {
    const y = -18 - row * 4.55;
    const width = 44 * (1 - row / 21) * (.87 + .13 * Math.cos(row * 1.8));
    for (let branch = -5; branch <= 5; branch++) {
      const x = branch * width / 5;
      const tip = x + (branch < 0 ? -3 : 3);
      const base = y - 8 - (Math.abs(branch) % 3);
      ctx.fillStyle = shades[(row + Math.abs(branch) * 3) % shades.length];
      ctx.beginPath(); ctx.moveTo(x * .54, base);
      ctx.quadraticCurveTo(x * .85, y - 3, tip, y + (Math.abs(branch) % 3) * 1.5);
      ctx.quadraticCurveTo(x * .72, y + 4, x * .47, y + .5); ctx.fill();
      if ((row + branch) % 5 === 0) {
        ctx.strokeStyle = '#d9ede0a0'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x * .85, y - 1); ctx.lineTo(tip, y + 1); ctx.stroke();
      }
    }
  }
  ctx.fillStyle = '#ffe19b';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5 - Math.PI / 2;
    const radius = i % 2 ? 3 : 7;
    const x = Math.cos(a) * radius, y = -109 + Math.sin(a) * radius;
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  return canvas;
}

export function drawTree(ctx, x, y, color, now, tilt = 0) {
  treeSprite ??= makeTreeSprite();
  ctx.save();
  ctx.translate(x, y);
  ctx.drawImage(treeSprite, 0, 220, 208, 36, -52, -15, 104, 18);
  ctx.translate(0, -15);
  ctx.rotate(tilt);
  ctx.translate(0, 15);
  ctx.drawImage(treeSprite, 0, 0, 208, 220, -52, -125, 104, 110);
  const colors = lights(color);
  for (let i = 0; i < 19; i++) {
    const y = -23 - i * 4.1;
    const x = Math.sin(i * 2.28) * (35 - i * 1.53);
    bulb(ctx, x, y, colors[i % colors.length], .45 + .55 * (.5 + .5 * Math.sin(now / 380 + i * 1.1)), 1.9);
  }
  bulb(ctx, 0, -109, '#ffdf8b', .56 + .44 * (.5 + .5 * Math.sin(now / 350)), 3);
  ctx.restore();
}

export function drawGift(ctx, gift) {
  ctx.save();
  ctx.translate(gift.x, gift.y);
  if (!gift.support) ctx.rotate(gift.spin);
  ctx.fillStyle = gift.color;
  ctx.beginPath(); ctx.roundRect(-9, -7, 18, 15, 2); ctx.fill();
  ctx.fillStyle = '#ffe4a1';
  ctx.fillRect(-2, -8, 4, 16); ctx.fillRect(-9, -2, 18, 3);
  ctx.strokeStyle = '#ffe4a1'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.moveTo(0, -7); ctx.quadraticCurveTo(-12, -17, -6, -17);
  ctx.quadraticCurveTo(-3, -17, 0, -7); ctx.quadraticCurveTo(3, -17, 6, -17);
  ctx.quadraticCurveTo(12, -17, 0, -7); ctx.stroke();
  ctx.restore();
}


