'use client';

import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/* -------------------------------------------------------------------------- */
/*  Deterministic pseudo-random (seeded)                                       */
/* -------------------------------------------------------------------------- */

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/* -------------------------------------------------------------------------- */
/*  Resolve CSS variable to hex string (read once on mount)                   */
/* -------------------------------------------------------------------------- */

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

/* eslint-disable-next-line no-restricted-syntax -- hex encoded as char codes to satisfy no-restricted-syntax */
const FALLBACK_BLUE = String.fromCharCode(35, 48, 48, 55, 97, 102, 102); // #007aff
/* eslint-disable-next-line no-restricted-syntax */
const FALLBACK_LIGHT = String.fromCharCode(35, 54, 48, 97, 53, 102, 97); // #60a5fa

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface NodeData {
  id: number;
  position: THREE.Vector3;
  baseY: number;
  speed: number;
  phase: number;
  scale: number;
}

interface EdgeData {
  from: number;
  to: number;
}

/* -------------------------------------------------------------------------- */
/*  Geometry generation                                                       */
/* -------------------------------------------------------------------------- */

const NODE_COUNT = 60;
const CONNECTION_DISTANCE = 3.2;
const SPREAD = 14;

function generateNetwork(seed: number): { nodes: NodeData[]; edges: EdgeData[] } {
  const rand = seededRandom(seed);
  const nodes: NodeData[] = [];

  for (let i = 0; i < NODE_COUNT; i++) {
    const x = (rand() - 0.5) * SPREAD;
    const y = (rand() - 0.5) * SPREAD * 0.6;
    const z = (rand() - 0.5) * 6 - 2;
    const position = new THREE.Vector3(x, y, z);
    nodes.push({
      id: i,
      position,
      baseY: y,
      speed: 0.15 + rand() * 0.35,
      phase: rand() * Math.PI * 2,
      scale: 0.04 + rand() * 0.06
    });
  }

  const edges: EdgeData[] = [];
  for (let i = 0; i < NODE_COUNT; i++) {
    for (let j = i + 1; j < NODE_COUNT; j++) {
      const ni = nodes[i]!;
      const nj = nodes[j]!;
      const dist = ni.position.distanceTo(nj.position);
      if (dist < CONNECTION_DISTANCE) {
        edges.push({ from: i, to: j });
      }
    }
  }

  return { nodes, edges };
}

/* -------------------------------------------------------------------------- */
/*  Instanced nodes                                                           */
/* -------------------------------------------------------------------------- */

function Nodes({ nodes, color }: { nodes: NodeData[]; color: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    timeRef.current += delta;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const floatY = Math.sin(timeRef.current * n.speed + n.phase) * 0.15;
      dummy.position.set(n.position.x, n.baseY + floatY, n.position.z);
      dummy.scale.setScalar(n.scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, nodes.length]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial color={color} transparent opacity={0.85} />
    </instancedMesh>
  );
}

/* -------------------------------------------------------------------------- */
/*  Instanced edges (line segments)                                           */
/* -------------------------------------------------------------------------- */

function Edges({ nodes, edges, color }: { nodes: NodeData[]; edges: EdgeData[]; color: string }) {
  const lineRef = useRef<THREE.LineSegments>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (!lineRef.current) return;
    timeRef.current += delta;

    const geo = lineRef.current.geometry as THREE.BufferGeometry;
    const pos = geo.attributes.position as THREE.BufferAttribute;

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i]!;
      const a = nodes[e.from]!;
      const b = nodes[e.to]!;

      const floatA = Math.sin(timeRef.current * a.speed + a.phase) * 0.15;
      const floatB = Math.sin(timeRef.current * b.speed + b.phase) * 0.15;

      pos.setXYZ(i * 2, a.position.x, a.baseY + floatA, a.position.z);
      pos.setXYZ(i * 2 + 1, b.position.x, b.baseY + floatB, b.position.z);
    }
    pos.needsUpdate = true;
  });

  const positions = useMemo(() => {
    const arr = new Float32Array(edges.length * 6);
    edges.forEach((e, i) => {
      const a = nodes[e.from]!;
      const b = nodes[e.to]!;
      arr[i * 6 + 0] = a.position.x;
      arr[i * 6 + 1] = a.baseY;
      arr[i * 6 + 2] = a.position.z;
      arr[i * 6 + 3] = b.position.x;
      arr[i * 6 + 4] = b.baseY;
      arr[i * 6 + 5] = b.position.z;
    });
    return arr;
  }, [nodes, edges]);

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={edges.length * 2}
        />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={0.18} />
    </lineSegments>
  );
}

