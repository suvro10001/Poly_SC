import * as THREE from 'three';
import { BiomeType, CameraMode, CraftConfig, PowerupTimers } from '../types/game';
import { soundEngine } from '../audio/soundEngine';

export interface GameEngineCallbacks {
  onScoreUpdate: (score: number, distance: number, speedKmh: number, multiplier: number) => void;
  onCrystalCollect: (crystalsCount: number, combo: number) => void;
  onPowerupCollect: (type: keyof PowerupTimers, duration: number) => void;
  onNearMiss: () => void;
  onGameOver: () => void;
}

export interface BiomePalette {
  sky: number;
  fog: number;
  ground: number;
  grid: number;
  mountains: number;
  crystals: number;
  ambient: number;
  light: number;
}

const BIOME_PALETTES: Record<BiomeType, BiomePalette> = {
  sunset: {
    sky: 0x1f1124,
    fog: 0x2a142e,
    ground: 0x3d1d36,
    grid: 0xf97316,
    mountains: 0x58244b,
    crystals: 0xfbbf24,
    ambient: 0x4a2840,
    light: 0xffaa66,
  },
  cyber: {
    sky: 0x050814,
    fog: 0x070c20,
    ground: 0x0e1329,
    grid: 0x06b6d4,
    mountains: 0x141b3b,
    crystals: 0xec4899,
    ambient: 0x1e1b4b,
    light: 0x38bdf8,
  },
  emerald: {
    sky: 0x061a14,
    fog: 0x09241b,
    ground: 0x0c3325,
    grid: 0x10b981,
    mountains: 0x144231,
    crystals: 0x34d399,
    ambient: 0x064e3b,
    light: 0x6ee7b7,
  },
  cosmic: {
    sky: 0x0a0518,
    fog: 0x0f0724,
    ground: 0x160c33,
    grid: 0x8b5cf6,
    mountains: 0x25144f,
    crystals: 0xc084fc,
    ambient: 0x2e1065,
    light: 0xa78bfa,
  },
};

export class ThreeRunnerEngine {
  private container: HTMLElement;
  private callbacks: GameEngineCallbacks;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private animationFrameId: number | null = null;

  // Game state
  private isRunning = false;
  private isPaused = false;
  private currentBiome: BiomeType = 'sunset';
  private cameraMode: CameraMode = 'chase';
  private craftConfig: CraftConfig;

  // Running physics
  private baseSpeed = 45;       // Units per second
  private speed = 45;
  private maxSpeed = 110;
  private distance = 0;
  private score = 0;
  private runCrystals = 0;
  private multiplier = 1;
  private combo = 0;
  private comboResetTimer = 0;

  // Lanes
  private readonly LANE_POSITIONS = [-3.2, 0, 3.2];
  private currentLaneIndex = 1; // Center lane
  private playerX = 0;
  private targetPlayerX = 0;

  // Vertical (Jump & Slide)
  private playerY = 0.5;
  private playerVelocityY = 0;
  private isJumping = false;
  private isSliding = false;
  private slideTimer = 0;
  private readonly GRAVITY = -58;
  private readonly JUMP_FORCE = 18;

  // Powerups state
  private powerups: PowerupTimers = {
    shield: 0,
    magnet: 0,
    boost: 0,
    multiplier2x: 0,
    chrono: 0,
  };

  // Three.js object groups
  private playerGroup!: THREE.Group;
  private shieldMesh!: THREE.Mesh;
  private thrusterParticles!: THREE.Points;
  private speedParticles!: THREE.Points;
  private worldGroup!: THREE.Group;
  private trackSegments: THREE.Group[] = [];
  private obstacles: {
    mesh: THREE.Object3D;
    lane: number;
    z: number;
    type: 'low' | 'high' | 'full';
    passed: boolean;
    boundingBox: THREE.Box3;
  }[] = [];
  private collectibles: {
    mesh: THREE.Object3D;
    lane: number;
    z: number;
    type: 'crystal' | 'powerup';
    powerupType?: keyof PowerupTimers;
    collected: boolean;
  }[] = [];

  // Lights
  private ambientLight!: THREE.AmbientLight;
  private dirLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;

  // Track generator constants
  private readonly CHUNK_LENGTH = 50;
  private readonly CHUNK_COUNT = 9;
  private nextObstacleZ = -40;

  // Camera damping
  private cameraTargetPos = new THREE.Vector3();
  private cameraLookTarget = new THREE.Vector3();
  private cameraShake = 0;

  constructor(
    container: HTMLElement,
    craftConfig: CraftConfig,
    initialBiome: BiomeType,
    callbacks: GameEngineCallbacks
  ) {
    this.container = container;
    this.craftConfig = craftConfig;
    this.currentBiome = initialBiome;
    this.callbacks = callbacks;

    this.initThree();
    this.buildWorld();
    this.buildPlayer();
    this.buildSpeedLines();
    this.setupResizeListener();
  }

