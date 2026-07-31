/**
 * THE GLOBE — the far end of the place picker's zoom range.
 *
 * Scroll out far enough and the flat map hands off to an actual sphere you can
 * spin; scroll back in and the sphere hands back. The two share a coordinate
 * space and the same satellite imagery, so the transition reads as one continuous
 * world rather than two different screens.
 *
 * three.js is imported dynamically. It is ~190 kB gzipped and the globe lives
 * behind a keypress, so a visitor who never opens the map never pays for it.
 */

import { useEffect, useRef, useState } from 'react';
import type { Coordinates } from '../../types';
import { buildGlobeTexture, latLngToVector, vectorToLatLng } from '../lib/globeTexture';

interface Props {
  coordinates: Coordinates;
  /** Fired on click; the caller reverse-geocodes and commits. */
  onPick: (coordinates: Coordinates) => void;
  /**
   * Fired when the user scrolls in past the handover point, carrying the place
   * they were actually pointing at — not the last point they picked. Zooming is
   * navigation, and handing the flat map the old selection instead of the spot
   * under the cursor teleports you away from whatever you were flying toward.
   */
  onZoomIn: (target: Coordinates) => void;
  accent: string;
}

/** Camera distance at which the flat map takes over. Sphere radius is 1. */
const HANDOVER_DISTANCE = 1.85;
const MAX_DISTANCE = 4.2;

