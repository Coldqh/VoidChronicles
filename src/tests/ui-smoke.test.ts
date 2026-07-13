import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import App from '../App';
import { SystemMap } from '../components/SystemMap';
import { ExpeditionModal } from '../components/ExpeditionModal';
import { generateGalaxy } from '../generation/generateGalaxy';
import { generatePointsOfInterest } from '../exploration/pointsOfInterest';

describe('application rendering smoke tests', () => {
  it('renders the boot shell with the current version', () => {
    const html = renderToString(React.createElement(App));
    expect(html).toContain('0.9.3');
    expect(html).toContain('Проверка локального архива');
  });


  it('renders the orbital map and expedition loadout without runtime exceptions', async () => {
    const galaxy = await generateGalaxy({
      seed: 'UI-SMOKE', systemCount: 20, historyYears: 100_000,
      civilizationCount: 3, lifeFrequency: 0.3, anomalyFrequency: 0.03, difficulty: 'standard'
    });
    const system = galaxy.systems[0]!;
    const planet = system.planets[0]!;
    const point = generatePointsOfInterest(galaxy, system, planet)[0]!;
    const mapHtml = renderToString(React.createElement(SystemMap, {
      system, selectedPlanetId: planet.id, pointsOfInterest: [point], onSelectPlanet: () => undefined
    }));
    const expeditionHtml = renderToString(React.createElement(ExpeditionModal, {
      seed: galaxy.seed, planet, point, crew: [], personalEquipment: [], onClose: () => undefined, onComplete: () => undefined
    }));
    expect(mapHtml).toContain('system-map');
    expect(mapHtml).toContain('%');
    expect(mapHtml).not.toContain('calc(-50% +');
    expect(expeditionHtml).toContain('ПОДГОТОВКА ЭКСПЕДИЦИИ');
  });
});
