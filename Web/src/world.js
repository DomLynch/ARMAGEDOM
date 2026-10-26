import { safehouseCrosses } from "./engine/safehouse.js";
import { createRouteGuidance } from "./engine/route-guidance.js";
import { createExitRings } from "./engine/exit-rings.js";
import { createGeometry } from "./world-geometry.js";
import { areaDisplayName, createAreaRegistry } from "./area-registry.js";
import { validateAreaMetadata, validateAreaGeometry } from "./engine/area-content.js";
import { GAME_DATA } from "./engine/game-data.js";
const VIEW = GAME_DATA.areaRuntime.view; // data/areaRuntime.json: texture budget, camera clip planes, zoom boosts and lifts
const MIB = 1024 * 1024; // tuning-ok: bytes in a MiB, a unit conversion
const ASPECT = VIEW.artSize[0] / VIEW.artSize[1];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// GPU bytes of an RGBA backdrop: 1x its pixels because it is uploaded without mipmaps (a full mip chain would add a third, 4/3 in all).
export const backdropTextureBytes = (texture, mipped = false) =>
  (texture.image?.width ?? 0) * (texture.image?.height ?? 0) * 4 * (mipped ? 4 / 3 : 1); // tuning-ok: RGBA bytes; a mip chain adds a third
// Unity SmoothDamp's critically damped crop; the calibrated camera never moves.
function damp(value, target, velocity, time, dt) {
  const omega = 2 / Math.max(0.0001, time), // tuning-ok: SmoothDamp omega
    x = omega * dt,
    decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x); // tuning-ok: SmoothDamp decay polynomial
  const change = value - target,
    temp = (velocity + omega * change) * dt;
  return [target + (change + temp) * decay, (velocity - omega * temp) * decay];
}
function initialSpawn(geometry, registry) {
  const row = registry.get(registry.initialArea);
  return row.id === "westminster" || row.visibility === "private" ? { x: VIEW.londonEntry.x, z: VIEW.londonEntry.z } : geometry.ground(row.entry);
}
export class LondonWorld {
  constructor({
    THREE,
    scene,
    camera,
    layout,
    texture,
    manifest = null,
    baseUrl = null,
    viewZoomMultiplier = 1,
    registry = null,
    textureBudgetBytes = VIEW.textureBudgetMiB * MIB,
    validatedLayouts = null,
    residentPlacements = null,
    areaAtmosphere = null,
    areaLighting = null,
    areaWater = null,
    lootRules = null,
    progressionData = null,
    expeditionData = null,
    bossData = null,
    uniqueRewardData = null,
    populationData = null,
    flameData = null,
    rifleData = null,
    bossEquipmentData = null,
    safehouseData = null,
    reaperData = null,
    markedData = null,
  }) {
    if (!Number.isFinite(viewZoomMultiplier) || viewZoomMultiplier < 1)
      throw Error("View zoom multiplier must be finite and at least 1");
    if (
      !Number.isFinite(textureBudgetBytes) ||
      textureBudgetBytes < VIEW.textureBudgetMinMiB * MIB ||
      textureBudgetBytes > VIEW.textureBudgetMiB * MIB
    )
      throw Error("Invalid texture budget");
    this.markedData = markedData;
    this.reaperData = reaperData;
    this.safehouseData = safehouseData;
    this.bossEquipmentData = bossEquipmentData;
    this.rifleData = rifleData;
    this.flameData = flameData;
    this.populationData = populationData;
    this.uniqueRewardData = uniqueRewardData;
    this.bossData = bossData;
    this.expeditionData = expeditionData;
    this.progressionData = progressionData;
    this.lootRules = lootRules;
    this.areaWater = areaWater;
    this.areaLighting = areaLighting;
    this.residentPlacements = residentPlacements;
    this.areaAtmosphere = areaAtmosphere;
    this.validatedLayouts = validatedLayouts;
    this.textureBudgetBytes = textureBudgetBytes;
    this.viewZoomMultiplier = viewZoomMultiplier;
    this.THREE = THREE;
    this.scene = scene;
    this.camera = camera;
    this.layout = layout;
    this.texture = texture;
    this.geometry = createGeometry(layout);
    this.spawn = initialSpawn(this.geometry, registry ?? createAreaRegistry({ manifest }));
    this.cameraRight = { x: 1, z: 0 };
    this.cameraForward = { x: 0, z: 1 };
    this.manifest = manifest;
    this.registry = registry ?? createAreaRegistry({ manifest });
    this.baseUrl = baseUrl;
    this.areaId = this.registry.initialArea;
    this.disposed = false;
    this.center = { x: 0.5, y: 0.5 }; // tuning-ok: centre of the painting
    this.velocity = { x: 0, y: 0 };
    this.group = new THREE.Group();
    this.group.name = "London registered image stage";
    camera.fov = layout.fieldOfView;
    camera.aspect = ASPECT;
    camera.near = VIEW.cameraNear;
    camera.far = VIEW.cameraFar;
    camera.position.set(0, layout.height, layout.distance);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, -layout.targetZ);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    this.calibrated = camera.projectionMatrix.clone();
    this.crop = new THREE.Matrix4();
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.hit = new THREE.Vector3();
    this.ndc = new THREE.Vector2();
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    // The backdrop is never drawn smaller than its pixels (view zoom is at least 1), so it needs no mip chain: no generation at area
    // preparation and a third less GPU memory. See textureBytes().
    texture.generateMipmaps = false;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    this.backdrop = this.quad(
      [
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 1, y: 0 },
        { x: 0, y: 0 },
      ],
      100,
      new THREE.MeshBasicMaterial({
        map: texture,
        color: new THREE.Color(layout.exposure, layout.exposure, layout.exposure),
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
      -100,
    );
    this.backdrop.name = "Original London image";
    const depth = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });
    this.masks = layout.masks.map((mask) => {
      const foot = this.geometry.ground(mask.foot),
        distance = this.geometry.point(foot).depth;
      const mesh = this.quad(mask.points, distance, depth, -90);
      mesh.name = mask.name;
      return mesh;
    });
    this.depthMaterial = depth;
    this.routeGuidance = createRouteGuidance(this);
    this.exitRings = createExitRings(this);
    scene.add(this.group);
    this.update(this.spawn, 0, VIEW.artSize[0], VIEW.artSize[1], true);
  }
  toRender(position, height = 0) {
    return new this.THREE.Vector3(position.x, height, -position.z);
  }
  quad(points, distance, material, order, registered = false) {
    const { THREE, camera } = this,
      positions = [],
      uv = [],
      indices = [];
    for (const p of points) {
      const v = new THREE.Vector3(2 * p.x - 1, 1 - 2 * p.y, 0.5); // tuning-ok: painting fraction to NDC, mid-depth
      if (registered) v.applyMatrix4(this.calibrated.clone().invert());
      else v.unproject(camera).applyMatrix4(camera.matrixWorldInverse);
      v.multiplyScalar(distance / -v.z).applyMatrix4(camera.matrixWorld);
      positions.push(v.x, v.y, v.z);
      uv.push(p.x, 1 - p.y);
    }
    for (let i = 1; i < points.length - 1; i++) indices.push(0, i, i + 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); // tuning-ok: x, y, z per vertex
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); // tuning-ok: u, v per vertex
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    return mesh;
  }
  move(position, delta, radius) {
    return this.geometry.move(position, delta, radius);
  }
  lineClear(a, b) {
    return !safehouseCrosses({ world: this }, a, b) && this.geometry.lineClear(a, b);
  }
  get actorScale() {
    return this.layout.characterScale;
  }
  travelAt(position) {
    const point = this.geometry.point(position),
      link = this.registry
        .links(this.areaId)
        .find((link) =>
          Object.entries(link.condition).every(([key, value]) =>
            key === "xMin"
              ? point.x > value
              : key === "xMax"
                ? point.x < value
                : key === "yMin"
                  ? point.y > value
                  : point.y < value,
          ),
        );
    return link ? { areaId: link.to, entryPoint: { ...link.entry } } : null;
  }
  exitHint(position) {
    const guidance = this.routeGuidance?.hint(position, this);
    if (guidance) return guidance;
    let nearest = null,
      distance = VIEW.exitHintMeters;
    for (const link of this.registry.links(this.areaId)) {
      if (this.routeGuidance?.allowsExitHint?.(link.to) === false) continue;
      const c = link.condition,
        point = this.geometry.point(position);
      const target = { x: clamp(point.x, c.xMin ?? 0, c.xMax ?? 1), y: clamp(point.y, c.yMin ?? 0, c.yMax ?? 1) };
      const ground = this.geometry.ground(target),
        gap = Math.hypot(position.x - ground.x, position.z - ground.z);
      if (gap < distance) {
        distance = gap;
        nearest = link.to;
      }
    }
    return nearest ? `EXIT → ${areaDisplayName(nearest).toUpperCase()}` : "";
  }
  async loadArea(areaId, entryPoint = this.registry.get(areaId)?.entry) {
    if (!this.registry.has(areaId) || !entryPoint) throw Error("Unknown London area");
    const cache = (this.areaCache ??= this.createAreaCache()),
      generation = ++cache.generation,
      release = this.leaseArea(areaId);
    try {
      const next = await this.prepareArea(areaId),
        entry = next.geometry.ground(entryPoint);
      if (!next.geometry.clear(entry, VIEW.entryClearance)) throw Error("London entry is blocked");
      if (cache.disposed || generation !== cache.generation) throw Error("London load superseded");
      const { scene, camera, THREE } = this,
        source = { ...this },
        sourceCamera = camera.clone(),
        sourceStage = cache.stages.get(this.areaId);
      const previous = Object.assign(Object.create(LondonWorld.prototype), this, {
        scene: new THREE.Scene(),
        camera: sourceCamera.clone(),
        gpuReady: sourceStage?.gpuReady ?? false,
      });
      try {
        // Destination work can fail; keep the source attached until it succeeds.
        next.update(entry, 0, this.width, this.height, true);
        camera.copy(next.camera, false);
        previous.scene.add(this.group);
        cache.stages.set(this.areaId, previous);
        const leaving = source.areaId;
        Object.assign(this, next, { scene, camera, areaCache: cache, spawn: { ...entry } });
        cache.activeArea = areaId;
        cache.previousArea = leaving;
        scene.add(this.group);
        this.trimParkedStages();
        return { ...entry };
      } catch (error) {
        try {
          Object.assign(this, source);
          camera.copy(sourceCamera, false);
          scene.add(source.group);
          if (next.group !== source.group) next.scene.add(next.group);
          cache.activeArea = source.areaId;
          if (sourceStage) cache.stages.set(source.areaId, sourceStage);
        } catch (recovery) {
          throw new AggregateError([error, recovery], "London source recovery failed");
        }
        throw error;
      }
    } finally {
      release();
    }
  }
  createAreaCache() {
    const initial = Object.assign(Object.create(LondonWorld.prototype), this, {
      scene: new this.THREE.Scene(),
      camera: this.camera.clone(),
    });
    return {
      stages: new Map([[this.areaId, initial]]),
      pending: new Map(),
      leases: new Map(),
      usage: new Map([[this.areaId, 0]]),
      nextUse: 1,
      activeArea: this.areaId,
      evictions: 0,
      lastEvicted: null,
      generation: 0,
      disposed: false,
    };
  }
  leaseArea(areaId) {
    if (!this.registry.has(areaId)) throw Error("Unknown London area");
    const cache = (this.areaCache ??= this.createAreaCache());
    if (cache.disposed) throw Error("London cache disposed");
    cache.leases.set(areaId, (cache.leases.get(areaId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const count = (cache.leases.get(areaId) ?? 0) - 1;
      if (count > 0) cache.leases.set(areaId, count);
      else cache.leases.delete(areaId);
    };
  }
  // Parked-area budget (set while prefetch is on): at most `maxAreas` parked stages or `maxBytes` of their textures,
  // whichever is reached first. Least recently used go first; the area just left is never evicted here.
  trimParkedStages() {
    const cache = this.areaCache,
      limit = cache?.parkedLimit;
    if (!limit) return;
    const parked = [...cache.stages].filter(([id]) => id !== cache.activeArea);
    const bytes = () => parked.reduce((n, [, stage]) => n + stage.textureBytes(), 0);
    const candidates = parked
      .filter(([id]) => id !== cache.previousArea && !cache.pending.has(id) && !cache.leases.has(id))
      .sort(([a], [b]) => (cache.usage.get(a) ?? 0) - (cache.usage.get(b) ?? 0));
    for (const [id, stage] of candidates) {
      if (parked.length <= limit.maxAreas && bytes() <= limit.maxBytes) break;
      cache.stages.delete(id);
      cache.usage.delete(id);
      parked.splice(
        parked.findIndex(([other]) => other === id),
        1,
      );
      stage.disposeStage();
      cache.evictions++;
      cache.lastEvicted = id;
    }
  }
  setParkedLimit(limit) {
    (this.areaCache ??= this.createAreaCache()).parkedLimit = limit;
  }
  // Layout and backdrop files a later prepareArea would fetch; empty once the stage is prepared.
  areaPrefetchUrls(areaId) {
    const row = this.registry.get(areaId);
    if (!row || this.areaCache?.stages.has(areaId)) return [];
    return [row.layoutRef, row.backdropRef]
      .filter((ref) => ref !== row.layoutRef || !this.validatedLayouts?.[ref])
      .map((ref) => new URL(this.registry.asset(ref).path, this.baseUrl).href);
  }
  admitTexture(bytes) {
    const cache = this.areaCache,
      budget = this.textureBudgetBytes;
    let total = [...cache.stages.values()].reduce((n, stage) => n + stage.textureBytes(), 0) + bytes;
    if (total <= budget) return;
    const candidates = [...cache.stages]
        .filter(([id]) => id !== cache.activeArea && !cache.pending.has(id) && !cache.leases.has(id))
        .sort(([a], [b]) => (cache.usage.get(a) ?? 0) - (cache.usage.get(b) ?? 0)),
      evict = [];
    for (const [id, stage] of candidates) {
      if (total <= budget) break;
      evict.push([id, stage]);
      total -= stage.textureBytes();
    }
    if (total > budget) throw Error("London prepared texture budget exceeded; active or in-flight areas retained");
    for (const [id, stage] of evict) {
      cache.stages.delete(id);
      cache.usage.delete(id);
      stage.disposeStage();
      cache.evictions++;
      cache.lastEvicted = id;
    }
  }
  startingPoint() {
    return initialSpawn(this.geometry, this.registry);
  }
  async prepareArea(areaId) {
    if (!this.registry.has(areaId)) throw Error("Unknown London area");
    const cache = (this.areaCache ??= this.createAreaCache());
    if (cache.disposed) throw Error("London cache disposed");
    if (cache.stages.has(areaId)) {
      cache.usage.set(areaId, cache.nextUse++);
      return cache.stages.get(areaId);
    }
    if (cache.pending.has(areaId)) return cache.pending.get(areaId);
    const task = (async () => {
      const row = this.registry.get(areaId);
      let layout =
        this.validatedLayouts?.[row.layoutRef] ??
        [...cache.stages.values()].find((stage) => this.registry.get(stage.areaId).layoutRef === row.layoutRef)?.layout;
      if (!layout) {
        const response = await fetch(new URL(this.registry.asset(row.layoutRef).path, this.baseUrl));
        if (!response.ok) throw Error(`London layout HTTP ${response.status}`);
        layout = await response.json();
      }
      layout = validateAreaGeometry(
        this.registry,
        areaId,
        layout,
        this.residentPlacements,
        this.expeditionData,
        this.bossData,
        this.populationData,
        this.flameData,
        this.safehouseData,
      );
      const texture = await new this.THREE.TextureLoader().loadAsync(
        new URL(this.registry.asset(row.backdropRef).path, this.baseUrl).href,
      );
      let next;
      try {
        if (cache.disposed) throw Error("London cache disposed");
        this.admitTexture(backdropTextureBytes(texture));
        next = new LondonWorld({
          THREE: this.THREE,
          scene: new this.THREE.Scene(),
          camera: this.camera.clone(),
          layout,
          texture,
          manifest: this.manifest,
          registry: this.registry,
          baseUrl: this.baseUrl,
          viewZoomMultiplier: this.viewZoomMultiplier,
          textureBudgetBytes: this.textureBudgetBytes,
          validatedLayouts: this.validatedLayouts,
          residentPlacements: this.residentPlacements,
          areaAtmosphere: this.areaAtmosphere,
          areaLighting: this.areaLighting,
          areaWater: this.areaWater,
          lootRules: this.lootRules,
          progressionData: this.progressionData,
          expeditionData: this.expeditionData,
          bossData: this.bossData,
          uniqueRewardData: this.uniqueRewardData,
          populationData: this.populationData,
          bossEquipmentData: this.bossEquipmentData,
          safehouseData: this.safehouseData,
          reaperData: this.reaperData,
          markedData: this.markedData,
          rifleData: this.rifleData,
          flameData: this.flameData,
        });
        next.areaId = areaId;
        next.exitRings.dispose(); // built in the constructor for the initial area; rebuilt for the area this stage really is
        next.exitRings = createExitRings(next);
        cache.stages.set(areaId, next);
        cache.usage.set(areaId, cache.nextUse++);
        return next;
      } catch (error) {
        if (next) next.disposeStage();
        else {
          texture.dispose();
          texture.image = null;
        }
        throw error;
      }
    })();
    cache.pending.set(areaId, task);
    try {
      return await task;
    } finally {
      cache.pending.delete(areaId);
    }
  }
  textureBytes() {
    return backdropTextureBytes(this.texture);
  }
  preparationStats() {
    const c = this.areaCache;
    return {
      areas: c ? [...c.stages.keys()] : [this.areaId],
      pending: c ? [...c.pending.keys()] : [],
      textureBudgetBytes: this.textureBudgetBytes,
      leases: c ? [...c.leases.keys()] : [],
      evictions: c?.evictions ?? 0,
      lastEvicted: c?.lastEvicted ?? null,
      retainedLayouts: c ? new Set([...c.stages.values()].map((s) => s.layout)).size : 1,
      estimatedTextureBytes: c ? [...c.stages.values()].reduce((n, s) => n + s.textureBytes(), 0) : this.textureBytes(),
    };
  }
  isAreaReady(areaId) {
    return !!this.areaCache?.stages.get(areaId)?.gpuReady;
  }
  unmarkAreaReady(areaId) {
    const stage = this.areaCache?.stages.get(areaId);
    if (stage) stage.gpuReady = false;
  }
  markAreaReady(areaId) {
    const stage = this.areaCache?.stages.get(areaId);
    if (stage) stage.gpuReady = true;
    if (areaId === this.areaId) this.gpuReady = true;
  }
  cachedArea(areaId) {
    return this.areaCache?.stages.get(areaId);
  }
  invalidateReadiness() {
    if (this.areaCache) for (const stage of this.areaCache.stages.values()) stage.gpuReady = false;
    this.gpuReady = false;
  }
  screenToGround(ndcX, ndcY) {
    this.ndc.set(ndcX, ndcY);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.ray.intersectPlane(this.plane, this.hit);
    return hit ? { x: hit.x, z: -hit.z } : null;
  }
  update(playerPosition, dt, width, height, immediate = false) {
    this.width = width;
    this.height = height;
    const { layout, geometry, camera } = this;
    const p = geometry.point(playerPosition);
    let zoom = layout.zoom;
    if (layout.followPlayerSize) {
      const reference = geometry.ground({ ...VIEW.followReference });
      const projectedHeight = (q) => Math.abs(geometry.point(q, VIEW.referenceHeight).y - geometry.point(q).y);
      zoom = clamp((zoom * projectedHeight(reference)) / projectedHeight(playerPosition), 1, VIEW.maxZoom);
    }
    const aspect = Math.max(1, width) / Math.max(1, height),
      portrait = aspect < 1;
    if (portrait) {
      // A scaled 2m reference stays ~portraitActorPixels CSS pixels; zoom>=1 keeps the finite painting covering the screen.
      const actorHeight = Math.abs(geometry.point(playerPosition, VIEW.referenceHeight * layout.characterScale).y - p.y);
      zoom = clamp(VIEW.portraitActorPixels / (actorHeight * Math.max(1, height)), 1, VIEW.maxZoom);
    }
    if (!portrait) zoom *= VIEW.landscapeZoomBoost;
    else zoom *= VIEW.portraitZoomBoost;
    zoom *= this.viewZoomMultiplier;
    const zx = zoom * Math.max(1, ASPECT / aspect),
      zy = zoom * Math.max(1, aspect / ASPECT);
    const ex = 0.5 / zx, // tuning-ok: half the visible painting width
      ey = 0.5 / zy, // tuning-ok: half the visible painting height
      target = {
        x: clamp(p.x, ex, 1 - ex),
        y: clamp(1 - p.y + (portrait ? VIEW.portraitLift / zy : VIEW.landscapeLift), ey, 1 - ey),
      };
    if (immediate) {
      this.center = target;
      this.velocity = { x: 0, y: 0 };
    } else {
      [this.center.x, this.velocity.x] = damp(
        this.center.x,
        target.x,
        this.velocity.x,
        layout.followSeconds,
        Math.max(0, Math.min(dt, VIEW.maxFollowSeconds)),
      );
      [this.center.y, this.velocity.y] = damp(
        this.center.y,
        target.y,
        this.velocity.y,
        layout.followSeconds,
        Math.max(0, Math.min(dt, VIEW.maxFollowSeconds)),
      );
    }
    this.center.x = clamp(this.center.x, ex, 1 - ex);
    this.center.y = clamp(this.center.y, ey, 1 - ey);
    this.crop.identity();
    this.crop.elements[0] = zx;
    this.crop.elements[5] = zy;
    this.crop.elements[12] = -2 * zx * (this.center.x - 0.5); // tuning-ok: painting fraction to NDC offset
    this.crop.elements[13] = -2 * zy * (this.center.y - 0.5); // tuning-ok: painting fraction to NDC offset
    camera.projectionMatrix.multiplyMatrices(this.crop, this.calibrated);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    this.routeGuidance?.update(playerPosition, this);
  }
  dispose() {
    if (this.areaCache) {
      const cache = this.areaCache;
      if (cache.disposed) return;
      cache.disposed = true;
      cache.generation++;
      for (const stage of cache.stages.values()) stage.disposeStage();
      cache.stages.clear();
      cache.usage.clear();
      cache.leases.clear();
      this.disposed = true;
      return;
    }
    this.disposeStage();
  }
  disposeStage() {
    if (this.disposed) return;
    this.disposed = true;
    this.routeGuidance?.dispose();
    this.exitRings?.dispose();
    this.group.removeFromParent();
    this.group.traverse((object) => object.geometry?.dispose());
    this.backdrop.material.dispose();
    this.depthMaterial.dispose();
    this.texture.dispose();
    this.texture.image = null;
  }
}
export async function createWorld({
  THREE,
  renderer,
  scene,
  camera,
  baseUrl = globalThis.document?.baseURI,
  viewZoomMultiplier = 1,
  content = null,
}) {
  let manifest = content?.manifest;
  if (!manifest) {
    const response = await fetch(new URL("world/manifest.json", baseUrl));
    if (!response.ok) throw Error(`London manifest HTTP ${response.status}`);
    manifest = await response.json();
  }
  const registry = content?.registry ?? createAreaRegistry({ manifest }),
    row = registry.get(registry.initialArea);
  let layout = content?.layouts?.[row.layoutRef];
  if (!layout) {
    const response = await fetch(new URL(registry.asset(row.layoutRef).path, baseUrl));
    if (!response.ok) throw Error(`London layout HTTP ${response.status}`);
    layout = await response.json();
  }
  createGeometry(layout);
  if (!content && manifest.contentRef) {
    if (
      typeof manifest.contentRef !== "string" ||
      !/^[a-z0-9-]+\.json$/.test(manifest.contentRef) ||
      !manifest.files.some((f) => f.path === manifest.contentRef)
    )
      throw Error("Unregistered area content");
    const response = await fetch(new URL("world/" + manifest.contentRef, baseUrl));
    if (!response.ok) throw Error(`London content HTTP ${response.status}`);
    content = validateAreaMetadata(await response.json(), registry);
  }
  layout = validateAreaGeometry(
    registry,
    registry.initialArea,
    layout,
    content?.residents,
    content?.expedition,
    content?.bossData,
    content?.populationData,
    content?.flameData,
    content?.safehouseData,
  );
  const geometry = createGeometry(layout);
  if (!geometry.clear(initialSpawn(geometry, registry), VIEW.entryClearance)) throw Error("London starting spawn is blocked");
  const texture = await new THREE.TextureLoader().loadAsync(
    new URL(registry.asset(row.backdropRef).path, baseUrl).href,
  );
  try {
    return new LondonWorld({
      THREE,
      renderer,
      scene,
      camera,
      layout,
      texture,
      manifest,
      registry,
      baseUrl,
      viewZoomMultiplier,
      textureBudgetBytes: content?.textureBudgetBytes,
      validatedLayouts: content?.layouts,
      residentPlacements: content?.residents,
      areaAtmosphere: content?.atmosphere,
      areaLighting: content?.lighting,
      areaWater: content?.water,
      lootRules: content?.lootRules,
      progressionData: content?.progression,
      expeditionData: content?.expedition,
      bossData: content?.bossData,
      uniqueRewardData: content?.uniqueRewardData,
      populationData: content?.populationData,
      bossEquipmentData: content?.bossEquipmentData,
      safehouseData: content?.safehouseData,
      reaperData: content?.reaperData,
      markedData: content?.markedData,
      rifleData: content?.rifleData,
      flameData: content?.flameData,
    });
  } catch (e) {
    texture.dispose();
    throw e;
  }
}