  private initThree() {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    const palette = BIOME_PALETTES[this.currentBiome];
    this.scene.background = new THREE.Color(palette.sky);
    this.scene.fog = new THREE.FogExp2(palette.fog, 0.015);

    this.camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 400);
    this.camera.position.set(0, 5, 9);
    this.cameraTargetPos.copy(this.camera.position);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // Three-point lighting setup
    this.ambientLight = new THREE.AmbientLight(palette.ambient, 1.8);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(palette.light, 2.2);
    this.dirLight.position.set(20, 40, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 150;
    this.dirLight.shadow.camera.left = -20;
    this.dirLight.shadow.camera.right = 20;
    this.dirLight.shadow.camera.top = 20;
    this.dirLight.shadow.camera.bottom = -20;
    this.scene.add(this.dirLight);

    this.rimLight = new THREE.DirectionalLight(0xffffff, 0.8);
    this.rimLight.position.set(-20, 10, -30);
    this.scene.add(this.rimLight);

    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
  }

  public setBiome(biome: BiomeType) {
    this.currentBiome = biome;
    const palette = BIOME_PALETTES[biome];
    this.scene.background = new THREE.Color(palette.sky);
    if (this.scene.fog) {
      this.scene.fog.color.setHex(palette.fog);
    }
    this.ambientLight.color.setHex(palette.ambient);
    this.dirLight.color.setHex(palette.light);

    // Update track materials
    this.trackSegments.forEach((chunk) => {
      chunk.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          if (child.name === 'ground') {
            child.material.color.setHex(palette.ground);
          } else if (child.name === 'curb') {
            child.material.color.setHex(palette.grid);
          } else if (child.name === 'mountain') {
            child.material.color.setHex(palette.mountains);
          }
        }
      });
    });
  }

  public setCameraMode(mode: CameraMode) {
    this.cameraMode = mode;
  }

  public setCraft(craft: CraftConfig) {
    this.craftConfig = craft;
    if (this.playerGroup) {
      this.scene.remove(this.playerGroup);
    }
    this.buildPlayer();
  }

  // --- PLAYER MESH BUILDER ---

  private buildPlayer() {
    this.playerGroup = new THREE.Group();
    this.playerGroup.position.set(0, this.playerY, 0);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.craftConfig.color),
      emissive: new THREE.Color(this.craftConfig.emissiveColor),
      emissiveIntensity: 0.25,
      roughness: 0.35,
      metalness: 0.65,
      flatShading: true,
    });

    const accentMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.craftConfig.accentColor),
      roughness: 0.2,
      metalness: 0.8,
      flatShading: true,
    });

    const glowMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(this.craftConfig.accentColor),
    });

    // Craft model variants
    if (this.craftConfig.shape === 'falcon') {
      // Aerodynamic low-poly jet hull
      const hullGeo = new THREE.ConeGeometry(0.8, 2.6, 5);
      hullGeo.rotateX(Math.PI / 2);
      const hull = new THREE.Mesh(hullGeo, bodyMat);
      hull.castShadow = true;
      this.playerGroup.add(hull);

      // Swept delta wings
      const wingGeo = new THREE.BufferGeometry();
      const wingVertices = new Float32Array([
        0, 0, 0.4,
        -1.8, 0, 1.2,
        0, 0.1, -0.6,
        0, 0, 0.4,
        1.8, 0, 1.2,
        0, 0.1, -0.6,
      ]);
      wingGeo.setAttribute('position', new THREE.BufferAttribute(wingVertices, 3));
      wingGeo.computeVertexNormals();
      const wings = new THREE.Mesh(wingGeo, accentMat);
      wings.castShadow = true;
      this.playerGroup.add(wings);

      // Twin stabilizer fins
      const finGeo = new THREE.BoxGeometry(0.08, 0.6, 0.8);
      const finL = new THREE.Mesh(finGeo, accentMat);
      finL.position.set(-0.5, 0.3, 0.6);
      finL.rotation.z = -0.25;
      const finR = finL.clone();
      finR.position.x = 0.5;
      finR.rotation.z = 0.25;
      this.playerGroup.add(finL, finR);

      // Thruster glow
      const thrusterGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 6);
      thrusterGeo.rotateX(Math.PI / 2);
      const thruster = new THREE.Mesh(thrusterGeo, glowMat);
      thruster.position.set(0, 0, 1.3);
      this.playerGroup.add(thruster);
    } else if (this.craftConfig.shape === 'prism') {
      // Diamond prism hovercraft
      const prismGeo = new THREE.OctahedronGeometry(1.0, 0);
      prismGeo.scale(1.2, 0.5, 1.6);
      const prism = new THREE.Mesh(prismGeo, bodyMat);
      prism.castShadow = true;
      this.playerGroup.add(prism);

      // Rotating energy ring
      const ringGeo = new THREE.TorusGeometry(1.4, 0.08, 6, 8);
      const ring = new THREE.Mesh(ringGeo, accentMat);
      ring.name = 'spinningRing';
      ring.rotation.x = Math.PI / 2;
      this.playerGroup.add(ring);
    } else if (this.craftConfig.shape === 'icosa') {
      // Levitating Icosahedron Core
      const icosaGeo = new THREE.IcosahedronGeometry(0.85, 0);
      const icosa = new THREE.Mesh(icosaGeo, bodyMat);
      icosa.name = 'spinningCore';
      icosa.castShadow = true;
      this.playerGroup.add(icosa);

      // Dual outer orbital rings
      const orbitGeo = new THREE.TorusGeometry(1.3, 0.06, 4, 12);
      const orbit1 = new THREE.Mesh(orbitGeo, accentMat);
      orbit1.name = 'orbit1';
      const orbit2 = new THREE.Mesh(orbitGeo, glowMat);
      orbit2.name = 'orbit2';
      orbit2.rotation.y = Math.PI / 2;
      this.playerGroup.add(orbit1, orbit2);
    } else {
      // Vortex Dart - Needle supersonic racer
      const needleGeo = new THREE.ConeGeometry(0.5, 3.2, 6);
      needleGeo.rotateX(Math.PI / 2);
      const needle = new THREE.Mesh(needleGeo, bodyMat);
      needle.castShadow = true;
      this.playerGroup.add(needle);

      const crossWingsGeo = new THREE.BoxGeometry(2.4, 0.08, 0.7);
      const crossWings = new THREE.Mesh(crossWingsGeo, accentMat);
      crossWings.position.set(0, 0, 0.5);
      this.playerGroup.add(crossWings);
    }

    // Shield bubble mesh (hidden by default)
    const shieldGeo = new THREE.IcosahedronGeometry(1.8, 1);
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0,
      roughness: 0.1,
      metalness: 0.9,
      wireframe: true,
    });
    this.shieldMesh = new THREE.Mesh(shieldGeo, shieldMat);
    this.playerGroup.add(this.shieldMesh);

    // Jet thruster particle system
    const particleCount = 40;
    const particleGeo = new THREE.BufferGeometry();
    const particlePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i++) {
      particlePositions[i] = (Math.random() - 0.5) * 0.4;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: new THREE.Color(this.craftConfig.accentColor),
      size: 0.25,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
    });
    this.thrusterParticles = new THREE.Points(particleGeo, particleMat);
    this.thrusterParticles.position.set(0, 0, 1.4);
    this.playerGroup.add(this.thrusterParticles);

    this.scene.add(this.playerGroup);
  }

  // --- SPEED STREAK LINES ---

  private buildSpeedLines() {
    const count = 180;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 35;
      positions[i * 3 + 1] = Math.random() * 15 + 0.5;
      positions[i * 3 + 2] = -Math.random() * 180;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.15,
      transparent: true,
      opacity: 0.4,
    });
    this.speedParticles = new THREE.Points(geo, mat);
    this.scene.add(this.speedParticles);
  }

  // --- PROCEDURAL TRACK SEGMENT GENERATION ---

  private buildWorld() {
    for (let i = 0; i < this.CHUNK_COUNT; i++) {
      const zOffset = -i * this.CHUNK_LENGTH;
      const chunk = this.createTrackChunk(zOffset);
      this.trackSegments.push(chunk);
      this.worldGroup.add(chunk);
    }
  }

  private createTrackChunk(zOffset: number): THREE.Group {
    const chunk = new THREE.Group();
    chunk.position.z = zOffset;

    const palette = BIOME_PALETTES[this.currentBiome];

    // Main 3-Lane Track Surface
    const trackWidth = 11.2;
    const groundGeo = new THREE.PlaneGeometry(trackWidth, this.CHUNK_LENGTH, 6, 12);
    groundGeo.rotateX(-Math.PI / 2);

    const groundMat = new THREE.MeshStandardMaterial({
      color: palette.ground,
      roughness: 0.85,
      metalness: 0.1,
      flatShading: true,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.name = 'ground';
    ground.position.y = 0;
    ground.position.z = -this.CHUNK_LENGTH / 2;
    ground.receiveShadow = true;
    chunk.add(ground);

    // Glowing Neon Lane Dividers
    [-1.6, 1.6].forEach((x) => {
      const stripeGeo = new THREE.PlaneGeometry(0.12, this.CHUNK_LENGTH, 1, 1);
      stripeGeo.rotateX(-Math.PI / 2);
      const stripeMat = new THREE.MeshBasicMaterial({
        color: palette.grid,
        transparent: true,
        opacity: 0.4,
      });
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.set(x, 0.02, -this.CHUNK_LENGTH / 2);
      chunk.add(stripe);
    });

    // Outer Track Curbs / Guardrails
    [-5.6, 5.6].forEach((x) => {
      const curbGeo = new THREE.BoxGeometry(0.4, 0.5, this.CHUNK_LENGTH);
      const curbMat = new THREE.MeshStandardMaterial({
        color: palette.grid,
        emissive: palette.grid,
        emissiveIntensity: 0.35,
        roughness: 0.4,
        metalness: 0.5,
        flatShading: true,
      });
      const curb = new THREE.Mesh(curbGeo, curbMat);
      curb.name = 'curb';
      curb.position.set(x, 0.25, -this.CHUNK_LENGTH / 2);
      chunk.add(curb);
    });

    // Flanking Low-Poly Mountain Terrain
    this.createFlankingMountains(chunk, palette);

    return chunk;
  }

  private createFlankingMountains(chunk: THREE.Group, palette: BiomePalette) {
    const mountainMat = new THREE.MeshStandardMaterial({
      color: palette.mountains,
      roughness: 0.9,
      metalness: 0.05,
      flatShading: true,
    });

    // Left & Right Faceted Mountains and Spire Formations
    [-1, 1].forEach((side) => {
      for (let i = 0; i < 4; i++) {
        const radius = 5 + Math.random() * 8;
        const height = 12 + Math.random() * 26;
        const segments = 4 + Math.floor(Math.random() * 3); // Low-poly 4-6 facets
        const coneGeo = new THREE.ConeGeometry(radius, height, segments);

        const mountain = new THREE.Mesh(coneGeo, mountainMat);
        mountain.name = 'mountain';
        const posX = side * (16 + Math.random() * 18);
        const posZ = -Math.random() * this.CHUNK_LENGTH;
        mountain.position.set(posX, height / 2 - 2, posZ);
        mountain.rotation.y = Math.random() * Math.PI;
        chunk.add(mountain);
      }

      // Floating low-poly crystal obelisks in the sky
      const obeliskGeo = new THREE.OctahedronGeometry(1.8, 0);
      obeliskGeo.scale(1, 2.8, 1);
      const obeliskMat = new THREE.MeshStandardMaterial({
        color: palette.crystals,
        emissive: palette.crystals,
        emissiveIntensity: 0.4,
        roughness: 0.2,
        metalness: 0.8,
        flatShading: true,
      });
      const obelisk = new THREE.Mesh(obeliskGeo, obeliskMat);
      obelisk.position.set(
        side * (11 + Math.random() * 8),
        8 + Math.random() * 10,
        -Math.random() * this.CHUNK_LENGTH
      );
      obelisk.rotation.set(Math.random(), Math.random(), Math.random());
      chunk.add(obelisk);
    });
  }

  // --- OBSTACLES & COLLECTIBLES SPAWNING ---

  private spawnObstacleAndCollectibles(zPos: number) {
    const palette = BIOME_PALETTES[this.currentBiome];
    const availableLanes = [0, 1, 2];

    // Determine obstacle pattern
    const rand = Math.random();
    const lane = Math.floor(Math.random() * 3);

    if (rand < 0.45) {
      // 1. Low Spiked Polyhedron (can be avoided by changing lane or jumped over)
      const mesh = this.createSpikeObstacle(palette);
      mesh.position.set(this.LANE_POSITIONS[lane], 0.7, zPos);
      this.worldGroup.add(mesh);
      this.obstacles.push({
        mesh,
        lane,
        z: zPos,
        type: 'low',
        passed: false,
        boundingBox: new THREE.Box3().setFromObject(mesh),
      });
      availableLanes.splice(availableLanes.indexOf(lane), 1);
    } else if (rand < 0.75) {
      // 2. High Laser Barrier Archway (must slide underneath or switch lane)
      const mesh = this.createLaserBarrier(palette);
      mesh.position.set(this.LANE_POSITIONS[lane], 0, zPos);
      this.worldGroup.add(mesh);
      this.obstacles.push({
        mesh,
        lane,
        z: zPos,
        type: 'high',
        passed: false,
        boundingBox: new THREE.Box3().setFromObject(mesh),
      });
      availableLanes.splice(availableLanes.indexOf(lane), 1);
    } else {
      // 3. Tall Faceted Monolith (cannot jump, must dodge)
      const mesh = this.createMonolithObstacle(palette);
      mesh.position.set(this.LANE_POSITIONS[lane], 2.2, zPos);
      this.worldGroup.add(mesh);
      this.obstacles.push({
        mesh,
        lane,
        z: zPos,
        type: 'full',
        passed: false,
        boundingBox: new THREE.Box3().setFromObject(mesh),
      });
      availableLanes.splice(availableLanes.indexOf(lane), 1);
    }

    // Spawn Crystals in a remaining lane
    if (availableLanes.length > 0) {
      const crystalLane = availableLanes[Math.floor(Math.random() * availableLanes.length)];
      // Spawn a trail of 3-4 crystals
      for (let c = 0; c < 3; c++) {
        const crystalZ = zPos + c * 3.5;
        const crystalMesh = this.createCrystalMesh(palette);
        crystalMesh.position.set(this.LANE_POSITIONS[crystalLane], 1.2, crystalZ);
        this.worldGroup.add(crystalMesh);
        this.collectibles.push({
          mesh: crystalMesh,
          lane: crystalLane,
          z: crystalZ,
          type: 'crystal',
          collected: false,
        });
      }
    }

    // Rare Powerup spawn (15% chance per section)
    if (Math.random() < 0.15 && availableLanes.length > 0) {
      const powerupLane = availableLanes[0];
      const powerTypes: (keyof PowerupTimers)[] = ['shield', 'magnet', 'boost', 'multiplier2x', 'chrono'];
      const chosenType = powerTypes[Math.floor(Math.random() * powerTypes.length)];
      const powerMesh = this.createPowerupMesh(chosenType);
      const pZ = zPos - 12;
      powerMesh.position.set(this.LANE_POSITIONS[powerupLane], 1.5, pZ);
      this.worldGroup.add(powerMesh);
      this.collectibles.push({
        mesh: powerMesh,
        lane: powerupLane,
        z: pZ,
        type: 'powerup',
        powerupType: chosenType,
        collected: false,
      });
    }
  }

  private createSpikeObstacle(palette: BiomePalette): THREE.Object3D {
    const group = new THREE.Group();
    // Low-poly faceted spike cluster
    const spikeGeo = new THREE.ConeGeometry(0.75, 1.4, 5);
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.6,
      flatShading: true,
    });
    const mainSpike = new THREE.Mesh(spikeGeo, spikeMat);
    mainSpike.castShadow = true;
    group.add(mainSpike);

    // Flanking mini spikes
    [-0.5, 0.5].forEach((offset) => {
      const miniGeo = new THREE.ConeGeometry(0.4, 0.9, 4);
      const mini = new THREE.Mesh(miniGeo, spikeMat);
      mini.position.set(offset, -0.25, 0);
      mini.rotation.z = -offset * 0.4;
      group.add(mini);
    });

    return group;
  }

  private createLaserBarrier(palette: BiomePalette): THREE.Object3D {
    const group = new THREE.Group();
    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.5,
      metalness: 0.5,
      flatShading: true,
    });

    // Twin support posts
    const postGeo = new THREE.BoxGeometry(0.3, 3.2, 0.3);
    const postL = new THREE.Mesh(postGeo, pillarMat);
    postL.position.set(-1.4, 1.6, 0);
    const postR = new THREE.Mesh(postGeo, pillarMat);
    postR.position.set(1.4, 1.6, 0);
    group.add(postL, postR);

    // Top beam
    const topGeo = new THREE.BoxGeometry(3.1, 0.3, 0.3);
    const topBeam = new THREE.Mesh(topGeo, pillarMat);
    topBeam.position.set(0, 3.1, 0);
    group.add(topBeam);

    // Glowing laser beam bar (elevated at height y = 1.4: you must SLIDE under it!)
    const laserGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.9, 6);
    laserGeo.rotateZ(Math.PI / 2);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
    });
    const laser = new THREE.Mesh(laserGeo, laserMat);
    laser.position.set(0, 1.5, 0);
    group.add(laser);

    return group;
  }

  private createMonolithObstacle(palette: BiomePalette): THREE.Object3D {
    const geo = new THREE.BoxGeometry(1.8, 4.4, 1.2);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      emissive: 0xb45309,
      emissiveIntensity: 0.35,
      roughness: 0.4,
      metalness: 0.5,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }

  private createCrystalMesh(palette: BiomePalette): THREE.Object3D {
    const geo = new THREE.OctahedronGeometry(0.5, 0);
    geo.scale(0.8, 1.4, 0.8);
    const mat = new THREE.MeshStandardMaterial({
      color: palette.crystals,
      emissive: palette.crystals,
      emissiveIntensity: 0.5,
      roughness: 0.1,
      metalness: 0.9,
      flatShading: true,
    });
    const crystal = new THREE.Mesh(geo, mat);
    crystal.castShadow = true;
    return crystal;
  }

  private createPowerupMesh(type: keyof PowerupTimers): THREE.Object3D {
    const group = new THREE.Group();

    let color = 0x38bdf8; // Shield
    if (type === 'magnet') color = 0xa855f7;
    if (type === 'boost') color = 0xf97316;
    if (type === 'multiplier2x') color = 0xeab308;
    if (type === 'chrono') color = 0x10b981;

    // Outer rotating poly ring
    const ringGeo = new THREE.TorusGeometry(0.8, 0.08, 4, 8);
    const ringMat = new THREE.MeshBasicMaterial({ color });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'powerRing';
    group.add(ring);

    // Inner core
    const coreGeo = new THREE.IcosahedronGeometry(0.4, 0);
    const coreMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.8,
      flatShading: true,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    return group;
  }

  // --- INPUT CONTROLS ---

  public moveLeft() {
    if (!this.isRunning || this.isPaused) return;
    if (this.currentLaneIndex > 0) {
      this.currentLaneIndex--;
      this.targetPlayerX = this.LANE_POSITIONS[this.currentLaneIndex];
    }
  }

  public moveRight() {
    if (!this.isRunning || this.isPaused) return;
    if (this.currentLaneIndex < this.LANE_POSITIONS.length - 1) {
      this.currentLaneIndex++;
      this.targetPlayerX = this.LANE_POSITIONS[this.currentLaneIndex];
    }
  }

  public jump() {
    if (!this.isRunning || this.isPaused) return;
    if (!this.isJumping) {
      this.isJumping = true;
      this.playerVelocityY = this.JUMP_FORCE;
      this.isSliding = false;
      soundEngine.playJump();
    }
  }

  public slide() {
    if (!this.isRunning || this.isPaused) return;
    if (!this.isSliding) {
      this.isSliding = true;
      this.slideTimer = 0.65; // slide duration in seconds
      if (this.isJumping) {
        // Slam down quickly
        this.playerVelocityY = -this.JUMP_FORCE * 1.5;
      }
      soundEngine.playSlide();
    }
  }

  public activateBoost() {
    if (!this.isRunning || this.isPaused) return;
    if (this.powerups.boost <= 0) {
      this.powerups.boost = 4.0;
      soundEngine.playBoostStart();
      this.callbacks.onPowerupCollect('boost', 4.0);
    }
  }

  // --- GAME LIFECYCLE ---

  public start() {
    this.resetState();
    this.isRunning = true;
    this.isPaused = false;
    soundEngine.startMusic();
    this.lastTime = performance.now();
    this.animate();
  }

  public pause() {
    this.isPaused = true;
    soundEngine.stopMusic();
  }

  public resume() {
    this.isPaused = false;
    soundEngine.startMusic();
    this.lastTime = performance.now();
  }

  public stop() {
    this.isRunning = false;
    this.isPaused = false;
    soundEngine.stopMusic();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private resetState() {
    this.speed = this.baseSpeed + (this.craftConfig.stats.speed - 3) * 4;
    this.distance = 0;
    this.score = 0;
    this.runCrystals = 0;
    this.multiplier = 1;
    this.combo = 0;
    this.comboResetTimer = 0;

    this.currentLaneIndex = 1;
    this.playerX = 0;
    this.targetPlayerX = 0;
    this.playerY = 0.5;
    this.playerVelocityY = 0;
    this.isJumping = false;
    this.isSliding = false;
    this.slideTimer = 0;

    this.powerups = {
      shield: 0,
      magnet: 0,
      boost: 0,
      multiplier2x: 0,
      chrono: 0,
    };

    // Clear world obstacles and collectibles
    this.obstacles.forEach((o) => this.worldGroup.remove(o.mesh));
    this.obstacles = [];
    this.collectibles.forEach((c) => this.worldGroup.remove(c.mesh));
    this.collectibles = [];

    // Reset track chunks
    this.trackSegments.forEach((chunk, i) => {
      chunk.position.z = -i * this.CHUNK_LENGTH;
    });

    this.nextObstacleZ = -45;

    // Initial obstacle population
    for (let z = -45; z > -350; z -= 30) {
      this.spawnObstacleAndCollectibles(z);
      this.nextObstacleZ = z - 30;
    }
  }

  // --- MAIN LOOP & UPDATE ---

  private lastTime = 0;

  private animate = () => {
    if (!this.isRunning) return;

    this.animationFrameId = requestAnimationFrame(this.animate);

    const now = performance.now();
    let delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (this.isPaused) return;

    // Safety clamp delta to prevent giant leaps on tab switches
    if (delta > 0.1) delta = 0.1;

    this.update(delta);
    this.render();
  };

  private update(delta: number) {
    // 1. Calculate Effective Speed
    let currentSpeed = this.speed;
    if (this.powerups.boost > 0) {
      currentSpeed *= 1.7; // Turbo overdrive!
    } else if (this.powerups.chrono > 0) {
      currentSpeed *= 0.65; // Matrix slow motion!
    }

    // Gradually ramp speed over distance
    this.speed = Math.min(this.maxSpeed, this.baseSpeed + this.distance * 0.035);
    const speedKmh = Math.round(currentSpeed * 1.8);
    soundEngine.updateTempo(currentSpeed / this.baseSpeed);

    // 2. Advance Track & Distance
    const travel = currentSpeed * delta;
    this.distance += travel;

    // Score accumulation
    const activeMultiplier = this.multiplier * (this.powerups.multiplier2x > 0 ? 2 : 1);
    this.score += Math.round(travel * 2 * activeMultiplier);

    this.callbacks.onScoreUpdate(this.score, Math.round(this.distance), speedKmh, activeMultiplier);

    // 3. Move Track Chunks towards player (+Z)
    this.trackSegments.forEach((chunk) => {
      chunk.position.z += travel;
      if (chunk.position.z > this.CHUNK_LENGTH) {
        // Recycle behind camera to the front
        chunk.position.z -= this.CHUNK_COUNT * this.CHUNK_LENGTH;
      }
    });

    // 4. Update Obstacles and Collectibles Positions
    this.obstacles.forEach((o) => {
      o.mesh.position.z += travel;
      o.z += travel;
      o.boundingBox.setFromObject(o.mesh);
    });

    this.collectibles.forEach((c) => {
      c.mesh.position.z += travel;
      c.z += travel;
      // Spin crystal / powerup
      c.mesh.rotation.y += delta * 2.5;
      const ring = c.mesh.getObjectByName('powerRing');
      if (ring) {
        ring.rotation.x += delta * 3;
        ring.rotation.y += delta * 2;
      }
    });

    // Spawn new obstacles as distance increases
    const furthestZ = Math.min(...this.trackSegments.map((c) => c.position.z)) - this.CHUNK_LENGTH;
    if (this.nextObstacleZ > furthestZ) {
      this.spawnObstacleAndCollectibles(this.nextObstacleZ);
      this.nextObstacleZ -= 26 + Math.random() * 12;
    }

    // Clean up passed obstacles & collectibles
    this.obstacles = this.obstacles.filter((o) => {
      if (o.z > 20) {
        this.worldGroup.remove(o.mesh);
        return false;
      }
      return true;
    });

    this.collectibles = this.collectibles.filter((c) => {
      if (c.z > 20) {
        this.worldGroup.remove(c.mesh);
        return false;
      }
      return true;
    });

    // 5. Player Lateral Navigation & Damping
    const agility = this.craftConfig.stats.agility;
    const lerpSpeed = 12 + agility * 2.5;
    this.playerX += (this.targetPlayerX - this.playerX) * Math.min(1, delta * lerpSpeed);
    this.playerGroup.position.x = this.playerX;

    // Banking roll effect during lane transition
    const lateralDelta = this.targetPlayerX - this.playerX;
    this.playerGroup.rotation.z = -lateralDelta * 0.22;
    this.playerGroup.rotation.y = lateralDelta * 0.15;

    // Spin animations on specific craft parts
    const spinningRing = this.playerGroup.getObjectByName('spinningRing');
    if (spinningRing) spinningRing.rotation.z += delta * 4;
    const spinningCore = this.playerGroup.getObjectByName('spinningCore');
    if (spinningCore) {
      spinningCore.rotation.x += delta * 2.5;
      spinningCore.rotation.y += delta * 3;
    }

    // 6. Vertical Movement (Jump & Slide)
    if (this.isJumping) {
      this.playerVelocityY += this.GRAVITY * delta;
      this.playerY += this.playerVelocityY * delta;

      if (this.playerY <= 0.5) {
        this.playerY = 0.5;
        this.playerVelocityY = 0;
        this.isJumping = false;
      }
    }

    if (this.isSliding) {
      this.slideTimer -= delta;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    // Apply player vertical position and scale (flatten on slide)
    this.playerGroup.position.y = this.playerY;
    if (this.isSliding) {
      this.playerGroup.scale.set(1.1, 0.35, 1.2);
    } else {
      this.playerGroup.scale.set(1, 1, 1);
    }

    // Pitch craft on jump/slide
    if (this.isJumping) {
      this.playerGroup.rotation.x = -this.playerVelocityY * 0.02;
    } else if (this.isSliding) {
      this.playerGroup.rotation.x = 0.15;
    } else {
      this.playerGroup.rotation.x = 0;
    }

    // 7. Powerup Timers & FX
    Object.keys(this.powerups).forEach((key) => {
      const pKey = key as keyof PowerupTimers;
      if (this.powerups[pKey] > 0) {
        this.powerups[pKey] = Math.max(0, this.powerups[pKey] - delta);
      }
    });

    // Shield visualization
    if (this.shieldMesh) {
      if (this.powerups.shield > 0) {
        const timeMs = performance.now();
        (this.shieldMesh.material as THREE.MeshStandardMaterial).opacity = 0.6 + Math.sin(timeMs * 0.01) * 0.2;
        this.shieldMesh.rotation.y += delta * 2;
        this.shieldMesh.rotation.x += delta;
      } else {
        (this.shieldMesh.material as THREE.MeshStandardMaterial).opacity = 0;
      }
    }

    // Magnet Attraction
    if (this.powerups.magnet > 0) {
      const magnetRadius = 14 + this.craftConfig.stats.magnet * 3;
      this.collectibles.forEach((c) => {
        if (!c.collected && c.z < 8 && c.z > -magnetRadius) {
          // Pull towards player
          c.mesh.position.x += (this.playerX - c.mesh.position.x) * Math.min(1, delta * 14);
          c.mesh.position.y += (this.playerY - c.mesh.position.y) * Math.min(1, delta * 14);
        }
      });
    }

    // Combo Reset Countdown
    if (this.combo > 0) {
      this.comboResetTimer -= delta;
      if (this.comboResetTimer <= 0) {
        this.combo = 0;
      }
    }

    // 8. Collision Detection
    this.checkCollisions();

    // 9. Speed Particles Update
    if (this.speedParticles) {
      const positions = this.speedParticles.geometry.attributes.position.array as Float32Array;
      const count = positions.length / 3;
      for (let i = 0; i < count; i++) {
        positions[i * 3 + 2] += currentSpeed * delta * 1.5;
        if (positions[i * 3 + 2] > 10) {
          positions[i * 3 + 2] = -180;
          positions[i * 3] = (Math.random() - 0.5) * 35;
          positions[i * 3 + 1] = Math.random() * 15 + 0.5;
        }
      }
      this.speedParticles.geometry.attributes.position.needsUpdate = true;
    }

    // 10. Camera Choreography
    this.updateCamera(delta, currentSpeed);
  }

  private checkCollisions() {
    const playerBox = new THREE.Box3();
    const halfWidth = 0.65;
    const halfHeight = this.isSliding ? 0.4 : 0.85;
    const halfDepth = 1.1;

    playerBox.min.set(
      this.playerX - halfWidth,
      this.playerY - halfHeight * 0.5,
      -halfDepth
    );
    playerBox.max.set(
      this.playerX + halfWidth,
      this.playerY + halfHeight,
      halfDepth
    );

    // Collectibles collection
    this.collectibles.forEach((c) => {
      if (c.collected) return;

      const dist = Math.hypot(
        c.mesh.position.x - this.playerX,
        c.mesh.position.y - this.playerY,
        c.mesh.position.z - 0
      );

      if (dist < 1.7) {
        c.collected = true;
        this.worldGroup.remove(c.mesh);

        if (c.type === 'crystal') {
          this.combo++;
          this.comboResetTimer = 2.0;
          this.runCrystals++;
          soundEngine.playCrystal(this.combo);
          this.callbacks.onCrystalCollect(this.runCrystals, this.combo);
        } else if (c.type === 'powerup' && c.powerupType) {
          const duration = c.powerupType === 'boost' ? 5 : 8;
          this.powerups[c.powerupType] = duration;
          soundEngine.playPowerup();
          this.callbacks.onPowerupCollect(c.powerupType, duration);
        }
      }
    });

    // Obstacle Collisions
    for (const o of this.obstacles) {
      if (o.passed) continue;

      // Check near miss
      if (!o.passed && o.z > 0.8 && o.z < 2.5) {
        const laneDiff = Math.abs(this.LANE_POSITIONS[o.lane] - this.playerX);
        if (laneDiff > 2.0 && laneDiff < 4.2) {
          o.passed = true;
          soundEngine.playNearMiss();
          this.callbacks.onNearMiss();
        }
      }

      // Check direct collision
      if (playerBox.intersectsBox(o.boundingBox)) {
        // Special case: laser barrier slide clearance
        if (o.type === 'high' && this.isSliding) {
          // Safely slid under!
          o.passed = true;
          continue;
        }

        // Special case: low spike jump clearance
        if (o.type === 'low' && this.playerY > 1.6) {
          // Safely jumped over!
          o.passed = true;
          continue;
        }

        // Collision Occurred!
        if (this.powerups.boost > 0) {
          // In Overdrive: shatter obstacle!
          soundEngine.playShieldBreak();
          this.worldGroup.remove(o.mesh);
          o.passed = true;
          this.cameraShake = 0.35;
          continue;
        }

        if (this.powerups.shield > 0) {
          // Shield absorbs blow
          this.powerups.shield = 0;
          soundEngine.playShieldBreak();
          this.worldGroup.remove(o.mesh);
          o.passed = true;
          this.cameraShake = 0.5;
          continue;
        }

        // Game Over Fatal Crash!
        this.triggerCrash();
        break;
      }
    }
  }

  private triggerCrash() {
    this.isRunning = false;
    soundEngine.playCrash();
    soundEngine.stopMusic();
    this.cameraShake = 1.2;

    // Small delay to let crash resonate
    setTimeout(() => {
      this.callbacks.onGameOver();
    }, 450);
  }

  // --- CAMERA UPDATE ---

  private updateCamera(delta: number, currentSpeed: number) {
    let targetX = this.playerX * 0.45;
    let targetY = 4.8;
    let targetZ = 8.5;
    let lookY = 2.0;

    if (this.cameraMode === 'high') {
      targetY = 9.0;
      targetZ = 12.0;
      lookY = 1.0;
    } else if (this.cameraMode === 'cockpit') {
      targetY = 1.8;
      targetZ = 3.2;
      lookY = 1.5;
      targetX = this.playerX;
    }

    // Dynamic FOV widening during boost
    const baseFov = 65;
    const targetFov = this.powerups.boost > 0 ? 82 : baseFov + (currentSpeed - this.baseSpeed) * 0.15;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, delta * 6);
    this.camera.updateProjectionMatrix();

    // Smooth camera damping
    this.cameraTargetPos.set(targetX, targetY, targetZ);
    this.camera.position.lerp(this.cameraTargetPos, Math.min(1, delta * 8));

    // Camera shake
    if (this.cameraShake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShake;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShake;
      this.cameraShake = Math.max(0, this.cameraShake - delta * 2.5);
    }

    this.cameraLookTarget.set(this.playerX * 0.3, lookY, -18);
    this.camera.lookAt(this.cameraLookTarget);
  }

  private render() {
    this.renderer.render(this.scene, this.camera);
  }

  private setupResizeListener() {
    window.addEventListener('resize', this.onWindowResize);
  }

  private onWindowResize = () => {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  public dispose() {
    this.stop();
    window.removeEventListener('resize', this.onWindowResize);
    if (this.renderer && this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
  }
}
