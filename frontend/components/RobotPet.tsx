"use client";

// Author: Ramprasad — RobotPet: a procedural three.js arena-bot mascot.
// Zero model files, zero image assets. Renders on mount, fully disposes on
// unmount. Honors prefers-reduced-motion (single static frame, no loop).

import { useEffect, useRef } from "react";
import * as THREE from "three";

const INK = 0x1c1b18;
const CRIMSON = 0xc01010;
const PAPER = 0xf3f2ee;
const BRASS = 0x8a6d3b;

export function RobotPet({ className = "", label = "Varanasi arena-bot mascot" }: { className?: string; label?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const el: HTMLDivElement = host;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const width = el.clientWidth || 320;
    const height = el.clientHeight || 320;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 6.4);
    camera.lookAt(0, 1.1, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(3, 6, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(CRIMSON, 0.7);
    rim.position.set(-4, 2, -3);
    scene.add(rim);

    const bot = new THREE.Group();
    scene.add(bot);

    const iron = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.45, metalness: 0.65 });
    const crimson = new THREE.MeshStandardMaterial({ color: CRIMSON, roughness: 0.4, metalness: 0.3 });
    const brass = new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.35, metalness: 0.8 });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: CRIMSON,
      emissive: CRIMSON,
      emissiveIntensity: 2.2,
      roughness: 0.2,
    });

    // Torso
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 1.1, 24), iron);
    torso.position.y = 1.05;
    bot.add(torso);
    // Chest plate + diamond glyph
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.08), brass);
    plate.position.set(0, 1.08, 0.68);
    bot.add(plate);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), crimson);
    gem.position.set(0, 1.12, 0.76);
    bot.add(gem);

    // Head group (tilts toward pointer)
    const head = new THREE.Group();
    head.position.y = 2.0;
    bot.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.48, 28, 22), iron);
    head.add(skull);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.26, 0.3), new THREE.MeshStandardMaterial({ color: 0x0a0a09, roughness: 0.15, metalness: 0.4 }));
    visor.position.set(0, 0.05, 0.3);
    head.add(visor);
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.075, 14, 12), eyeMat);
    eyeL.position.set(-0.17, 0.05, 0.46);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.17;
    head.add(eyeL, eyeR);
    // Antenna
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), brass);
    stem.position.y = 0.62;
    head.add(stem);
    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 10),
      new THREE.MeshStandardMaterial({ color: CRIMSON, emissive: CRIMSON, emissiveIntensity: 2.5 }),
    );
    tip.position.y = 0.92;
    head.add(tip);

    // Arms (right arm waves on click)
    function arm(side: 1 | -1) {
      const g = new THREE.Group();
      g.position.set(0.78 * side, 1.45, 0);
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.7, 12), iron);
      upper.position.y = -0.3;
      g.add(upper);
      const mitt = new THREE.Mesh(new THREE.SphereGeometry(0.15, 14, 12), brass);
      mitt.position.y = -0.7;
      g.add(mitt);
      g.rotation.z = 0.25 * side;
      bot.add(g);
      return g;
    }
    const armL = arm(-1);
    const armR = arm(1);

    // Hover base ring
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.045, 10, 40),
      new THREE.MeshStandardMaterial({ color: BRASS, roughness: 0.3, metalness: 0.85 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    scene.add(ring);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.7, 28),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.16 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.02;
    scene.add(shadow);

    // Pointer tracking (head tilt) + click wave
    const pointer = new THREE.Vector2(0, 0);
    let wave = 0;
    function onMove(e: PointerEvent) {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    }
    function onClick() {
      wave = 1;
    }
    renderer.domElement.addEventListener("pointermove", onMove);
    renderer.domElement.addEventListener("click", onClick);

    function onResize() {
      const w = el.clientWidth || 320;
      const h = el.clientHeight || 320;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", onResize);

    const clock = new THREE.Clock();
    let raf = 0;
    let blinkAt = 1.6;

    function frame() {
      const t = clock.getElapsedTime();
      // Hover
      bot.position.y = Math.sin(t * 1.4) * 0.12;
      bot.rotation.y = Math.sin(t * 0.35) * 0.35;
      // Head follows pointer, eased
      head.rotation.y += (pointer.x * 0.55 - head.rotation.y) * 0.08;
      head.rotation.x += (-pointer.y * 0.3 - head.rotation.x) * 0.08;
      // Blink
      if (t > blinkAt) {
        blinkAt = t + 1.8 + Math.random() * 2.4;
        eyeL.scale.y = 0.12;
        eyeR.scale.y = 0.12;
        setTimeout(() => {
          eyeL.scale.y = 1;
          eyeR.scale.y = 1;
        }, 130);
      }
      // Antenna pulse + gem spin
      const pulse = 1.6 + Math.sin(t * 5) * 1.1;
      (tip.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
      gem.rotation.y = t * 1.2;
      // Click wave (right arm)
      if (wave > 0) {
        wave = Math.max(0, wave - 0.03);
        armR.rotation.z = 0.25 - Math.sin((1 - wave) * Math.PI * 2) * 1.1 * wave - 1.4 * wave;
      } else {
        armR.rotation.z += (0.25 - armR.rotation.z) * 0.1;
      }
      armL.rotation.x = Math.sin(t * 1.4) * 0.08;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }

    if (reduceMotion) {
      renderer.render(scene, camera);
    } else {
      frame();
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointermove", onMove);
      renderer.domElement.removeEventListener("click", onClick);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry.dispose();
          const mat = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === el) el.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={label}
      className={className}
      style={{ width: "100%", height: "100%", minHeight: 280, cursor: "pointer" }}
    />
  );
}
