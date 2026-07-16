import appSource from '../App.tsx?raw';
import canvasSource from '../components/GalaxyCanvas.tsx?raw';
import screenSource from '../screens/GalaxyScreen.tsx?raw';
import { describe, expect, it } from 'vitest';

describe('v0.34 galactic navigation interface',()=>{
  it('uses the dedicated geography screen instead of the embedded legacy map',()=>{
    expect(appSource).toContain("./screens/GalaxyScreen");
    expect(appSource).toContain("<GalaxyScreenV34 chrome={<AppChrome/>}/>");
    expect(appSource).not.toContain('function GalaxyScreen()');
  });
  it('shows route priorities, costs, warnings and active route progress',()=>{
    expect(screenSource).toContain('Варианты пути');
    expect(screenSource).toContain('Проложить маршрут');
    expect(screenSource).toContain('Следующий прыжок');
    expect(screenSource).toContain('totalFuel');
    expect(screenSource).toContain('foodCost');
    expect(screenSource).toContain('oxygenCost');
  });
  it('draws dynamic and planned corridors on the galaxy canvas',()=>{
    expect(canvasSource).toContain('routeVisuals');
    expect(canvasSource).toContain('visual?.planned');
    expect(canvasSource).toContain("visual?.kind === 'military'");
  });
});
