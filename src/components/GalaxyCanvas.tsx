import { useEffect, useMemo, useRef, useState } from 'react';
import type { StarSystem } from '../game/types';

interface Props {
  systems: StarSystem[];
  currentSystemId: string;
  selectedSystemId: string | null;
  jumpRange: number;
  onSelect(id: string): void;
}

export function GalaxyCanvas({ systems, currentSystemId, selectedSystemId, jumpRange, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState({ x: 0, y: 0, zoom: 0.72 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const current = useMemo(() => systems.find((system) => system.id === currentSystemId), [systems, currentSystemId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * ratio));
      canvas.height = Math.max(1, Math.floor(rect.height * ratio));
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      draw();
    };
    const toScreen = (system: StarSystem) => ({
      x: canvas.clientWidth / 2 + (system.coordinates.x + view.x) * view.zoom,
      y: canvas.clientHeight / 2 + (system.coordinates.y + view.y) * view.zoom
    });
    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      ctx.clearRect(0, 0, width, height);
      const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, 10, width * 0.5, height * 0.5, Math.max(width, height));
      gradient.addColorStop(0, '#0c1b27');
      gradient.addColorStop(1, '#03080d');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(75, 137, 164, .08)';
      ctx.lineWidth = 1;
      for (let gx = -1000; gx <= 1000; gx += 100) {
        const sx = width / 2 + (gx + view.x) * view.zoom;
        ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke();
      }
      for (let gy = -1000; gy <= 1000; gy += 100) {
        const sy = height / 2 + (gy + view.y) * view.zoom;
        ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(width, sy); ctx.stroke();
      }
      if (current) {
        const p = toScreen(current);
        ctx.setLineDash([7, 6]);
        ctx.strokeStyle = 'rgba(89, 210, 255, .35)';
        ctx.beginPath(); ctx.arc(p.x, p.y, jumpRange * view.zoom, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.strokeStyle = 'rgba(89, 142, 166, .18)';
      for (const system of systems) {
        if (!system.known) continue;
        const a = toScreen(system);
        for (const id of system.neighbors) {
          const neighbor = systems.find((entry) => entry.id === id);
          if (!neighbor?.known || neighbor.id < system.id) continue;
          const b = toScreen(neighbor);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      for (const system of systems) {
        if (!system.known) continue;
        const p = toScreen(system);
        if (p.x < -20 || p.y < -20 || p.x > width + 20 || p.y > height + 20) continue;
        const selected = system.id === selectedSystemId;
        const active = system.id === currentSystemId;
        const radius = active ? 7 : selected ? 6 : system.region === 'core' ? 4 : 3;
        ctx.shadowBlur = active || selected ? 18 : 8;
        ctx.shadowColor = system.anomaly ? '#d28cff' : active ? '#62e8ff' : '#5ea3c6';
        ctx.fillStyle = system.anomaly ? '#d28cff' : active ? '#e8fcff' : system.danger === 'extreme' ? '#ff5d68' : system.danger === 'danger' ? '#ff9d55' : '#7dc6df';
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        if ((selected || active || view.zoom > 1.1) && system.known) {
          ctx.font = '11px Inter, sans-serif';
          ctx.fillStyle = active ? '#eaffff' : '#9bb5c3';
          ctx.fillText(system.name, p.x + 9, p.y - 8);
        }
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((old) => ({ ...old, zoom: Math.max(0.25, Math.min(2.8, old.zoom * (event.deltaY > 0 ? 0.9 : 1.1))) }));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => { observer.disconnect(); canvas.removeEventListener('wheel', onWheel); };
  }, [systems, currentSystemId, selectedSystemId, jumpRange, view, current]);

  const findSystem = (clientX: number, clientY: number): StarSystem | undefined => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return systems.filter((system) => system.known).find((system) => {
      const sx = canvas.clientWidth / 2 + (system.coordinates.x + view.x) * view.zoom;
      const sy = canvas.clientHeight / 2 + (system.coordinates.y + view.y) * view.zoom;
      return Math.hypot(sx - x, sy - y) < 13;
    });
  };

  return <canvas
    ref={canvasRef}
    className="galaxy-canvas"
    onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }; event.currentTarget.setPointerCapture(event.pointerId); }}
    onPointerMove={(event) => {
      if (!drag.current) return;
      const dx = (event.clientX - drag.current.x) / view.zoom;
      const dy = (event.clientY - drag.current.y) / view.zoom;
      setView((old) => ({ ...old, x: drag.current!.vx + dx, y: drag.current!.vy + dy }));
    }}
    onPointerUp={(event) => {
      const d = drag.current;
      drag.current = null;
      if (d && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 6) {
        const system = findSystem(event.clientX, event.clientY);
        if (system) onSelect(system.id);
      }
    }}
  />;
}
