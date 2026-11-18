"use client";

/**
 * The 3D garage floor: six work zones on one slab, each holding up to eight cars from its queue. Cars are drawn from the
 * same derived garage state as the list below (which stays the accessible way to open a vehicle); clicking a car here
 * opens the same vehicle dialog. three.js is bundled with the app and loaded on demand, so nothing leaves the origin.
 * Without WebGL the scene is simply not shown.
 */
import { useEffect, useRef, useState } from "react";
import { useTheme } from "../chart";
import { LANES, vehicleLabel, type GarageLane, type GarageVehicle } from "@/lib/garage";

const PER_ZONE = 8;
const ZONE_W = 10.4, ZONE_D = 8.2, GAP = 1.2;
/** Zone placement: back row holds the work that keeps cars off the road, front row is nearest the exit. */
const LAYOUT: GarageLane[][] = [["incident", "repair", "renewal"], ["verify", "dispatch", "road"]];

interface Hover { x: number; y: number; v: GarageVehicle }

function cssColor(name: string, fallback: string) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function Garage3D({ groups, onOpen }: { groups: Record<GarageLane, GarageVehicle[]>; onOpen: (id: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const dark = useTheme();
  const [hover, setHover] = useState<Hover | null>(null);
  const [failed, setFailed] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const open = useRef(onOpen);
  useEffect(() => { open.current = onOpen; }, [onOpen]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let cleanup = () => {};
    void import("three").then((THREE) => {
      if (disposed) return;
      let renderer: InstanceType<typeof THREE.WebGLRenderer>;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      } catch {
        setFailed(true);
        return;
      }
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
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
      const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 200);
      scene.add(new THREE.HemisphereLight(dark ? "#b4bce0" : "#ffffff", dark ? "#1a1d2b" : "#b9bdcc", dark ? 1.7 : 1.5));
      const sun = new THREE.DirectionalLight("#ffffff", dark ? 2.2 : 2.0);
      sun.position.set(-14, 26, 16);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
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

      // shared car parts
      const wheelG = keep(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 18)).rotateZ(Math.PI / 2);
      const hubG = keep(new THREE.CylinderGeometry(0.16, 0.16, 0.28, 12)).rotateZ(Math.PI / 2);
      const bodyG = box(1.56, 0.5, 3.1), noseG = box(1.5, 0.22, 0.7), cabinG = box(1.34, 0.46, 1.62), roofG = box(1.28, 0.06, 1.34);
      const lampG = box(0.34, 0.1, 0.04), beaconG = keep(new THREE.CylinderGeometry(0.11, 0.13, 0.2, 14));
      const coneG = keep(new THREE.ConeGeometry(0.2, 0.55, 14));
      const tyreM = mat("#16181f", { rough: 0.9 }), hubM = mat("#9aa0b4", { metal: 0.6, rough: 0.35 });
      const glassM = mat(dark ? "#0b0e18" : "#26304a", { rough: 0.15, metal: 0.4 });
      const headM = mat("#ffffff", { emissive: "#fff6db", ei: 0.9 }), tailM = mat("#e11d48", { emissive: "#e11d48", ei: 0.6 });
      const coneM = mat("#f97316", { rough: 0.6 });

      const cars: { body: InstanceType<typeof THREE.Group>; paint: InstanceType<typeof THREE.MeshStandardMaterial>; v: GarageVehicle; baseY: number }[] = [];
      const beacons: InstanceType<typeof THREE.MeshStandardMaterial>[] = [];

      function car(color: string, v: GarageVehicle) {
        const g = new THREE.Group();
        const paint = mat(color, { rough: 0.38, metal: 0.25 });
        g.add(mesh(bodyG, paint, 0, 0.55, 0), mesh(noseG, paint, 0, 0.36, 1.25));
        g.add(mesh(cabinG, glassM, 0, 1.03, -0.18), mesh(roofG, paint, 0, 1.28, -0.2));
        for (const [x, z] of [[-0.72, 0.98], [0.72, 0.98], [-0.72, -1.0], [0.72, -1.0]] as const)
          g.add(mesh(wheelG, tyreM, x, 0.34, z), mesh(hubG, hubM, x, 0.34, z, false));
        g.add(mesh(lampG, headM, -0.48, 0.62, 1.56, false), mesh(lampG, headM, 0.48, 0.62, 1.56, false));
        g.add(mesh(lampG, tailM, -0.5, 0.64, -1.56, false), mesh(lampG, tailM, 0.5, 0.64, -1.56, false));
        cars.push({ body: g, paint, v, baseY: 0 });
        g.userData.vehicle = v.row.vehicle_id;
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

        list.slice(0, PER_ZONE).forEach((v, i) => {
          const r = Math.floor(i / 4), b = i % 4;
          const g = car(color, v);
          const lifted = lane === "repair" && r === 0 && b < 2;
          const y = lifted ? 1.0 : 0.06;
          g.position.set(-ZONE_W / 2 + 0.6 + 1.15 + b * 2.3, y, -1.6 + r * 3.9);
          cars[cars.length - 1].baseY = y;
          if (lane === "incident") {
            const bm = mat("#ef4444", { emissive: "#ff2d2d", ei: 1.2 });
            beacons.push(bm);
            g.add(mesh(beaconG, bm, 0, 1.42, -0.2, false));
            const cone = mesh(coneG, coneM, 1.05, 0.3, 1.5);
            g.add(cone);
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
      const resize = () => {
        const w = el.clientWidth, h = el.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        dist = w < 640 ? 62 : w < 1000 ? 48 : 39;
        camera.updateProjectionMatrix();
        place();
        dirty = true;
      };
      let dirty = true;
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
      let visible = true, raf = 0;
      const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) loop(); });
      io.observe(el);
      const timer = new THREE.Timer();
      function loop() {
        cancelAnimationFrame(raf);
        if (!visible || document.hidden || disposed) return;
        timer.update(); const t = timer.getElapsed();
        if (!reduced) {
          const pulse = 0.4 + 1.4 * Math.max(0, Math.sin(t * 5));
          beacons.forEach((b) => { b.emissiveIntensity = pulse; });
          if (hovered) hovered.body.position.y = hovered.baseY + 0.12 + Math.sin(t * 4) * 0.03;
          cars.forEach((x) => { if (x !== hovered && x.body.position.y !== x.baseY) x.body.position.y += (x.baseY - x.body.position.y) * 0.25; });
          dirty = true;
        }
        if (dirty) { renderer.render(scene, camera); dirty = false; }
        raf = requestAnimationFrame(loop);
      }
      const vis = () => { if (!document.hidden) loop(); };
      document.addEventListener("visibilitychange", vis);
      loop();

      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect(); io.disconnect();
        document.removeEventListener("visibilitychange", vis);
        cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointermove", move);
        cv.removeEventListener("pointerup", up); cv.removeEventListener("pointerleave", leave);
        disposables.forEach((d) => d.dispose());
        renderer.dispose();
        cv.remove();
      };
    }).catch(() => setFailed(true));
    return () => { disposed = true; cleanup(); };
  }, [groups, dark, resetKey]);

  if (failed) return null;
  const lane = hover ? LANES.find((l) => l.id === hover.v.lane) : null;
  return (
    <div ref={host} className="garage-3d">
      <div className="garage-3d-hint">Drag to turn the floor · click a car to open it</div>
      <button className="garage-3d-reset" onClick={() => setResetKey((k) => k + 1)}>Reset view</button>
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