export function GlobeView({ coordinates, onPick, onZoomIn, accent }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [progress, setProgress] = useState(0);
  /** Kept in refs so the animation loop never restarts on a prop change. */
  const markerMatRef = useRef<{ color: { set(v: string): void } } | null>(null);
  const pickRef = useRef(onPick);
  const zoomInRef = useRef(onZoomIn);
  const coordsRef = useRef(coordinates);
  const accentRef = useRef(accent);
  accentRef.current = accent;
  pickRef.current = onPick;
  zoomInRef.current = onZoomIn;
  coordsRef.current = coordinates;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let cleanup: (() => void) | null = null;

    void (async () => {
      const THREE = await import('three');
      const texCanvas = await buildGlobeTexture((loaded, total) =>
        setProgress(Math.round((loaded / total) * 100)),
      );
      if (disposed) return;

      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(width, height);
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
      let distance = 2.9;
      camera.position.set(0, 0, distance);

      const texture = new THREE.CanvasTexture(texCanvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

      const globe = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 64),
        new THREE.MeshStandardMaterial({ map: texture, roughness: 1, metalness: 0 }),
      );
      scene.add(globe);

      // A rim of atmosphere. BackSide + additive turns the shell into a glow that
      // only shows where the sphere curves away, which is what sells "planet"
      // rather than "textured ball".
      const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.025, 64, 48),
        new THREE.ShaderMaterial({
          transparent: true,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
          uniforms: { uColor: { value: new THREE.Color('#6db3ff') } },
          vertexShader: `
            varying float vRim;
            void main() {
              vec3 n = normalize(normalMatrix * normal);
              vec4 mv = modelViewMatrix * vec4(position, 1.0);
              vRim = pow(1.0 - abs(dot(n, normalize(-mv.xyz))), 2.5);
              gl_Position = projectionMatrix * mv;
            }`,
          fragmentShader: `
            uniform vec3 uColor;
            varying float vRim;
            void main() { gl_FragColor = vec4(uColor, vRim * 0.85); }`,
        }),
      );
      scene.add(atmosphere);

      scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const sun = new THREE.DirectionalLight(0xffffff, 1.5);
      sun.position.set(3, 2, 4);
      scene.add(sun);

      // Marker for the currently selected point.
      const markerMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(accentRef.current) });
      markerMatRef.current = markerMaterial;
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 16), markerMaterial);
      globe.add(marker);
      const placeMarker = (c: Coordinates) => {
        const [x, y, z] = latLngToVector(c.lat, c.lng, 1.012);
        marker.position.set(x, y, z);
      };
      placeMarker(coordsRef.current);

      // Face the selected point on open, so the globe never arrives showing the
      // wrong side of the planet.
      /**
       * Rotate a given lat/lng to face the camera at +Z.
       *
       * SphereGeometry lays vertices out as x=-r·cosθ·sinφ, z=r·sinθ·sinφ with
       * θ=(lng+180), so bringing a point to azimuth 0 needs rotation.y = π/2 − θ.
       * The previous expression (−θ − π/2) is that value shifted by exactly π —
       * measured at −180° for every longitude — so the globe opened on the
       * ANTIPODE of wherever you were standing, and the zoom-toward-cursor easing
       * inherited the same error and pushed away from the cursor instead of
       * toward it.
       */
      const yawFor = (lng: number) => Math.PI / 2 - ((lng + 180) * Math.PI) / 180;

      const facePoint = (c: Coordinates) => {
        globe.rotation.y = yawFor(c.lng);
        globe.rotation.x = (c.lat * Math.PI) / 180;
      };
      facePoint(coordsRef.current);

      // --- interaction ------------------------------------------------------
      const drag = { active: false, x: 0, y: 0, moved: 0 };

      const onPointerDown = (e: PointerEvent) => {
        drag.active = true;
        drag.x = e.clientX;
        drag.y = e.clientY;
        drag.moved = 0;
        renderer.domElement.setPointerCapture(e.pointerId);
      };
      const onPointerMove = (e: PointerEvent) => {
        if (!drag.active) return;
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX;
        drag.y = e.clientY;
        globe.rotation.y += dx * 0.005;
        // Clamped so the globe cannot roll past the poles and end up upside down.
        globe.rotation.x = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, globe.rotation.x + dy * 0.005),
        );
      };
      const onPointerUp = (e: PointerEvent) => {
        if (!drag.active) return;
        drag.active = false;
        if (renderer.domElement.hasPointerCapture?.(e.pointerId)) {
          renderer.domElement.releasePointerCapture(e.pointerId);
        }
        // A drag that barely moved is a click. Without this threshold every spin
        // would also relocate the user.
        if (drag.moved > 6) return;

        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(globe, false)[0];
        if (!hit) return;
        // World -> sphere-local, so the reading is independent of how far the
        // user has spun it.
        const local = globe.worldToLocal(hit.point.clone());
        const { lat, lng } = vectorToLatLng(local.x, local.y, local.z);
        placeMarker({ lat, lng });
        pickRef.current({ lat, lng });
      };

      /** Lat/lng under a screen point, or null if it misses the sphere. */
      const pointAt = (clientX: number, clientY: number): Coordinates | null => {
        const rect = renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1,
        );
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(globe, false)[0];
        if (!hit) return null;
        const local = globe.worldToLocal(hit.point.clone());
        return vectorToLatLng(local.x, local.y, local.z);
      };

      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const zoomingIn = e.deltaY < 0;
        distance = Math.min(MAX_DISTANCE, Math.max(1.2, distance + e.deltaY * 0.0016));
        camera.position.setZ(distance);

        // Ease the globe toward the cursor as you close in, so the thing you are
        // aiming at drifts to the middle instead of sliding off the edge.
        if (zoomingIn) {
          const under = pointAt(e.clientX, e.clientY);
          if (under) {
            const targetY = yawFor(under.lng);
            const targetX = (under.lat * Math.PI) / 180;
            // Shortest way round, so it never spins the long way to get there.
            const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
            globe.rotation.y += wrap(targetY - globe.rotation.y) * 0.16;
            globe.rotation.x += (targetX - globe.rotation.x) * 0.16;
          }
        }

        if (distance <= HANDOVER_DISTANCE) {
          // Hand over the point at the centre of the view — by now the easing
          // above has brought the cursor's target there — falling back to the
          // cursor, then to the current selection if the ray missed entirely.
          const centre =
            pointAt(rect().left + rect().width / 2, rect().top + rect().height / 2) ??
            pointAt(e.clientX, e.clientY) ??
            coordsRef.current;
          zoomInRef.current(centre);
        }
      };

      const rect = () => renderer.domElement.getBoundingClientRect();

      const el = renderer.domElement;
      el.style.touchAction = 'none';
      el.style.cursor = 'grab';
      el.addEventListener('pointerdown', onPointerDown);
      el.addEventListener('pointermove', onPointerMove);
      el.addEventListener('pointerup', onPointerUp);
      el.addEventListener('pointercancel', onPointerUp);
      el.addEventListener('wheel', onWheel, { passive: false });

      const ro = new ResizeObserver(() => {
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      });
      ro.observe(host);

      const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      let frame = 0;
      const tick = () => {
        frame = requestAnimationFrame(tick);
        // A slow idle drift, unless the user has asked for less motion.
        if (!drag.active && !reduced) globe.rotation.y += 0.00035;
        renderer.render(scene, camera);
      };
      tick();
      setStatus('ready');

      cleanup = () => {
        cancelAnimationFrame(frame);
        ro.disconnect();
        el.removeEventListener('pointerdown', onPointerDown);
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerUp);
        el.removeEventListener('pointercancel', onPointerUp);
        el.removeEventListener('wheel', onWheel);
        // WebGL contexts are a finite resource; leaking one per map-open would
        // eventually make the globe refuse to initialise at all.
        scene.traverse((obj) => {
          const mesh = obj as { geometry?: { dispose(): void }; material?: { dispose(): void } };
          mesh.geometry?.dispose();
          mesh.material?.dispose();
        });
        texture.dispose();
        renderer.dispose();
        if (el.parentNode) el.parentNode.removeChild(el);
      };
    })().catch(() => {
      if (!disposed) setStatus('error');
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
    // Built once per mount, full stop. Keying this on `accent` meant that simply
    // stepping across an era boundary disposed and rebuilt the renderer, texture
    // and geometry — refetching 64 tiles and burning a WebGL context each time.
    // The accent only tints the marker, which the effect below assigns directly.
     
  }, []);

  // Recolour in place rather than rebuilding the scene.
  useEffect(() => {
    markerMatRef.current?.color.set(accent);
  }, [accent]);

  return (
    <div className="globe" ref={hostRef}>
      {status === 'loading' && (
        <div className="globe-status">assembling the globe… {progress}%</div>
      )}
      {status === 'error' && (
        <div className="globe-status globe-status--error">
          the globe could not load — the flat map still works
        </div>
      )}
    </div>
  );
}
