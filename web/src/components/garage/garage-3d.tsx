"use client";

/**
 * The 3D garage floor: six work zones on one slab, each holding up to eight cars from its queue. Cars are drawn from the
 * same derived garage state as the list below (which stays the accessible way to open a vehicle); clicking a car here
 * opens the same vehicle dialog. three.js is bundled with the app and loaded on demand, so nothing leaves the origin.
 * Without WebGL the scene is simply not shown.
 */
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../chart";
import { LANES, vehicleLabel, type GarageLane, type GarageRow, type GarageVehicle } from "@/lib/garage";
import { paintColor, type BodyStyle } from "@/lib/car-styles";
import { carMesh, type CarMesh } from "@/lib/car-mesh";
import { liveStore } from "@/lib/live";

const PER_ZONE = 8;
const ZONE_W = 10.4, ZONE_D = 8.2, GAP = 1.2;
/** Zone placement: back row holds the work that keeps cars off the road, front row is nearest the exit. */
const LAYOUT: GarageLane[][] = [["incident", "repair", "renewal"], ["verify", "dispatch", "road"]];

interface Hover { x: number; y: number; v: GarageVehicle }

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function Garage3D({ groups, onOpen, styleFor }: { groups: Record<GarageLane, GarageVehicle[]>; onOpen: (id: string) => void; styleFor: (row: GarageRow) => BodyStyle }) {
  const host = useRef<HTMLDivElement>(null);
  const dark = useTheme();
  const [hover, setHover] = useState<Hover | null>(null);
  const [failed, setFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const open = useRef(onOpen);
  const zoomBy = useRef<(f: number) => void>(() => {});
  useEffect(() => { open.current = onOpen; }, [onOpen]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    void Promise.all([import("three"), import("three/examples/jsm/environments/RoomEnvironment.js")]).then(([THREE, { RoomEnvironment }]) => {
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        setFailed(true);
        return;
      }
      // A software renderer (no graphics card, e.g. a virtual machine) gets a still, shadow-free frame so the page stays responsive.
      const gl = renderer.getContext(), info = gl.getExtension("WEBGL_debug_renderer_info");
      const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : ""));
      const reduced = software || matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.setPixelRatio(software ? 1 : Math.min(devicePixelRatio, 2));
      renderer.shadowMap.enabled = !software;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = dark ? 1.05 : 1.15;
      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.className = "garage-3d-canvas";
      el.appendChild(renderer.domElement);

      const c = {
        text: cssColor("--text", "#0f1222"), muted: cssColor("--muted", "#5b6178"), panel: cssColor("--panel", "#fff"),
        lane: Object.fromEntries(LANES.map((l) => [l.id, cssColor(l.color.slice(4, -1), "#6366f1")])) as Record<GarageLane, string>,
      };
      const floorTone = dark ? "#252a3b" : "#e7e9f0", slabTone = dark ? "#181c2a" : "#f4f5f9", lineTone = dark ? "#3a4159" : "#c3c8d6";

      const scene = new THREE.Scene();
      // soft studio reflections for paint and glass, generated on the device (no image is loaded)
      let envMap: { dispose(): void } | null = null;
      if (!software) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        const tex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = tex; envMap = tex;
        scene.environmentIntensity = dark ? 0.55 : 0.5;
        pmrem.dispose();
      }
      const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);
      scene.add(new THREE.HemisphereLight(dark ? "#b4bce0" : "#ffffff", dark ? "#1a1d2b" : "#b9bdcc", dark ? 1.7 : 1.15));
      const sun = new THREE.DirectionalLight("#ffffff", dark ? 2.2 : 2.0);
      sun.position.set(-14, 26, 16);
      sun.castShadow = true;
      sun.shadow.mapSize.set(1536, 1536);
      Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 18, bottom: -18, near: 1, far: 70 });
      sun.shadow.bias = -0.0004;
      scene.add(sun);

      const disposables: { dispose(): void }[] = [];
      const keep = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };
      const mat = (color: string, o: Partial<{ rough: number; metal: number; emissive: string; ei: number; opacity: number }> = {}) => keep(new THREE.MeshStandardMaterial({
        color, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, emissive: o.emissive ?? "#000000", emissiveIntensity: o.ei ?? 0,
        transparent: o.opacity !== undefined, opacity: o.opacity ?? 1,
      }));
      const box = (w: number, h: number, d: number) => keep(new THREE.BoxGeometry(w, h, d));
      const mesh = (g: ConstructorParameters<typeof THREE.Mesh>[0], m: ConstructorParameters<typeof THREE.Mesh>[1], x = 0, y = 0, z = 0, shadow = true) => {
        const o = new THREE.Mesh(g, m);
        o.position.set(x, y, z);
        o.castShadow = shadow; o.receiveShadow = true;
        return o;
      };

      // the slab, the drive lane and the exit apron
      const totalW = 3 * ZONE_W + 2 * GAP, totalD = 2 * ZONE_D + GAP;
      scene.add(mesh(box(totalW + 3, 0.5, totalD + 7), mat(slabTone, { rough: 0.95 }), 0, -0.25, 1.8, false));
      const laneZ = totalD / 2 + 2.2;
      scene.add(mesh(box(totalW + 3, 0.02, 3.2), mat(dark ? "#10131d" : "#d9dce6", { rough: 1 }), 0, 0.01, laneZ, false));
      const dash = box(1.4, 0.03, 0.14), dashM = mat(dark ? "#5d6480" : "#ffffff");
      for (let x = -totalW / 2; x < totalW / 2; x += 2.6) scene.add(mesh(dash, dashM, x + 0.7, 0.03, laneZ, false));

      // car parts: one lofted body per style (curved sides, tapered nose and tail, glass house, wheel arches)
      const tyreG = keep(new THREE.CylinderGeometry(1, 1, 0.26, 28)).rotateZ(Math.PI / 2);
      const rimG = keep(new THREE.CylinderGeometry(0.66, 0.66, 0.27, 24)).rotateZ(Math.PI / 2);
      const hubG = keep(new THREE.CylinderGeometry(0.16, 0.16, 0.29, 12)).rotateZ(Math.PI / 2);
      const spokeG = box(0.04, 0.12, 1.15);
      const mirrorG = box(0.1, 0.1, 0.17), beaconG = keep(new THREE.CylinderGeometry(0.16, 0.18, 0.28, 14));
      const coneG = keep(new THREE.ConeGeometry(0.17, 0.48, 14)), padG = keep(new THREE.PlaneGeometry(1, 1)).rotateX(-Math.PI / 2);
      const tyreM = mat("#121318", { rough: 0.9 }), rimM = mat("#c9ccd3", { metal: 0.85, rough: 0.25 }), hubM = mat("#2a2d35", { metal: 0.5, rough: 0.4 });
      const glassM = keep(new THREE.MeshPhysicalMaterial({ color: "#0a0f18", roughness: 0.08, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 0.6, side: THREE.DoubleSide }));
      const headM = mat("#f4f6fb", { emissive: "#fff8e6", ei: 1.2, rough: 0.2 }), tailM = mat("#b0142f", { emissive: "#e11d48", ei: 0.8, rough: 0.3 });
      const grilleM = mat("#15171d", { rough: 0.55, metal: 0.3 }), trimM = mat("#1c1e24", { rough: 0.7 });
      const coneM = mat("#f97316", { rough: 0.6 }), bedM = mat("#25282f", { rough: 0.9 }), cargoM = mat(dark ? "#d5d8de" : "#eceef2", { rough: 0.55 });
      const geo = new Map<BodyStyle, { body: ConstructorParameters<typeof THREE.Mesh>[0]; m: CarMesh }>();
      const geoFor = (style: BodyStyle) => {
        const hit = geo.get(style);
        if (hit) return hit;
        const m = carMesh(style);
        const body = keep(new THREE.BufferGeometry());
        body.setAttribute("position", new THREE.BufferAttribute(m.positions, 3));
        body.setIndex([...m.paint, ...m.glass]);
        body.addGroup(0, m.paint.length, 0);
        body.addGroup(m.paint.length, m.glass.length, 1);
        body.computeVertexNormals();
        const out = { body, m };
        geo.set(style, out);
        return out;
      };

      const cars: { body: InstanceType<typeof THREE.Group>; paint: InstanceType<typeof THREE.MeshPhysicalMaterial>; v: GarageVehicle; baseY: number; z1?: number; delay?: number; trip?: number; home?: number }[] = [];
      let nowT = 0;
      let introEnd = 0;
      const beacons: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];

      /** A car in its registered paint and body style, scaled to fit a bay, nose towards the drive lane. */
      function car(v: GarageVehicle) {
        const { body, m } = geoFor(styleFor(v.row));
        const g = new THREE.Group();
        const paint = keep(new THREE.MeshPhysicalMaterial({ color: paintColor(v.row.color), roughness: 0.32, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.06 }));
        const shell = new THREE.Mesh(body, [paint, glassM]);
        shell.castShadow = true; shell.receiveShadow = true;
        g.add(shell);
        const h = m.length / 2;
        // wheels: tyre, alloy rim with five spokes, dark hub
        for (const w of m.wheels) {
          const side = Math.sign(w.x);
          const t = mesh(tyreG, tyreM, w.x, m.wheelR, w.z); t.scale.set(1, m.wheelR, m.wheelR);
          const r = mesh(rimG, rimM, w.x + side * 0.005, m.wheelR, w.z, false); r.scale.set(1, m.wheelR, m.wheelR);
          const hb = mesh(hubG, hubM, w.x + side * 0.01, m.wheelR, w.z, false); hb.scale.set(1, m.wheelR, m.wheelR);
          g.add(t, r, hb);
          for (let k = 0; k < 5; k++) {
            const sp = mesh(spokeG, hubM, w.x + side * 0.14, m.wheelR, w.z, false);
            sp.scale.set(1, m.wheelR, m.wheelR); sp.rotation.x = (k * Math.PI * 2) / 5;
            g.add(sp);
          }
        }
        // door mirrors at the base of the windscreen
        for (const sx of [-1, 1]) g.add(mesh(mirrorG, paint, sx * (m.halfAt(m.cowlZ) * 0.93 + 0.05), m.belt + 0.07, m.cowlZ - 0.18, false));
        // headlights follow the front corners; a grille between them; a full-width tail-light bar
        const fz = h - 0.16, fw = m.halfAt(fz);
        for (const sx of [-1, 1]) {
          const lamp = mesh(box(0.5, 0.08, 0.1), headM, sx * fw * 0.66, m.noseY - 0.1, fz + 0.02, false);
          lamp.rotation.y = sx * 0.42;
          g.add(lamp);
        }
        g.add(mesh(box(fw * 0.85, 0.16, 0.06), grilleM, 0, Math.max(m.noseY - 0.32, 0.3), h - 0.06, false));
        const rz = -h + 0.1, rw = m.halfAt(rz);
        g.add(mesh(box(rw * 1.75, 0.07, 0.05), tailM, 0, m.tailY - 0.12, rz - 0.03, false));
        g.add(mesh(box(rw * 1.6, 0.1, 0.05), trimM, 0, 0.42, rz - 0.02, false));
        if (m.bed) g.add(mesh(box(m.width - 0.3, 0.03, m.bed[1] - m.bed[0]), bedM, 0, m.bed[3] - 0.01, (m.bed[0] + m.bed[1]) / 2, false));
        if (m.fifth) {
          // tractor unit: fifth-wheel coupling on the deck, twin exhaust stacks behind the cab, side fuel tanks
          const [fz5, fy] = m.fifth;
          g.add(mesh(keep(new THREE.CylinderGeometry(0.55, 0.55, 0.1, 24)), hubM, 0, fy + 0.06, fz5, false));
          const stack = keep(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 12));
          const cabBack = -m.length / 2 + 3.05 + 0.15;
          for (const sx of [-1, 1]) g.add(mesh(stack, rimM, sx * (m.width / 2 - 0.12), 2.2, cabBack, false));
          const tank = keep(new THREE.CylinderGeometry(0.28, 0.28, 1.1, 18)).rotateX(Math.PI / 2);
          for (const sx of [-1, 1]) g.add(mesh(tank, rimM, sx * (m.width / 2 - 0.05), 0.75, cabBack + 0.8, false));
        }
        if (m.cargo) {
          const [r0, r1, y0, y1] = m.cargo;
          g.add(mesh(box(m.width + 0.06, y1 - y0, r1 - r0), cargoM, 0, (y0 + y1) / 2, (r0 + r1) / 2));
        }
        const scale = Math.min(0.62, 3.45 / m.length);
        g.scale.setScalar(scale);
        g.userData.vehicle = v.row.vehicle_id;
        g.userData.size = [m.width * scale, m.length * scale, (m.cargo ? m.cargo[3] : m.height) * scale];
        cars.push({ body: g, paint, v, baseY: 0 });
        return g;
      }

      function sign(text: string, count: number, color: string) {
        const cv = document.createElement("canvas");
        cv.width = 1024; cv.height = 192;
        const x = cv.getContext("2d")!;
        x.fillStyle = c.panel; x.beginPath(); x.roundRect(0, 0, 1024, 192, 34); x.fill();
        x.fillStyle = color; x.beginPath(); x.roundRect(36, 66, 60, 60, 16); x.fill();
        const font = getComputedStyle(document.body).fontFamily;
        x.fillStyle = c.text; x.font = `600 76px ${font}`; x.textBaseline = "middle"; x.fillText(text, 128, 100);
        x.fillStyle = color; x.font = `700 84px ${font}`; x.textAlign = "right"; x.fillText(String(count), 988, 100);
        const tex = keep(new THREE.CanvasTexture(cv));
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        const m = keep(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
        return new THREE.Mesh(keep(new THREE.PlaneGeometry(7.6, 1.42)), m);
      }

      LAYOUT.forEach((row, ri) => row.forEach((lane, ci) => {
        const cx = (ci - 1) * (ZONE_W + GAP), cz = (ri - 0.5) * (ZONE_D + GAP);
        const color = c.lane[lane], list = groups[lane];
        const zone = new THREE.Group();
        zone.position.set(cx, 0, cz);
        zone.add(mesh(box(ZONE_W, 0.06, ZONE_D), mat(floorTone, { rough: 0.9 }), 0, 0.03, 0, false));
        // a coloured kerb along the front edge, and painted bay lines
        zone.add(mesh(box(ZONE_W, 0.1, 0.16), mat(color, { emissive: color, ei: dark ? 0.35 : 0.1 }), 0, 0.08, ZONE_D / 2 - 0.08, false));
        const lineM = mat(lineTone), lineG = box(0.06, 0.02, 3.5);
        for (let r = 0; r < 2; r++) for (let b = 0; b <= 4; b++) zone.add(mesh(lineG, lineM, -ZONE_W / 2 + 0.6 + b * 2.3, 0.07, -1.7 + r * 3.9 + 0.1, false));
        const s = sign(LANES.find((l) => l.id === lane)!.label, list.length, color);
        s.position.set(0, 2.05, -ZONE_D / 2 + 0.02); s.rotation.x = -0.42;
        zone.add(s);
        const poleM = mat(dark ? "#4a516b" : "#a3a9bb", { metal: 0.4, rough: 0.5 }), poleG = box(0.08, 1.6, 0.08);
        zone.add(mesh(poleG, poleM, -3.5, 0.8, -ZONE_D / 2 + 0.25), mesh(poleG, poleM, 3.5, 0.8, -ZONE_D / 2 + 0.25));

        // zone props that say what happens there
        if (lane === "repair") {
          const postM = mat(dark ? "#3a4057" : "#9aa0b4", { metal: 0.5, rough: 0.4 });
          for (const b of [0, 1]) {
            const bx = -ZONE_W / 2 + 0.6 + 1.15 + b * 2.3;
            zone.add(mesh(box(0.18, 2.2, 0.18), postM, bx - 1.05, 1.1, -1.7 + 0.1), mesh(box(0.18, 2.2, 0.18), postM, bx + 1.05, 1.1, -1.7 + 0.1));
            zone.add(mesh(box(1.9, 0.1, 3.3), postM, bx, 0.95, -1.7 + 0.1));
          }
        }
        if (lane === "renewal") {
          zone.add(mesh(box(2.2, 0.9, 0.8), mat(dark ? "#2a3045" : "#d6d9e3"), ZONE_W / 2 - 1.5, 0.45, -ZONE_D / 2 + 1.0));
          zone.add(mesh(box(0.8, 0.5, 0.06), mat("#0b0e18", { emissive: color, ei: 0.5 }), ZONE_W / 2 - 1.5, 1.2, -ZONE_D / 2 + 0.85));
        }
        if (lane === "dispatch" || lane === "road") {
          const chevM = mat(color, { emissive: color, ei: 0.25, opacity: 0.55 });
          for (let i = 0; i < 3; i++) {
            const ch = mesh(box(0.9, 0.02, 0.16), chevM, 0, 0.07, ZONE_D / 2 + 0.5 + i * 0.45, false);
            ch.rotation.y = 0;
            zone.add(ch);
          }
        }

        const padM = mat(color, { emissive: color, ei: dark ? 0.45 : 0.15, opacity: dark ? 0.32 : 0.28 });
        list.slice(0, PER_ZONE).forEach((v, i) => {
          const r = Math.floor(i / 4), b = i % 4;
          const x = -ZONE_W / 2 + 0.6 + 1.15 + b * 2.3, z = -1.6 + r * 3.9;
          const g = car(v);
          const [w, l, h] = g.userData.size as number[];
          const lifted = lane === "repair" && r === 0 && b < 2;
          const y = lifted ? 1.0 : 0.06;
          // drive-in: each car starts on the apron in front of its zone and rolls into its bay, zone by zone
          const entry = cars[cars.length - 1];
          entry.baseY = y; entry.home = z;
          if (!reduced) {
            entry.z1 = z; entry.delay = 0.2 + ri * 0.35 + ci * 0.18 + i * 0.06;
            introEnd = Math.max(introEnd, entry.delay + 1.1);
            g.position.set(x, y, z + 4.8);
          } else g.position.set(x, y, z);
          const pad = mesh(padG, padM, x, 0.066, z, false); pad.scale.set(w + 0.4, 1, l + 0.35);
          zone.add(pad);
          if (lane === "incident") {
            const bm = mat("#ef4444", { emissive: "#ff2d2d", ei: 1.2 });
            beacons.push(bm);
            g.add(mesh(beaconG, bm, 0, h / g.scale.x + 0.14, 0, false));
            zone.add(mesh(coneG, coneM, x + w / 2 + 0.25, 0.3, z + l / 2 - 0.1));
          }
          zone.add(g);
        });
        scene.add(zone);
      }));

      // camera: a slow orbit the user can drag, clamped so the floor never turns away
      const target = new THREE.Vector3(0, 0, 0.9);
      let yaw = -0.14, pitch = 0.74, dist = 40;
      const place = () => {
        camera.position.set(target.x + dist * Math.sin(yaw) * Math.cos(pitch), target.y + dist * Math.sin(pitch), target.z + dist * Math.cos(yaw) * Math.cos(pitch));
        camera.lookAt(target);
      };
      let zoom = 1;
      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        dist = (w < 640 ? 62 : w < 1000 ? 48 : 39) * zoom;
        camera.updateProjectionMatrix();
        place();
        dirty = true;
      };
      let dirty = true;
      zoomBy.current = (f: number) => { zoom = Math.max(0.35, Math.min(1.3, zoom * f)); resize(); };
      const ro = new ResizeObserver(resize);
      ro.observe(el);

      const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
      let hovered: (typeof cars)[number] | null = null;
      const pick = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObjects(cars.map((x) => x.body), true)[0];
        let o = hit?.object as InstanceType<typeof THREE.Object3D> | undefined;
        while (o && !o.userData.vehicle) o = o.parent ?? undefined;
        return o ? cars.find((x) => x.body === o) ?? null : null;
      };
      const setHovered = (h: typeof hovered, e?: PointerEvent) => {
        if (hovered && hovered !== h) { hovered.paint.emissive.set("#000000"); hovered.paint.emissiveIntensity = 0; }
        hovered = h;
        if (h) { h.paint.emissive.set(h.paint.color); h.paint.emissiveIntensity = 0.35; }
        renderer.domElement.style.cursor = h ? "pointer" : drag ? "grabbing" : "grab";
        const r = el.getBoundingClientRect();
        setHover(h && e ? { x: e.clientX - r.left, y: e.clientY - r.top, v: h.v } : null);
        dirty = true;
      };

      let drag: { x: number; y: number; yaw: number; pitch: number; moved: boolean } | null = null;
      const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: false }; };
      const move = (e: PointerEvent) => {
        if (drag) {
          const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) {
            if (!drag.moved) renderer.domElement.setPointerCapture(e.pointerId);
            drag.moved = true;
          }
          if (drag.moved) {
            yaw = Math.max(-0.95, Math.min(0.95, drag.yaw - dx * 0.006));
            pitch = Math.max(0.5, Math.min(1.25, drag.pitch + dy * 0.004));
            place(); dirty = true; setHovered(null);
            return;
          }
        }
        if (e.pointerType === "mouse") setHovered(pick(e), e);
      };
      const up = (e: PointerEvent) => {
        const wasDrag = drag?.moved;
        drag = null;
        if (renderer.domElement.hasPointerCapture(e.pointerId)) renderer.domElement.releasePointerCapture(e.pointerId);
        if (!wasDrag) { const h = pick(e); if (h) open.current(h.v.row.vehicle_id); }
      };
      const leave = () => setHovered(null);
      const cv = renderer.domElement;
      cv.style.cursor = "grab";
      cv.style.touchAction = "pan-y";
      cv.addEventListener("pointerdown", down); cv.addEventListener("pointermove", move);
      cv.addEventListener("pointerup", up); cv.addEventListener("pointerleave", leave);

      // render only while visible; animate the accident beacons and a gentle idle float unless motion is reduced
      let visible = true, raf = 0, last = 0;
      const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) loop(); });
      io.observe(el);
      const timer = new THREE.Timer();
      function loop() {
        cancelAnimationFrame(raf);
        if (!visible || document.hidden || disposed) return;
        timer.update(); const t = timer.getElapsed(); nowT = t;
        // live traffic: a road-ready car drives out to the lane, waits, and comes back in
        let trips = false;
        for (const c of cars) {
          if (c.trip === undefined || c.home === undefined) continue;
          const k = t - c.trip, ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
          const out = k < 1.3 ? ease(k / 1.3) : k < 3.3 ? 1 : 1 - ease((k - 3.3) / 1.3);
          c.body.position.z = c.home + 5.4 * out;
          if (k >= 4.6) { c.body.position.z = c.home; c.trip = undefined; }
          trips = true;
        }
        if (trips) dirty = true;
        // animate at about 20 frames a second, and only while something moves (a beacon, a hovered or settling car)
        if (!reduced && t < introEnd) {
          for (const c of cars) {
            if (c.z1 === undefined || c.delay === undefined) continue;
            const k = Math.min(1, Math.max(0, (t - c.delay) / 1.0)), e = 1 - Math.pow(1 - k, 3);
            c.body.position.z = c.z1 + 4.8 * (1 - e);
          }
          dirty = true;
        } else if (introEnd && !reduced) {
          for (const c of cars) if (c.z1 !== undefined) c.body.position.z = c.z1;
          introEnd = 0; dirty = true;
        }
        const moving = beacons.length > 0 || !!hovered || cars.some((x) => x.body.position.y !== x.baseY);
        if (trips && t - last < 0.05 && !moving) { renderer.render(scene, camera); dirty = false; }
        if (!reduced && moving && t - last >= 0.05) {
          last = t;
          const pulse = 0.4 + 1.4 * Math.max(0, Math.sin(t * 5));
          beacons.forEach((b) => { b.emissiveIntensity = pulse; });
          if (hovered) hovered.body.position.y = hovered.baseY + 0.12 + Math.sin(t * 4) * 0.03;
          cars.forEach((x) => {
            if (x === hovered || x.body.position.y === x.baseY) return;
            const dy = x.baseY - x.body.position.y;
            x.body.position.y = Math.abs(dy) < 0.005 ? x.baseY : x.body.position.y + dy * 0.4;
          });
          dirty = true;
        }
        if (dirty) { renderer.render(scene, camera); dirty = false; }
        raf = requestAnimationFrame(loop);
      }
      // drive a car out on live trip and handover events (simulated demo feed)
      let lastEvent = liveStore.get().events[0]?.id ?? 0;
      const unsubscribe = liveStore.subscribe(() => {
        const e = liveStore.get().events[0];
        if (!e || e.id === lastEvent || reduced) return;
        lastEvent = e.id;
        if (e.kind !== "trip" && e.kind !== "handover") return;
        const idle = cars.filter((c) => c.v.lane === "road" && c.trip === undefined && c !== hovered);
        const c = idle[Math.floor(Math.random() * idle.length)];
        if (c) { c.trip = nowT; loop(); }
      });
      const vis = () => { if (!document.hidden) loop(); };
      document.addEventListener("visibilitychange", vis);
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        unsubscribe();
        ro.disconnect(); io.disconnect();
        document.removeEventListener("visibilitychange", vis);
        cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move);
        cv.removeEventListener("pointerup", up); cv.removeEventListener("pointerleave", leave);
        disposables.forEach((d) => d.dispose());
        envMap?.dispose();
        renderer.dispose();
        cv.remove();
      };
    }).catch(() => setFailed(true));
    return () => { disposed = true; cleanup(); };
  }, [groups, dark, resetKey, styleFor]);

  if (failed) return null;
  const lane = hover ? LANES.find((l) => l.id === hover.v.lane) : null;
  return (
    <div ref={host} className="garage-3d">
      <div className="garage-3d-hint">Drag to turn · + to look closer · click a car to open it</div>
      <div className="garage-3d-controls">
        <button aria-label="Zoom in" onClick={() => zoomBy.current(0.75)}>+</button>
        <button aria-label="Zoom out" onClick={() => zoomBy.current(1 / 0.75)}>−</button>
        <button onClick={() => setResetKey((k) => k + 1)}>Reset view</button>
      </div>
      {hover && lane && (
        <div className="garage-3d-tip" style={{ left: hover.x, top: hover.y }}>
          <b>{vehicleLabel(hover.v.row)}</b>
          <span>{[hover.v.row.make, hover.v.row.model].filter(Boolean).join(" ") || hover.v.row.vehicle_id}</span>
          <span style={{ color: lane.color }}>{lane.label} · {hover.v.readiness}/{hover.v.gates.length} gates</span>
          {hover.v.blockers[0] && <span className="text-muted">{hover.v.blockers[0]}</span>}
        </div>
      )}
    </div>
  );
}
