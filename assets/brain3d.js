// Aroxwell — real-time 3D brain for the hero.
//
// Loads /assets/brain.glb = the obsidian + kintsugi sculpture with its gold laurel, exported
// from Blender (blender/make_sculpture.py -> blender/make_web_sculpture.py, see README).
// The Cycles materials are recreated here: obsidianGold() for the brain, laurelGold() for the
// laurel. If the file is missing, WebGL is unavailable, or the visitor prefers reduced motion
// or is on data-saver, the page keeps the still Cycles render (assets/brain.webp).
// ?still forces the still render; ?3dtest previews with a stand-in shape.
//
// three.js is self-hosted in /assets/vendor/three (MIT licence) and only downloaded once we
// know a model will actually be shown.

const MODEL_URL = "/assets/brain.glb";   // also preloaded by the inline script in each page's <head>
const DRACO_PATH = "/assets/vendor/three/examples/jsm/libs/draco/gltf/";

const hero = document.querySelector(".hero");
const visual = hero && hero.querySelector(".hero-visual");
const params = new URLSearchParams(location.search);
const TEST = params.has("3dtest");
const PERF = params.has("perf");
const SIMSLOW = PERF && params.has("simslow");
// Phones/tablets (touch screens): draw at 30 frames/s and a lower pixel density. The motion is a
// slow sway, so 30 fps looks the same, and together this is ~70% less work for the phone (less heat).
const PHONE = matchMedia("(pointer: coarse)").matches;
const TARGET_FPS = PHONE ? 30 : 60;
let maxPixelRatio = PHONE ? 1.5 : 2;   // aroxwell.com/?perf shows live load numbers (for testing on phones)
const LIVE = !params.has("still");
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const saveData = navigator.connection && navigator.connection.saveData;

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) { return false; }
}

// The page <head> hides the still image ("brain-pending") when 3D is likely; show it again if 3D can't run.
const showStill = () => document.documentElement.classList.remove("brain-pending");
if (LIVE && visual && !reduceMotion && !saveData && webglAvailable()) {
  start().then((ok) => { if (!ok) showStill(); })
    .catch((e) => { showStill(); console.warn("3D brain not shown:", e); });
} else {
  showStill();
}

