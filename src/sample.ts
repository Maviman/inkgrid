// A procedurally drawn sample scene, so the app ships no borrowed imagery.
import { hash01 } from './core';

export function makeSample(): HTMLCanvasElement {
  const W = 960, H = 720;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;

  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#04060f');
  sky.addColorStop(0.6, '#1a1640');
  sky.addColorStop(1, '#5a2a52');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  for (let i = 0; i < 260; i++) {
    const x = hash01(i * 3) * W, y = hash01(i * 3 + 1) * H * 0.7, r = hash01(i * 3 + 2) ** 3 * 2.2 + 0.4;
    g.fillStyle = `rgba(255,255,255,${0.35 + hash01(i * 9) * 0.65})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  // planet
  const px = W * 0.62, py = H * 0.38, pr = 170;
  const ring = (front: boolean) => {
    g.save();
    g.translate(px, py);
    g.rotate(-0.35);
    g.scale(1, 0.28);
    g.beginPath();
    g.arc(0, 0, pr * 1.75, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    g.lineWidth = 34;
    g.strokeStyle = 'rgba(255,214,150,0.85)';
    g.stroke();
    g.lineWidth = 10;
    g.strokeStyle = 'rgba(255,240,210,0.9)';
    g.beginPath();
    g.arc(0, 0, pr * 1.45, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
    g.stroke();
    g.restore();
  };
  ring(false);
  const body = g.createRadialGradient(px - pr * 0.45, py - pr * 0.5, pr * 0.1, px, py, pr);
  body.addColorStop(0, '#ffe2b0');
  body.addColorStop(0.45, '#e07a3f');
  body.addColorStop(1, '#3a0f2a');
  g.fillStyle = body;
  g.beginPath();
  g.arc(px, py, pr, 0, Math.PI * 2);
  g.fill();
  g.save();
  g.clip();
  for (let b = 0; b < 7; b++) {
    g.fillStyle = `rgba(80,20,30,${0.12 + 0.08 * (b % 2)})`;
    g.fillRect(px - pr, py - pr + b * 48 + 10, pr * 2, 18);
  }
  g.restore();
  ring(true);

  // moon
  const moon = g.createRadialGradient(W * 0.2 - 12, H * 0.2 - 12, 4, W * 0.2, H * 0.2, 46);
  moon.addColorStop(0, '#ffffff');
  moon.addColorStop(1, '#6b78a8');
  g.fillStyle = moon;
  g.beginPath();
  g.arc(W * 0.2, H * 0.2, 46, 0, Math.PI * 2);
  g.fill();

  // ridgelines
  const ridge = (base: number, amp: number, color: string, seed: number) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, H);
    for (let x = 0; x <= W; x += 8) {
      const y = base - amp * (0.5 * Math.sin(x * 0.006 + seed) + 0.3 * Math.sin(x * 0.017 + seed * 2) + 0.2 * hash01(x + seed * 1000));
      g.lineTo(x, y);
    }
    g.lineTo(W, H);
    g.fill();
  };
  ridge(H * 0.78, 90, '#2b1838', 1);
  ridge(H * 0.88, 70, '#140b1e', 4);
  return c;
}