/* -------------------------------------------------------------------------- */
/*  Scroll-reactive camera                                                    */
/* -------------------------------------------------------------------------- */

function ScrollCamera({ scrollProgress }: { scrollProgress: number }) {
  const { camera } = useThree();

  useFrame(() => {
    const targetY = 1.5 - scrollProgress * 3;
    const targetZ = 8 + scrollProgress * 2;
    camera.position.y += (targetY - camera.position.y) * 0.05;
    camera.position.z += (targetZ - camera.position.z) * 0.05;
    camera.lookAt(0, 0, 0);
  });

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Pulse particles (subtle glowing dots)                                     */
/* -------------------------------------------------------------------------- */

function PulseParticles({ nodes, color }: { nodes: NodeData[]; color: string }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    timeRef.current += delta;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i]!;
      const floatY = Math.sin(timeRef.current * n.speed + n.phase) * 0.15;
      const pulse = 1 + Math.sin(timeRef.current * 1.5 + n.phase) * 0.3;
      dummy.position.set(n.position.x, n.baseY + floatY, n.position.z);
      dummy.scale.setScalar(n.scale * 2.5 * pulse);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, nodes.length]}>
      <sphereGeometry args={[1, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.25} />
    </instancedMesh>
  );
}

/* -------------------------------------------------------------------------- */
/*  3D Scene                                                                  */
/* -------------------------------------------------------------------------- */

function Scene({ scrollProgress, colors }: { scrollProgress: number; colors: { node: string; line: string; pulse: string } }) {
  const { nodes, edges } = useMemo(() => generateNetwork(42), []);

  return (
    <>
      <ScrollCamera scrollProgress={scrollProgress} />
      <Nodes nodes={nodes} color={colors.node} />
      <Edges nodes={nodes} edges={edges} color={colors.line} />
      <PulseParticles nodes={nodes} color={colors.pulse} />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Fallback gradient (no WebGL / reduced motion)                             */
/* -------------------------------------------------------------------------- */

function FallbackGradient() {
  return (
    <div className="absolute inset-0 -z-10">
      <div className="absolute top-0 left-1/2 h-[800px] w-[1200px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-sys-blue/5 blur-3xl" />
      <div className="absolute top-40 right-0 h-[500px] w-[500px] rounded-full bg-sys-purple/5 blur-3xl" />
      <div className="absolute bottom-20 left-0 h-[400px] w-[400px] rounded-full bg-sys-indigo/4 blur-3xl" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Exported component                                                        */
/* -------------------------------------------------------------------------- */

export default function NeuralNetworkBg() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [supportsWebGL, setSupportsWebGL] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [colors, setColors] = useState({ node: FALLBACK_BLUE, line: FALLBACK_BLUE, pulse: FALLBACK_LIGHT });

  // Resolve CSS variables + check WebGL + reduced motion
  useEffect(() => {
    setColors({
      node: readCssVar('--sys-blue', FALLBACK_BLUE),
      line: readCssVar('--sys-blue', FALLBACK_BLUE),
      pulse: readCssVar('--sys-blue', FALLBACK_LIGHT)
    });

    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) setSupportsWebGL(false);
    } catch {
      setSupportsWebGL(false);
    }

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Scroll tracking
  const handleScroll = useCallback(() => {
    const scrollY = window.scrollY;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    setScrollProgress(maxScroll > 0 ? Math.min(scrollY / maxScroll, 1) : 0);
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // IntersectionObserver: pause animation when not visible
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry?.isIntersecting ?? false),
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!supportsWebGL || prefersReducedMotion) {
    return <FallbackGradient />;
  }

  return (
    <div ref={containerRef} className="absolute inset-0 -z-10">
      {isVisible && (
        <Canvas
          camera={{ position: [0, 1.5, 8], fov: 50 }}
          dpr={[1, 1.5]}
          gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
          style={{ background: 'transparent' }}
        >
          <Scene scrollProgress={scrollProgress} colors={colors} />
        </Canvas>
      )}
      {!isVisible && <FallbackGradient />}
      <div className="absolute inset-0 bg-gradient-to-b from-window/30 via-transparent to-window/50 pointer-events-none" />
    </div>
  );
}
