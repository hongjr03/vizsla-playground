export function drawWaveform(canvas: HTMLCanvasElement, active: boolean): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }

  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.fillStyle = "#10110f";
  ctx.fillRect(0, 0, rect.width, rect.height);

  ctx.strokeStyle = "rgba(234, 229, 210, 0.16)";
  ctx.lineWidth = 1;
  for (let x = 14; x < rect.width; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, rect.height);
    ctx.stroke();
  }

  const tracks = [
    { y: 18, color: "#c7f464", bits: [0, 1, 0, 1, 1, 0, 1, 0] },
    { y: 46, color: "#13b9a5", bits: [1, 1, 0, 0, 1, 0, 0, 1] },
    { y: 74, color: active ? "#ffb02e" : "#d6cfb8", bits: [0, 0, 1, 1, 0, 1, 1, 0] },
  ];

  for (const track of tracks) {
    const step = rect.width / track.bits.length;
    ctx.strokeStyle = track.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    track.bits.forEach((bit, index) => {
      const x = index * step;
      const y = track.y + (bit ? 0 : 14);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        const prevY = track.y + (track.bits[index - 1] ? 0 : 14);
        ctx.lineTo(x, prevY);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(x + step, y);
    });
    ctx.stroke();
  }
}
