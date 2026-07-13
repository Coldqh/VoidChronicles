import { Fragment } from 'react';
import type { Planet, PointOfInterest, StarSystem } from '../game/types';

interface Props {
  system: StarSystem;
  selectedPlanetId: string | null;
  pointsOfInterest: PointOfInterest[];
  onSelectPlanet(planet: Planet): void;
  tutorialPlanetId?: string;
}

function orbitPercent(index: number, count: number): number {
  const min = 25;
  const max = 88;
  return min + (count <= 1 ? 0 : index / (count - 1)) * (max - min);
}

export function SystemMap({ system, selectedPlanetId, pointsOfInterest, onSelectPlanet, tutorialPlanetId }: Props) {
  return <section className="system-map" aria-label={`Система ${system.name}`}>
    <div className={`system-star star-${system.starClass.toLowerCase()}`}><span>{system.starClass}</span></div>
    {system.planets.map((planet, index) => {
      const orbit = orbitPercent(index, system.planets.length);
      const angle = ((index * 137.5 + 22) * Math.PI) / 180;
      const radius = orbit / 2;
      const x = 50 + Math.cos(angle) * radius;
      const y = 50 + Math.sin(angle) * radius;
      const signals = pointsOfInterest.filter((entry) => entry.planetId === planet.id).length;
      const label = planet.scanLevel && planet.scanLevel > 0 ? planet.name : 'Неизвестный объект';

      return <Fragment key={planet.id}>
        <div className="orbit" style={{ width: `${orbit}%`, height: `${orbit}%` }} aria-hidden="true" />
        <button
          data-tutorial={planet.id === tutorialPlanetId ? 'tutorial-planet' : undefined}
          className={`system-planet planet-${planet.type} ${selectedPlanetId === planet.id ? 'selected' : ''}`}
          style={{ left: `${x}%`, top: `${y}%` }}
          onClick={() => onSelectPlanet(planet)}
          title={label}
          aria-label={label}
        >
          <span>{planet.scanLevel && planet.scanLevel > 0 ? planet.name.slice(0, 2).toUpperCase() : '?'}</span>
          {signals > 0 && <em>{signals}</em>}
        </button>
      </Fragment>;
    })}
    <div className="system-map-caption"><b>{system.name}</b><span>{system.planets.length} планет · {system.anomaly ? 'аномальные показания' : 'стабильная навигация'}</span></div>
  </section>;
}