async function start() {
  performance.mark("b3d-start");
  // Everything downloads in parallel (the page <head> already started these downloads):
  // three.js + loaders, then the model starts loading/decoding while the renderer is set up.
  const [THREE, { RoomEnvironment }, { GLTFLoader }, { DRACOLoader }] = await Promise.all([
    import("three"),
    import("three/addons/environments/RoomEnvironment.js"),
    import("three/addons/loaders/GLTFLoader.js"),
    import("three/addons/loaders/DRACOLoader.js"),
  ]);
  performance.mark("b3d-three");
  let gltfP = null;
  if (!TEST) {
    const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
    draco.setDecoderConfig({ type: "wasm" });
    gltfP = new GLTFLoader().setDRACOLoader(draco).loadAsync(MODEL_URL);
    gltfP.catch(() => {});   // handled below; avoids an "unhandled rejection" warning meanwhile
  }

  // ---------- renderer & scene ----------
  const canvas = document.createElement("canvas");
  canvas.className = "brain-canvas";
  canvas.setAttribute("aria-hidden", "true");
  // sits between the back and front halves of the SVG orbit rings, so they pass behind and in front
  const sculpture = visual.querySelector(".sculpture");
  if (sculpture) sculpture.after(canvas); else visual.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;   // keeps the gold rich and saturated (ACES washed it out)
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.28;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  const ELEVATION = THREE.MathUtils.degToRad(13); // looking slightly down, so rings read as ellipses

  // ---------- lights: warm key, two gold rims behind, low fill ----------
  // like the reference: soft warm light from the top left, gentle fill, faint warm rim
  const key = new THREE.DirectionalLight(0xfff0dc, 3.6); key.position.set(-3, 4, 3.2); scene.add(key);
  const fill = new THREE.DirectionalLight(0xd9e0ff, 0.2); fill.position.set(4, 0.5, 2); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xf2cf8e, 1.6); rim.position.set(2.5, 2.5, -4); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffe2b8, 1.3); rim2.position.set(-3, 1.5, -3.5); scene.add(rim2);   // second strip, like the Cycles rig
  const top = new THREE.DirectionalLight(0xf4f6ff, 0.8); top.position.set(0.2, 6, 0.5); scene.add(top);        // catches the crowns of the folds
  scene.add(new THREE.AmbientLight(0x2a2620, 0.15));

  // ---------- the brain ----------
  let brain;
  if (TEST) {
    brain = makeStandIn(THREE);
  } else {
    let gltf;
    try { gltf = await gltfP; } catch (e) { canvas.remove(); renderer.dispose(); return false; } // no model → keep the image
    performance.mark("b3d-glb");
    brain = gltf.scene;
    const mat = obsidianGold(THREE);
    const gold = laurelGold(THREE, scene.environment);
    brain.traverse((o) => {
      if (!o.isMesh) return;
      const isLaurel = /laurel/i.test(o.name) || (o.parent && /laurel/i.test(o.parent.name));
      if (isLaurel) { o.material = gold; return; }
      // vertex colour R (written by blender/make_brain.py) = how deep the point sits in a fold
      const col = o.geometry.attributes.color;
      const n = o.geometry.attributes.position.count;
      const g = new Float32Array(n);
      for (let i = 0; i < n; i++) g[i] = col ? col.getX(i) : 0;
      o.geometry.setAttribute("aFold", new THREE.BufferAttribute(g, 1));
      o.geometry.deleteAttribute("color");
      o.material = mat;
    });
  }
  // centre it and scale so its widest side is 2 units
  const box = new THREE.Box3().setFromObject(brain);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  brain.position.sub(center);
  const fit = new THREE.Group();
  fit.add(brain);
  fit.scale.setScalar(2 / Math.max(size.x, size.y, size.z));

  const pivot = new THREE.Group(); // receives rotation
  pivot.add(fit);
  scene.add(pivot);

  // ---------- sizing: canvas is bigger than the image box so nothing gets clipped ----------
  const BRAIN_FILL = TEST ? 1 : 0.9;       // brain width as a share of the hero visual
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // the brain (2 units wide) should be as wide as the old image, i.e. visual width
    const unitsWide = 2 * (w / visual.clientWidth) / BRAIN_FILL;
    const visibleH = unitsWide / camera.aspect;
    const dist = (visibleH / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.position.set(0, Math.sin(ELEVATION) * dist, Math.cos(ELEVATION) * dist);
    camera.lookAt(0, -0.1, 0);              // brain sits a little high, headline overlaps its base
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ---------- animation ----------
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 }).observe(hero);

  const clock = new THREE.Clock();
  const SIDE = Math.PI / 2;                 // model's front (-Z) turned to the left
  let spin = 0, ry = SIDE;

  // Weak device guard: if frames keep arriving much slower than the target, first lower the
  // pixel density, and if it's still struggling, stop the 3D and show the still image instead.
  const minGap = 1000 / TARGET_FPS - 2;
  let running = true, lastDraw = 0, winStart = 0, winFrames = 0, slowWindows = 0;
  const startedAt = performance.now();
  function checkSpeed(now) {
    if (!winStart) { winStart = now; winFrames = 0; return; }
    winFrames++;
    if (now - winStart < 2000) return;
    const fps = winFrames * 1000 / (now - winStart);
    winStart = now; winFrames = 0;
    if (now - startedAt < 3000) return;                     // ignore the busy page-load moment
    // below 60% of the target → lower the pixel density once (Low Power Mode's 30 fps cap lands here too, harmless)
    // only below 18 fps after that → really struggling, switch to the still image
    const slow = maxPixelRatio > 1 ? fps < TARGET_FPS * 0.6 : fps < 18;
    if (!slow) { slowWindows = 0; return; }
    if (++slowWindows < 2) return;                          // two slow stretches in a row
    slowWindows = 0;
    if (maxPixelRatio > 1) {
      maxPixelRatio = 1; renderer.setPixelRatio(1); resize();
    } else {
      running = false;                                      // give up: the still image takes over
      hero.classList.remove("has-3d");
      setTimeout(() => { canvas.remove(); renderer.dispose(); }, 1500);
    }
  }

  function frame(now = performance.now()) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!visible || document.hidden) { clock.getDelta(); winStart = 0; return; }
    if (now - lastDraw < minGap) return;                    // 30 fps on phones
    lastDraw = now;
    checkSpeed(now);
    if (SIMSLOW) { const end = performance.now() + 70; while (performance.now() < end); }   // ?perf&simslow: fake a weak phone
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    // loops on its own (no mouse control): shows its side, front to the left like the
    // reference, sways ±17° around it and floats gently
    spin += dt;
    ry = TEST ? spin * 0.12 : SIDE + Math.sin(spin * 0.22) * 0.3;   // ±17° (was ±35°, user wanted half)
    pivot.rotation.set(-0.05, ry, 0);
    pivot.position.y = Math.sin(t * 0.7) * 0.04;
    const t0 = PERF ? performance.now() : 0;
    renderer.render(scene, camera);
    if (PERF) perf.frame(performance.now() - t0);
  }
  const perf = PERF ? perfMeter(renderer, canvas) : null;
  frame();
  performance.mark("b3d-firstframe");

  requestAnimationFrame(() => { hero.classList.add("has-3d"); showStill(); });
  return true;
}

