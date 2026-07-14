import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { StarSystem } from '../game/types';

interface Props {
  systems: StarSystem[];
  currentSystemId: string;
  selectedSystemId: string | null;
  jumpRange: number;
  onSelect(id: string): void;
}

interface ViewState { x: number; y: number; zoom: number; }
interface PointerState { x: number; y: number; }

export interface GalaxyCanvasHandle {
  center(): void;
  zoomIn(): void;
  zoomOut(): void;
}

const clampZoom = (value: number) => Math.max(0.25, Math.min(3.2, value));

export const GalaxyCanvas = forwardRef<GalaxyCanvasHandle, Props>(function GalaxyCanvas(
  { systems, currentSystemId, selectedSystemId, jumpRange, onSelect },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [view, setView] = useState<ViewState>({ x: 0, y: 0, zoom: 0.72 });
  const [canvasVersion, setCanvasVersion] = useState(0);
  const pointers = useRef(new Map<number, PointerState>());
  const gesture = useRef<{ centerX: number; centerY: number; distance: number; view: ViewState } | null>(null);
  const dragStart = useRef<{ pointerId: number; x: number; y: number; view: ViewState; moved: boolean } | null>(null);
  const systemIndex = useMemo(() => new Map(systems.map((system) => [system.id, system])), [systems]);
  const current = systemIndex.get(currentSystemId);

  const centerCurrent = useCallback(() => {
    if (!current) return;
    setView((old) => ({ ...old, x: -current.coordinates.x, y: -current.coordinates.y }));
  }, [current]);

  useImperativeHandle(ref, () => ({
    center: centerCurrent,
    zoomIn: () => setView((old) => ({ ...old, zoom: clampZoom(old.zoom * 1.22) })),
    zoomOut: () => setView((old) => ({ ...old, zoom: clampZoom(old.zoom / 1.22) }))
  }), [centerCurrent]);

  useEffect(() => {
    centerCurrent();
  }, [currentSystemId, centerCurrent]);

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
    for (let gx = -1800; gx <= 1800; gx += 100) {
      const sx = width / 2 + (gx + view.x) * view.zoom;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, height); ctx.stroke();
    }
    for (let gy = -1800; gy <= 1800; gy += 100) {
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
      if (point.x < -30 || point.y < -30 || point.x > width + 30 || point.y > height + 30) continue;
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
      event.preventDefault();
      setView((old) => ({ ...old, zoom: clampZoom(old.zoom * (event.deltaY > 0 ? 0.9 : 1.1)) }));
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
      return Math.hypot(sx - x, sy - y) < 16;
    });
  };

  const updateGesture = () => {
    const active = [...pointers.current.values()];
    if (active.length < 2) { gesture.current = null; return; }
    const [a, b] = active;
    const centerX = (a.x + b.x) / 2;
    const centerY = (a.y + b.y) / 2;
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    gesture.current = { centerX, centerY, distance, view };
  };

  return <canvas
    ref={canvasRef}
    className="galaxy-canvas"
    aria-label="Интерактивная карта галактики. Перемещай одним пальцем, масштабируй двумя."
    onPointerDown={(event) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size === 1) {
        dragStart.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, view, moved: false };
      } else {
        dragStart.current = null;
        updateGesture();
      }
    }}
    onPointerMove={(event) => {
      if (!pointers.current.has(event.pointerId)) return;
      event.preventDefault();
      pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.current.size >= 2) {
        const active = [...pointers.current.values()];
        const [a, b] = active;
        const centerX = (a.x + b.x) / 2;
        const centerY = (a.y + b.y) / 2;
        const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const start = gesture.current;
        if (!start) { updateGesture(); return; }
        setView({
          zoom: clampZoom(start.view.zoom * (distance / start.distance)),
          x: start.view.x + (centerX - start.centerX) / start.view.zoom,
          y: start.view.y + (centerY - start.centerY) / start.view.zoom
        });
        return;
      }
      const start = dragStart.current;
      if (!start || start.pointerId !== event.pointerId) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.hypot(dx, dy) > 5) start.moved = true;
      setView((old) => ({ ...old, x: start.view.x + dx / start.view.zoom, y: start.view.y + dy / start.view.zoom }));
    }}
    onPointerUp={(event) => {
      const start = dragStart.current;
      pointers.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (pointers.current.size >= 2) updateGesture(); else gesture.current = null;
      if (start?.pointerId === event.pointerId && !start.moved) {
        const system = findSystem(event.clientX, event.clientY);
        if (system) onSelect(system.id);
      }
      if (pointers.current.size === 0) dragStart.current = null;
    }}
    onPointerCancel={(event) => {
      pointers.current.delete(event.pointerId);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      if (pointers.current.size === 0) dragStart.current = null;
      gesture.current = null;
    }}
  />;
});
