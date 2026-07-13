import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { StarSystem } from '../game/types';

interface Props {
  systems: StarSystem[];
  currentSystemId: string;
  selectedSystemId: string | null;
  jumpRange: number;
  onSelect(id: string): void;
}

interface ViewState { x: number; y: number; zoom: number; }

export function GalaxyCanvas({ systems, currentSystemId, selectedSystemId, jumpRange, onSelect }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 0.72 });
  const [canvasVersion, setCanvasVersion] = useState(0);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; pointerType: string; panning: boolean } | null>(null);
  const systemIndex = useMemo(() => new Map(systems.map((system) => [system.id, system])), [systems]);
  const current = systemIndex.get(currentSystemId);

  const toScreen = useCallback((system: StarSystem, width: number, height: number) => ({
    x: width / 2 + (system.coordinates.x + view.x) * view.zoom,
    y: height / 2 + (system.coordinates.y + view.y) * view.zoom
  }), [view]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.max(1, Math.floor(width * ratio));
    const pixelHeight = Math.max(1, Math.floor(height * ratio));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(width * 0.5, height * 0.5, 10, width * 0.5, height * 0.5, Math.max(width, height));
    gradient.addColorStop(0, '#0c1b27');
    gradient.addColorStop(1, '#03080d');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(75, 137, 164, .08)';
    ctx.lineWidth = 1;
    for (let gx = -1200; gx <= 1200; gx += 100) {
      const sx = width / 2 + (gx + view.x) * view.zoom;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke();
    }
    for (let gy = -1200; gy <= 1200; gy += 100) {
      const sy = height / 2 + (gy + view.y) * view.zoom;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(width, sy); ctx.stroke();
    }

    if (current) {
      const point = toScreen(current, width, height);
      ctx.setLineDash([7, 6]);
      ctx.strokeStyle = 'rgba(89, 210, 255, .35)';
      ctx.beginPath(); ctx.arc(point.x, point.y, jumpRange * view.zoom, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = 'rgba(89, 142, 166, .18)';
    for (const system of systems) {
      if (!system.known) continue;
      const a = toScreen(system, width, height);
      for (const id of system.neighbors) {
        const neighbor = systemIndex.get(id);
        if (!neighbor?.known || neighbor.id < system.id) continue;
        const b = toScreen(neighbor, width, height);
        if ((a.x < -50 && b.x < -50) || (a.x > width + 50 && b.x > width + 50) || (a.y < -50 && b.y < -50) || (a.y > height + 50 && b.y > height + 50)) continue;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }

    for (const system of systems) {
      if (!system.known) continue;
      const point = toScreen(system, width, height);
      if (point.x < -20 || point.y < -20 || point.x > width + 20 || point.y > height + 20) continue;
      const selected = system.id === selectedSystemId;
      const active = system.id === currentSystemId;
      const radius = active ? 7 : selected ? 6 : system.region === 'core' ? 4 : 3;
      ctx.shadowBlur = active || selected ? 18 : 8;
      ctx.shadowColor = system.anomaly ? '#d28cff' : active ? '#62e8ff' : '#5ea3c6';
      ctx.fillStyle = system.anomaly ? '#d28cff' : active ? '#e8fcff' : system.danger === 'extreme' ? '#ff5d68' : system.danger === 'danger' ? '#ff9d55' : '#7dc6df';
      ctx.beginPath(); ctx.arc(point.x, point.y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (selected || active || view.zoom > 1.1) {
        ctx.font = '11px Inter, sans-serif';
        ctx.fillStyle = active ? '#eaffff' : '#9bb5c3';
        ctx.fillText(system.name, point.x + 9, point.y - 8);
      }
    }
  }, [current, currentSystemId, jumpRange, selectedSystemId, systemIndex, systems, toScreen, view]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [draw, canvasVersion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => setCanvasVersion((value) => value + 1));
    observer.observe(canvas);
    const onWheel = (event: WheelEvent) => {
      // Ordinary wheel/trackpad movement must keep scrolling the page.
      // Hold Ctrl/Cmd to zoom the galactic map deliberately.
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      setView((old) => ({ ...old, zoom: Math.max(0.25, Math.min(2.8, old.zoom * (event.deltaY > 0 ? 0.9 : 1.1))) }));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  const findSystem = (clientX: number, clientY: number): StarSystem | undefined => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    return systems.find((system) => {
      if (!system.known) return false;
      const sx = rect.width / 2 + (system.coordinates.x + view.x) * view.zoom;
      const sy = rect.height / 2 + (system.coordinates.y + view.y) * view.zoom;
      return Math.hypot(sx - x, sy - y) < 13;
    });
  };

  return <canvas
    ref={canvasRef}
    className="galaxy-canvas"
    aria-label="Карта галактики. Прокручивай страницу вертикально; веди пальцем по горизонтали, чтобы двигать карту."
    onPointerDown={(event) => {
      const touch = event.pointerType === 'touch';
      drag.current = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y, pointerType: event.pointerType, panning: !touch };
      if (!touch) event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      const started = drag.current;
      if (!started) return;
      const rawX = event.clientX - started.x;
      const rawY = event.clientY - started.y;

      if (started.pointerType === 'touch' && !started.panning) {
        // Vertical touch movement belongs to the page. Horizontal movement controls the map.
        if (Math.abs(rawY) > Math.abs(rawX) + 6 && Math.abs(rawY) > 8) {
          drag.current = null;
          return;
        }
        if (Math.abs(rawX) < 10 || Math.abs(rawX) <= Math.abs(rawY)) return;
        started.panning = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }

      if (!started.panning) return;
      event.preventDefault();
      const dx = rawX / view.zoom;
      const dy = rawY / view.zoom;
      setView((old) => ({ ...old, x: started.vx + dx, y: started.vy + dy }));
    }}
    onPointerUp={(event) => {
      const started = drag.current;
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (started && Math.hypot(event.clientX - started.x, event.clientY - started.y) < 7) {
        const system = findSystem(event.clientX, event.clientY);
        if (system) onSelect(system.id);
      }
    }}
    onPointerCancel={(event) => {
      drag.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
  />;
}