// Obsidian with kintsugi gold, matched to design inspo/Gilded Obsidian Brain Sculpture.png.
// Drawn per pixel so the veins stay sharp at any size (no texture files):
//  - stone: charcoal black, satin (not glossy), with a fine pebbled/leathery grain
//  - shadows: the deeper a point sits in a groove (aFold from Blender), the darker it gets
//  - gold: one network of thin glowing cracks (3D Voronoi edges) roughly a fold apart,
//    with a few finer branches, plus a thin line at the very bottom of the deepest grooves
function obsidianGold(THREE) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0x161412, roughness: 0.42, metalness: 0.1,
    clearcoat: 0.35, clearcoatRoughness: 0.35,
  });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>
        attribute float aFold;
        varying float vFold;
        varying vec3 vObj;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        vFold = aFold;
        vObj = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>
        varying float vFold;
        varying vec3 vObj;
        vec3 h3(vec3 p) {
          p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
          return fract(sin(p) * 43758.5453);
        }
        // x = distance to nearest cell centre (F1), y = distance to nearest cell edge (F2 - F1)
        vec2 cells(vec3 p) {
          vec3 i = floor(p), f = fract(p);
          float d1 = 8.0, d2 = 8.0;
          for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
            vec3 g = vec3(float(x), float(y), float(z));
            vec3 r = g + h3(i + g) - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
          }
          return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
        }
        float line(float e, float w) {
          float aa = fwidth(e) * 1.1;
          return 1.0 - smoothstep(w - aa, w + aa, e);
        }
        float goldMask() {
          vec3 p = vObj * 2.7;
          p += 0.22 * sin(p.yzx * 2.7 + 1.3) + 0.08 * sin(p.zxy * 7.1);   // wiggly, hand-made lines
          vec2 a = cells(p);
          float w = 0.0075 + 0.0045 * sin(dot(vObj, vec3(23.0, 17.0, 29.0)));  // vein width varies
          float main = line(a.y, w);
          vec2 b = cells(p * 2.2 + 7.0);
          float branch = line(b.y, 0.0065) * step(0.8, h3(floor(p * 2.2 + 7.0)).x) * 0.7; // only some cells split
          float groove = 0.0;
          return clamp(max(main, max(branch, groove)), 0.0, 1.0);
        }
        float grain(vec3 p) { return cells(p).x; }              // pebbled leather texture
        #define GRAIN 0.0   // >0 adds a pebbled stone grain (looked noisy at hero size, so off)
        `)
      .replace("#include <color_fragment>", `#include <color_fragment>
        float kGold = goldMask();
        float ao = mix(1.0, 0.08, smoothstep(0.2, 0.85, vFold));   // grooves go near-black // deep grooves fall into shadow
        vec3 goldCol = vec3(0.95, 0.52, 0.09);                     // deep rich gold
        diffuseColor.rgb = mix(diffuseColor.rgb * ao, goldCol, kGold);`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.32, kGold);`)
      .replace("#include <metalnessmap_fragment>", `#include <metalnessmap_fragment>
        metalnessFactor = mix(metalnessFactor, 1.0, kGold);`)
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
        {
          // bump the stone with the grain (same maths as three's perturbNormalArb)
          float hgt = grain(vObj * 45.0) * (1.0 - kGold);
          vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
          float hx = dFdx(hgt), hy = dFdy(hgt);
          vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (hx * r1 + hy * r2) * GRAIN;
          normal = normalize(abs(det) * normal - grad);
        }`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        totalEmissiveRadiance += goldCol * kGold * 0.42;            // veins glow like molten gold
        totalEmissiveRadiance *= ao * 0.4 + 0.6;`)
      .replace("#include <aomap_fragment>", `#include <aomap_fragment>
        reflectedLight.indirectDiffuse *= ao;
        reflectedLight.indirectSpecular *= mix(ao, 1.0, kGold);`);
  };
  return mat;
}

