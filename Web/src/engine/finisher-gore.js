import * as T from "three";
import { FINISHER_DATA, goreProfile } from "./finisher-data.js";
import { createLocalWound } from "./local-wound.js";
// Small fixed samples of the real render mesh are prepared at actor load. Lethal
// presentation selects a posed skin vertex; it never copies/cuts the body mesh.
export function createFinisherGore({ root, model, rig, camera }) {
  const data = FINISHER_DATA.gore,
    anatomy = data.rigs.find((r) => r.id === rig);
  if (!anatomy || !camera?.isCamera) return null;
  const groups = { body: [], head: [] },
    centres = {},
    eligibleMeshes = [],
    occluders = [];
  model.traverse((m) => {
    if (m.isMesh && m.visible) occluders.push(m);
  });
  for (const region of ["body", "head"])
    centres[region] =
      anatomy[region + "Bones"].map((n) => model.getObjectByName(n)).find((n) => n?.isBone) ??
      (anatomy.material === "machine" ? model.getObjectByName(anatomy.mesh) : null);
  model.traverse((mesh) => {
    if (
      !mesh.isMesh ||
      !mesh.visible ||
      !mesh.geometry?.attributes.normal ||
      (anatomy.material === "machine" && mesh.name !== anatomy.mesh) ||
      (anatomy.material !== "machine" && !mesh.isSkinnedMesh)
    )
      return;
    const labels = [
      mesh.name,
      ...(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => m?.name ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    if (data.excludedSurfaceTokens.some((token) => labels.includes(token))) return;
    eligibleMeshes.push(mesh);
    const count = mesh.geometry.attributes.position.count,
      step = Math.max(1, Math.floor(count / data.sampleLimit)),
      indices = mesh.geometry.attributes.skinIndex,
      weights = mesh.geometry.attributes.skinWeight;
    for (const region of ["body", "head"]) {
      const names = new Set(anatomy[region + "Bones"]);
      for (let i = 0; i < count; i += step) {
        let weight = anatomy.material === "machine" ? 1 : 0;
        if (mesh.isSkinnedMesh && indices && weights)
          for (let k = 0; k < 4; k++)
            if (names.has(mesh.skeleton.bones[indices.getComponent(i, k)]?.name)) weight += weights.getComponent(i, k);
        if (weight >= 0.5) groups[region].push({ mesh, index: i });
      }
    }
  });
  // A small semantic zone may fall between the coarse whole-mesh samples.
  // Refill only sparse zones at preparation, then retain the same fixed64 budget.
  for (const region of ["body", "head"])
    if (groups[region].length < data.sampleLimit / 4) {
      const names = new Set(anatomy[region + "Bones"]),
        dense = [];
      for (const mesh of eligibleMeshes) {
        const indices = mesh.geometry.attributes.skinIndex,
          weights = mesh.geometry.attributes.skinWeight;
        for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
          let weight = anatomy.material === "machine" ? 1 : 0;
          if (mesh.isSkinnedMesh && indices && weights)
            for (let k = 0; k < 4; k++)
              if (names.has(mesh.skeleton.bones[indices.getComponent(i, k)]?.name))
                weight += weights.getComponent(i, k);
          if (weight >= 0.5) dense.push({ mesh, index: i });
        }
      }
      groups[region] = dense;
    }
  for (const region of ["body", "head"]) {
    const a = groups[region];
    if (a.length > data.sampleLimit)
      groups[region] = Array.from(
        { length: data.sampleLimit },
        (_, i) => a[Math.floor((i * a.length) / data.sampleLimit)],
      );
  }
  const woundData =
    anatomy.material === "flesh"
      ? data.wound
      : {
          ...data.wound,
          styles: Object.fromEntries(
            Object.entries(data.wound.styles).map(([id, row]) => [
              id,
              {
                ...row,
                width: row.nonOrganicSize?.[0] ?? row.width,
                height: row.nonOrganicSize?.[1] ?? row.height,
                palette: data.wound.styles.shell.palette,
              },
            ]),
          ),
        };
  const wound = createLocalWound({ THREE: T, parent: root, profile: woundData }),
    p = new T.Vector3(),
    n = new T.Vector3(),
    centre = new T.Vector3(),
    toward = new T.Vector3(),
    d = new T.Vector3(),
    tangent = new T.Vector3(),
    vertical = new T.Vector3(),
    localNormal = new T.Vector3(),
    skin = new T.Matrix4(),
    joint = new T.Matrix4(),
    worldSkin = new T.Matrix4(),
    normalMatrix = new T.Matrix3();
  const surfaceRay = new T.Raycaster(),
    cameraOrigin = new T.Vector3(),
    rayDirection = new T.Vector3();
  let visibilityRays = 0,
    admissionMilliseconds = 0;
  let disposed = false,
    started = false,
    admissionAttempted = false,
    selected = null,
    recipe = null,
    entityId = null,
    anchors = null;
  function posed(sample) {
    const { mesh, index } = sample;
    mesh.getVertexPosition(index, p);
    p.applyMatrix4(mesh.matrixWorld);
    localNormal.fromBufferAttribute(mesh.geometry.attributes.normal, index);
    if (mesh.isSkinnedMesh) {
      const ix = mesh.geometry.attributes.skinIndex,
        w = mesh.geometry.attributes.skinWeight;
      skin.elements.fill(0);
      for (let k = 0; k < 4; k++) {
        const weight = w.getComponent(index, k);
        if (!weight) continue;
        joint.fromArray(mesh.skeleton.boneMatrices, ix.getComponent(index, k) * 16);
        for (let j = 0; j < 16; j++) skin.elements[j] += joint.elements[j] * weight;
      }
      skin.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix);
      worldSkin.copy(mesh.matrixWorld).multiply(skin);
    } else worldSkin.copy(mesh.matrixWorld);
    normalMatrix.getNormalMatrix(worldSkin);
    n.copy(localNormal).applyMatrix3(normalMatrix).normalize();
    return Number.isFinite(p.lengthSq()) && Number.isFinite(n.lengthSq()) && n.lengthSq() > 0.9;
  }
  function preparePose() {
    model.updateWorldMatrix(true, true);
    model.updateMatrixWorld(true);
    model.traverse((m) => {
      if (m.isSkinnedMesh) {
        m.skeleton.update();
        if (!started) m.computeBoundingSphere();
      }
    });
  }
  function surface(sample, style) {
    if (!sample || !posed(sample)) return null;
    const position = p.clone(),
      normal = n.clone();
    tangent.copy(d).addScaledVector(normal, -d.dot(normal));
    if (tangent.lengthSq() < 1e-8) {
      tangent.set(1, 0, 0).addScaledVector(normal, -normal.x);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1).addScaledVector(normal, -normal.z);
    }
    tangent.normalize();
    vertical.crossVectors(normal, tangent).normalize();
    const limit = anatomy.radius * 2 * data.wound.maxZoneFraction,
      width = Math.min(style.width, limit),
      height = Math.min(style.height, limit),
      bottom =
        position.y +
        normal.y * data.wound.surfaceOffset -
        Math.abs(tangent.y) * width * 0.555 -
        Math.abs(vertical.y) * height * 0.555 -
        0.03 * style.reliefScale * Math.max(0, -normal.y);
    return {
      surfaceValidated: true,
      position,
      normal,
      tangent: tangent.clone(),
      surfaceRadius: anatomy.radius,
      visible: bottom >= 0.004,
    };
  }
  function choose(region, style) {
    const origin = centres[region] ?? centres.body;
    if (!origin || !groups[region].length) return null;
    origin.getWorldPosition(centre);
    camera.getWorldPosition(toward);
    toward.sub(centre).normalize();
    let mark = null,
      exit = null,
      far = -Infinity;
    const candidates = [];
    for (const sample of groups[region]) {
      const hit = surface(sample, style);
      if (!hit) continue;
      const delta = hit.position.clone().sub(centre),
        offset = delta.clone().addScaledVector(toward, -delta.dot(toward)).length(),
        score =
          region === "body" && anatomy.material === "flesh"
            ? -delta.length() / anatomy.radius - (offset / anatomy.radius) * 0.5 + hit.normal.dot(toward) * 0.15
            : delta.dot(toward) - offset * 0.35;
      if (hit.visible && hit.normal.dot(toward) > 0.05) candidates.push({ sample, hit, score });
      const along = delta.dot(d);
      if (along > far) {
        far = along;
        exit = sample;
      }
    }
    // Admission-only visibility test: normals on an internal cloth panel may face
    // the camera while another part of that same jacket covers it completely.
    // Once admitted, this exact skin vertex stays bound through every pose.
    camera.getWorldPosition(cameraOrigin);
    for (const candidate of candidates.sort((a, b) => b.score - a.score)) {
      rayDirection.copy(candidate.hit.position).sub(cameraOrigin);
      const distance = rayDirection.length();
      if (distance < 0.01) continue;
      surfaceRay.set(cameraOrigin, rayDirection.divideScalar(distance));
      surfaceRay.near = 0;
      surfaceRay.far = distance - 0.005;
      visibilityRays++;
      const visibleMeshes = occluders.filter((m) => {
        for (let a = m; a && a !== model.parent; a = a.parent) if (!a.visible) return false;
        return true;
      });
      if (!surfaceRay.intersectObjects(visibleMeshes, false).length) {
        mark = candidate.sample;
        break;
      }
    }
    return mark ? { mark, exit: exit ?? mark, region } : null;
  }
  function update(entity) {
    if (disposed) return false;
    const profile = entity?.hp <= 0 && goreProfile(entity.finisher?.recipeId);
    if (!profile) {
      admissionAttempted = false;
      if (started) {
        wound.reset();
        started = false;
        selected = recipe = anchors = null;
      }
      return false;
    }
    const attempting = !started;
    if (attempting && admissionAttempted) return false;
    const admissionBegin = attempting ? performance.now() : 0;
    if (attempting) {
      admissionAttempted = true;
      visibilityRays = 0;
    }
    try {
      d.set(
        entity.finisher.impactDirection?.x ?? entity.facing?.x ?? 0,
        0,
        -(entity.finisher.impactDirection?.z ?? entity.facing?.z ?? 1),
      );
      if (d.lengthSq() < 1e-8) d.set(0, 0, 1);
      d.normalize();
      preparePose();
      const styleId = profile.style,
        style = woundData.styles[styleId],
        region = profile.region === "head" ? (anatomy.upperRegion ?? "head") : profile.region;
      if (!started) {
        recipe = profile;
        selected = choose(region, style) ?? (region === "body" ? null : choose("body", style));
        if (!selected) return false;
        const hit = surface(selected.mark, style);
        if (!wound.start({ victimId: entity.id, styleId, anchor: hit })) return false;
        started = true;
        entityId = entity.id;
      }
      const hit = surface(selected.mark, style),
        exitHit = surface(selected.exit, style);
      wound.update(hit);
      const origin = recipe.mode === "exit" ? exitHit : hit;
      if (!hit || !origin) {
        anchors = null;
        return false;
      }
      const at = { x: origin.position.x, y: origin.position.y, z: origin.position.z },
        direction = { x: d.x, y: 0, z: d.z };
      anchors = {
        body: at,
        head: at,
        trails: [at],
        gore: {
          recipeId: entity.finisher.recipeId,
          material: anatomy.material,
          palette: recipe.burst?.palettes?.[anatomy.material] ?? data.palettes[anatomy.material],
          mode: recipe.mode,
          spreadDegrees: recipe.spreadDegrees,
          emitSeconds: recipe.emitSeconds,
          burst: recipe.burst,
          verticalSpeed: recipe.verticalSpeed,
          dropSize: recipe.dropSize,
          jet: recipe.jet && anatomy.material !== "machine",
          pool: recipe.pool && anatomy.material !== "machine",
          jetOrigin: at,
          jetDirection: direction,
          woundVisible: wound.stats().visible,
          surface: hit,
        },
      };
      return true;
    } finally {
      if (attempting) admissionMilliseconds = performance.now() - admissionBegin;
    }
  }
  return {
    update,
    impactAnchors() {
      return anchors;
    },
    get started() {
      return started;
    },
    stats() {
      return {
        ...wound.stats(),
        recipeId: recipe?.recipeId ?? null,
        rig,
        material: anatomy.material,
        preparedSamples: { body: groups.body.length, head: groups.head.length },
        receiver: selected
          ? { mesh: selected.mark.mesh.name, vertex: selected.mark.index, region: selected.region }
          : null,
        lethalVertexCopies: 0,
        admissionAttempted,
        visibilityRays,
        admissionMilliseconds,
      };
    },
    reset() {
      wound.reset();
      started = false;
      admissionAttempted = false;
      selected = recipe = anchors = null;
      entityId = null;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      started = false;
      wound.dispose();
      groups.body.length = groups.head.length = 0;
      anchors = null;
    },
  };
}
