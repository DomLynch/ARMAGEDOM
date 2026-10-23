// One procedural batch in original image coordinates. No borrowed world resources.
export function createWaterEffect({
  THREE,
  scene,
  world,
  config,
  reducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false,
}) {
  let mesh = null,
    material = null,
    elapsed = 0,
    disposed = false;
  function build() {
    if (!config?.enabled) return;
    const { profile } = config,
      regions = config.regions ?? [config.region],
      points = [],
      triangles = [];
    for (const region of regions) {
      const offset = points.length,
        outer = region.points.map((p) => new THREE.Vector2(p.x, p.y)),
        holes = region.holes.map((r) => r.map((p) => new THREE.Vector2(p.x, p.y)));
      points.push(...region.points, ...region.holes.flat());
      triangles.push(...THREE.ShapeUtils.triangulateShape(outer, holes).map((t) => t.map((i) => i + offset)));
    }
    const inverse = world.calibrated.clone().invert(),
      positions = [],
      uv = [];
    for (const p of points) {
      const v = new THREE.Vector3(2 * p.x - 1, 1 - 2 * p.y, 0.5).applyMatrix4(inverse);
      v.multiplyScalar(99 / -v.z).applyMatrix4(world.camera.matrixWorld);
      positions.push(v.x, v.y, v.z);
      uv.push(p.x, p.y);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(triangles.flat());
    const edges = [];
    for (const region of regions)
      for (const ring of [region.points, ...region.holes])
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          edges.push(new THREE.Vector4(a.x * 1672, a.y * 941, b.x * 1672, b.y * 941));
        }
    while (edges.length < 128) edges.push(new THREE.Vector4());
    const uniforms = {
      clock: { value: elapsed },
      imageSize: { value: new THREE.Vector2(1672, 941) },
      flow: { value: new THREE.Vector2(profile.flow.direction.x, profile.flow.direction.y) },
      speed: { value: profile.flow.speedPixelsPerSecond },
      spacing: { value: profile.rippleScalePixels },
      amplitude: { value: profile.rippleAmplitudePixelsMax },
      opacity: { value: profile.opacityMax },
      glint: { value: profile.glint.alphaMax },
      edges: { value: edges },
      edgeCount: { value: points.length },
      feather: { value: profile.edgeFeatherPixels },
      density: { value: profile.glint.density },
      tint: { value: new THREE.Color(...profile.glint.tintLinearProposal) },
      phase: { value: ((profile.seed >>> 0) / 4294967296) * 6.283185 },
    };
    if (!material)
      material = new THREE.ShaderMaterial({
        transparent: true,
        depthTest: true,
        depthWrite: false,
        toneMapped: false,
        side: THREE.DoubleSide,
        uniforms,
        vertexShader: `varying vec2 imageUV;void main(){imageUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
        fragmentShader: `varying vec2 imageUV;uniform float clock,speed,spacing,amplitude,opacity,glint,phase,feather,density;uniform int edgeCount;uniform vec4 edges[128];uniform vec2 imageSize,flow;uniform vec3 tint;void main(){vec2 base=imageUV*imageSize;float edge=1.0e5;for(int i=0;i<128;i++){if(i>=edgeCount)break;vec2 a=edges[i].xy,b=edges[i].zw,d=b-a;float t=clamp(dot(base-a,d)/dot(d,d),0.0,1.0);edge=min(edge,length(base-a-t*d));}vec2 p=base-flow*(clock*speed);float ripple=sin((p.y+amplitude*sin(p.x*.07+phase))*6.283185/spacing+phase);float highlightMask=.5+.5*sin(p.x*.025+p.y*.009+phase);float shine=smoothstep(.92,1.0,ripple)*smoothstep(1.0-density,1.0,highlightMask);float a=(opacity*(.9+.1*ripple)+glint*shine)*smoothstep(0.0,feather,edge);gl_FragColor=vec4(mix(vec3(.18,.20,.21),tint,shine),a);}`,
      });
    else material.uniforms = uniforms;
    mesh = new THREE.Mesh(geometry, material);
    mesh.name = "Restrained water";
    mesh.renderOrder = -85;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  build();
  return {
    setConfig(next) {
      if (disposed) return;
      mesh?.removeFromParent();
      mesh?.geometry.dispose();
      mesh = null;
      config = next;
      elapsed = 0;
      build();
    },
    update(dt, { paused = false, enabled = true } = {}) {
      if (disposed || !mesh) return;
      mesh.visible = enabled && config.enabled;
      if (!mesh.visible || paused || reducedMotion()) return;
      if (Number.isFinite(dt) && dt > 0) elapsed += Math.min(dt, 0.1);
      material.uniforms.clock.value = elapsed;
    },
    reset() {
      elapsed = 0;
      if (material) material.uniforms.clock.value = 0;
    },
    stats() {
      return {
        time: elapsed,
        drawCalls: mesh?.visible ? 1 : 0,
        vertices: mesh?.geometry.getAttribute("position").count ?? 0,
        triangles: mesh?.geometry.index.count / 3 || 0,
        geometryBytes: mesh
          ? Object.values(mesh.geometry.attributes).reduce(
              (n, a) => n + a.array.byteLength,
              mesh.geometry.index.array.byteLength,
            )
          : 0,
        textureBytes: 0,
        disposed,
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh?.removeFromParent();
      mesh?.geometry.dispose();
      material?.dispose();
      mesh = null;
      material = null;
    },
  };
}