// polished gold for the laurel (leaves, stem, berries), like "Laurel Gold" in the .blend
function laurelGold(THREE, env) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0.9, 0.52, 0.14), metalness: 1.0, roughness: 0.16,
    envMap: env, envMapIntensity: 0.45, side: THREE.DoubleSide,
  });
}

// stand-in for testing before the real model exists (?3dtest): a folded, brain-like blob
function makeStandIn(THREE) {
  const geo = new THREE.SphereGeometry(1, 256, 160);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const folds = Math.sin(9 * v.x + 3 * Math.sin(7 * v.y)) * Math.sin(8 * v.z + 2.5 * Math.sin(9 * v.x)) * 0.045
                + Math.sin(17 * v.y + 4 * Math.sin(11 * v.z)) * 0.02;
    const fissure = Math.exp(-Math.pow(v.z * 9, 2)) * (v.y > -0.2 ? 0.12 : 0);
    v.multiplyScalar(1 + folds - fissure);
    v.set(v.x * 1.12, v.y * 0.72, v.z * 0.78);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x0e0d0b, roughness: 0.32, metalness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25 });
  return new THREE.Mesh(geo, mat);
}

// ?perf: small overlay with frames per second, how long each frame's drawing takes on the
// processor (CPU), and how many pixels/triangles the 3D brain draws. Only shown with ?perf.
function perfMeter(renderer, canvas) {
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9999;padding:8px 10px;border-radius:8px;" +
    "background:rgba(0,0,0,.8);color:#9f9;font:12px/1.45 ui-monospace,Menlo,monospace;white-space:pre;pointer-events:none";
  document.body.appendChild(box);
  let n = 0, cpu = 0, last = performance.now();
  window.__b3dPerf = {};
  return {
    frame(ms) {
      n++; cpu += ms;
      const now = performance.now();
      if (now - last < 1000) return;
      const fps = n * 1000 / (now - last);
      const px = canvas.width * canvas.height;
      const stats = { fps: Math.round(fps), cpuMsPerFrame: +(cpu / n).toFixed(2), canvas: canvas.width + "x" + canvas.height,
        megapixels: +(px / 1e6).toFixed(2), pixelRatio: +renderer.getPixelRatio().toFixed(2),
        targetFps: TARGET_FPS, triangles: renderer.info.render.triangles, mpixPerSecond: Math.round(px * fps / 1e6) };
      window.__b3dPerf = stats;
      box.textContent = "3D brain\n" + Object.entries(stats).map(([k, v]) => k + ": " + v).join("\n");
      n = 0; cpu = 0; last = now;
    },
  };
}
