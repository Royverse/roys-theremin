// ============================================================================
// PROCEDURAL 3D MOOG ETHERWAVE THEREMIN MODEL (THREE.JS)
// Zero external model dependencies - 100% procedural geometry and textures
// ============================================================================

import * as THREE from 'three';

export interface ThereminModelParts {
  group: THREE.Group;
  pitchAntenna: THREE.Mesh;
  volumeAntenna: THREE.Mesh;
  pitchTipPosition: THREE.Vector3;
  volumeLoopCenter: THREE.Vector3;
  filamentLight: THREE.PointLight;
  pilotLight: THREE.Mesh;
  knobs: THREE.Mesh[];
  update: (time: number, amplitude: number) => void;
}

export function createProceduralWoodTexture(width = 1024, height = 1024): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Wood grain frequencies
      const nx = x * 0.025;
      const ny = y * 0.003;
      const grain = Math.sin(nx + Math.sin(ny * 8.0) * 2.2) * 0.5 + 0.5;
      const ring = (Math.sin(ny * 36.0 + grain * 3.5) * 0.5 + 0.5) * 0.3;
      const val = grain * 0.7 + ring;

      const idx = (y * width + x) * 4;
      // Rich vintage walnut: deep umber base to warm chestnut highlights
      data[idx]     = Math.min(255, 48 + val * 65);  // R
      data[idx + 1] = Math.min(255, 24 + val * 38);  // G
      data[idx + 2] = Math.min(255, 12 + val * 22);  // B
      data[idx + 3] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1.5, 1.5);
  return texture;
}

