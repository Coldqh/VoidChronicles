import type { Planet, PointOfInterest, StarSystem } from '../game/types';

interface Props {
  system: StarSystem;
  selectedPlanetId: string | null;
  pointsOfInterest: PointOfInterest[];
  onSelectPlanet(planet: Planet): void;
}

function orbitSize(index: number, count: number): number {
  const min = 112;
  const max = 430;
  return min + (count <= 1 ? 0 : index / (count - 1)) * (max - min);
}

export function SystemMap({ system, selectedPlanetId, pointsOfInterest, onSelectPlanet }: Props) {
  return <section className="system-map" aria-label={`Система ${system.name}`}>
    <div className={`system-star star-${system.starClass.toLowerCase()}`}><span>{system.starClass}</span></div>
    {system.planets.map((planet, index) => {
      const size = orbitSize(index, system.planets.length);
      const angle = ((index * 137.5 + 22) * Math.PI) / 180;
      const radius = size / 2;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const signals = pointsOfInterest.filter((entry) => entry.planetId === planet.id).length;
      return <div className="orbit" key={planet.id} style={{ width: size, height: size }}>
        <button
          className={`system-planet planet-${planet.type} ${selectedPlanetId === planet.id ? 'selected' : ''}`}
          style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
          onClick={() => onSelectPlanet(planet)}
          title={planet.scanLevel && planet.scanLevel > 0 ? planet.name : 'Неизвестный объект'}
        >
          <span>{planet.scanLevel && planet.scanLevel > 0 ? planet.name.slice(0, 2).toUpperCase() : '?'}</span>
          {signals > 0 && <em>{signals}</em>}
        </button>
      </div>;
    })}
    <div className="system-map-caption"><b>{system.name}</b><span>{system.planets.length} планет · {system.anomaly ? 'аномальные показания' : 'стабильная навигация'}</span></div>
  </section>;
}