export function buildThereminModel(): ThereminModelParts {
  const group = new THREE.Group();

  // --------------------------------------------------------------------------
  // MATERIALS
  // --------------------------------------------------------------------------
  const woodTexture = createProceduralWoodTexture();

  const woodMaterial = new THREE.MeshStandardMaterial({
    map: woodTexture,
    roughness: 0.38,
    metalness: 0.04,
  });

  const chromeMaterial = new THREE.MeshStandardMaterial({
    color: 0xe8ecf0,
    roughness: 0.08,
    metalness: 0.96,
  });

  const darkPlateMaterial = new THREE.MeshStandardMaterial({
    color: 0x161618,
    roughness: 0.55,
    metalness: 0.45,
  });

  const knobMaterial = new THREE.MeshStandardMaterial({
    color: 0x18181a,
    roughness: 0.35,
    metalness: 0.15,
  });

  const brassMaterial = new THREE.MeshStandardMaterial({
    color: 0xcca044,
    roughness: 0.25,
    metalness: 0.85,
  });

  // --------------------------------------------------------------------------
  // 1. WOODEN CABINET BODY (Dimensions: 0.48m x 0.11m x 0.18m)
  // --------------------------------------------------------------------------
  const cabinetGeo = new THREE.BoxGeometry(0.48, 0.11, 0.18);
  const cabinet = new THREE.Mesh(cabinetGeo, woodMaterial);
  cabinet.castShadow = true;
  cabinet.receiveShadow = true;
  group.add(cabinet);

  // Inset front faceplate (brushed aluminum/black)
  const faceplateGeo = new THREE.BoxGeometry(0.42, 0.08, 0.004);
  const faceplate = new THREE.Mesh(faceplateGeo, darkPlateMaterial);
  faceplate.position.set(0, 0, 0.091);
  group.add(faceplate);

  // --------------------------------------------------------------------------
  // 2. RIGHT PITCH ANTENNA (Vertical Chrome Rod)
  // --------------------------------------------------------------------------
  // Mounting base collar
  const pitchCollarGeo = new THREE.CylinderGeometry(0.012, 0.014, 0.02, 24);
  const pitchCollar = new THREE.Mesh(pitchCollarGeo, chromeMaterial);
  pitchCollar.position.set(0.19, 0.065, 0);
  group.add(pitchCollar);

  // Vertical rod (0.46m height)
  const pitchRodGeo = new THREE.CylinderGeometry(0.0035, 0.005, 0.46, 24);
  const pitchAntenna = new THREE.Mesh(pitchRodGeo, chromeMaterial);
  pitchAntenna.castShadow = true;
  pitchAntenna.position.set(0.19, 0.065 + 0.23, 0);
  group.add(pitchAntenna);

  // Top sphere cap
  const pitchCapGeo = new THREE.SphereGeometry(0.007, 16, 16);
  const pitchCap = new THREE.Mesh(pitchCapGeo, chromeMaterial);
  pitchCap.position.set(0.19, 0.065 + 0.46, 0);
  group.add(pitchCap);

  const pitchTipPosition = new THREE.Vector3(0.19, 0.065 + 0.46, 0);

  // --------------------------------------------------------------------------
  // 3. LEFT VOLUME ANTENNA (Horizontal Chrome Loop)
  // --------------------------------------------------------------------------
  // Left mounting collars
  const volCollar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.02, 16), chromeMaterial);
  volCollar1.rotation.z = Math.PI / 2;
  volCollar1.position.set(-0.245, 0.02, -0.04);
  group.add(volCollar1);

  const volCollar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.02, 16), chromeMaterial);
  volCollar2.rotation.z = Math.PI / 2;
  volCollar2.position.set(-0.245, 0.02, 0.04);
  group.add(volCollar2);

  // Teardrop horizontal loop curve
  const loopPoints: THREE.Vector3[] = [
    new THREE.Vector3(-0.245, 0.02, 0.04),
    new THREE.Vector3(-0.31, 0.02, 0.06),
    new THREE.Vector3(-0.41, 0.02, 0.05),
    new THREE.Vector3(-0.46, 0.02, 0.0),
    new THREE.Vector3(-0.41, 0.02, -0.05),
    new THREE.Vector3(-0.31, 0.02, -0.06),
    new THREE.Vector3(-0.245, 0.02, -0.04),
  ];
  const loopCurve = new THREE.CatmullRomCurve3(loopPoints, false);
  const loopGeo = new THREE.TubeGeometry(loopCurve, 48, 0.0045, 16, false);
  const volumeAntenna = new THREE.Mesh(loopGeo, chromeMaterial);
  volumeAntenna.castShadow = true;
  group.add(volumeAntenna);

  const volumeLoopCenter = new THREE.Vector3(-0.36, 0.02, 0.0);

  // --------------------------------------------------------------------------
  // 4. FRONT CONTROLS (Bakelite Knobs & Lettering Plate)
  // --------------------------------------------------------------------------
  const knobPositions = [-0.14, -0.05, 0.05, 0.14];
  const knobs: THREE.Mesh[] = [];

  for (let i = 0; i < knobPositions.length; i++) {
    const knobGroup = new THREE.Group();
    // Knob base body
    const knobBodyGeo = new THREE.CylinderGeometry(0.011, 0.013, 0.012, 24);
    const knob = new THREE.Mesh(knobBodyGeo, knobMaterial);
    knob.rotation.x = Math.PI / 2;

    // Brass pointer dot
    const dotGeo = new THREE.BoxGeometry(0.002, 0.006, 0.003);
    const dot = new THREE.Mesh(dotGeo, brassMaterial);
    dot.position.set(0, 0.008, 0.006);
    knob.add(dot);

    knobGroup.position.set(knobPositions[i], -0.005, 0.096);
    knobGroup.add(knob);
    group.add(knobGroup);
    knobs.push(knob);
  }

  // --------------------------------------------------------------------------
  // 5. 12AX7 VACUUM TUBE & RUBY PILOT LAMP
  // --------------------------------------------------------------------------
  // Ruby pilot jewel lamp
  const pilotGeo = new THREE.CylinderGeometry(0.006, 0.007, 0.006, 16);
  const pilotMat = new THREE.MeshStandardMaterial({
    color: 0xff1122,
    emissive: 0xdd1122,
    emissiveIntensity: 1.2,
    roughness: 0.2,
  });
  const pilotLight = new THREE.Mesh(pilotGeo, pilotMat);
  pilotLight.rotation.x = Math.PI / 2;
  pilotLight.position.set(0, -0.022, 0.095);
  group.add(pilotLight);

  // Exposed Vacuum Tube mounted on top center of cabinet
  const tubeSocket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.018, 0.008, 20),
    darkPlateMaterial
  );
  tubeSocket.position.set(0, 0.058, 0);
  group.add(tubeSocket);

  // Internal triode metal plates
  const plateGeo = new THREE.BoxGeometry(0.008, 0.022, 0.008);
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x333336, roughness: 0.5, metalness: 0.8 });
  const internalPlate = new THREE.Mesh(plateGeo, plateMat);
  internalPlate.position.set(0, 0.076, 0);
  group.add(internalPlate);

  // Glowing orange tungsten filament coil inside tube
  const filamentMat = new THREE.MeshStandardMaterial({
    color: 0xffaa33,
    emissive: 0xff6611,
    emissiveIntensity: 3.5,
  });
  const filament = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.014, 12), filamentMat);
  filament.position.set(0, 0.076, 0);
  group.add(filament);

  // Warm PointLight emitted by filament
  const filamentLight = new THREE.PointLight(0xff6611, 2.0, 0.5);
  filamentLight.position.set(0, 0.08, 0);
  group.add(filamentLight);

  // Glass tube envelope
  const tubeGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transmission: 0.94,
    opacity: 1.0,
    transparent: true,
    roughness: 0.05,
    ior: 1.5,
    thickness: 0.005,
  });
  const tubeGlass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.038, 20),
    tubeGlassMat
  );
  tubeGlass.position.set(0, 0.078, 0);
  group.add(tubeGlass);

  // Dome cap on tube
  const domeGeo = new THREE.SphereGeometry(0.012, 20, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const tubeDome = new THREE.Mesh(domeGeo, tubeGlassMat);
  tubeDome.position.set(0, 0.097, 0);
  group.add(tubeDome);

  // --------------------------------------------------------------------------
  // 6. TELESCOPIC CHROME STAND
  // --------------------------------------------------------------------------
  const standShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.014, 0.014, 0.75, 20),
    chromeMaterial
  );
  standShaft.position.set(0, -0.43, 0);
  group.add(standShaft);

  // Base tripod collar
  const tripodCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.028, 0.04, 16),
    darkPlateMaterial
  );
  tripodCollar.position.set(0, -0.78, 0);
  group.add(tripodCollar);

  // --------------------------------------------------------------------------
  // ANIMATION / DYNAMIC UPDATE FUNCTION
  // --------------------------------------------------------------------------
  const update = (time: number, amplitude: number) => {
    // Tube filament gentle pulsation matching audio amplitude + analog flicker
    const flicker = Math.sin(time * 12.0) * 0.08 + Math.cos(time * 23.0) * 0.05;
    const intensity = 1.4 + amplitude * 2.2 + flicker;
    filamentLight.intensity = Math.max(0.5, intensity);
    filamentMat.emissiveIntensity = 2.5 + amplitude * 3.0;

    // Pilot light subtle glow
    pilotMat.emissiveIntensity = 1.0 + Math.sin(time * 3.0) * 0.15;

    // Slight dynamic knob twitch on pitch/volume change
    if (knobs.length >= 4) {
      knobs[0].rotation.z = Math.sin(time * 0.5) * 0.15;
      knobs[1].rotation.z = amplitude * 1.5;
    }
  };

  return {
    group,
    pitchAntenna,
    volumeAntenna,
    pitchTipPosition,
    volumeLoopCenter,
    filamentLight,
    pilotLight,
    knobs,
    update,
  };
}
