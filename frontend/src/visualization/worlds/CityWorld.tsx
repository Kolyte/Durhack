import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
import * as THREE from 'three';
import type { WorldDef } from '../../cosmetics/catalog';
import { pulses } from '../pulseBus';
import { mulberry32, noRaycast, reducedMotion } from './random';

/**
 * Code City backgrounds from the shop: a gradient sky with an optional sun (striped for Synthwave),
 * aurora curtains, weather particles, a neon grid to the horizon and a rising Earth. Everything stays
 * mounted and is driven by uniforms, so changing worlds never compiles a shader mid-song.
 */

const SKY_RADIUS = 380;

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const skyFragment = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uBottom;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunSize;
  uniform float uSunOn;
  uniform float uStriped;
  uniform float uTime;
  uniform float uOpacity;
  varying vec3 vDir;
  // The city camera looks down ~35°, so the real horizon is off-screen. The painted horizon sits lower,
  // where you can actually see the sky behind the skyline.
  const float HORIZON = -0.42;
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y - HORIZON;
    vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(clamp(y * 1.6, 0.0, 1.0), 0.6)) : mix(uHorizon, uBottom, clamp(-y * 4.0, 0.0, 1.0));
    if (uSunOn > 0.5) {
      float ang = acos(clamp(dot(d, normalize(uSunDir)), -1.0, 1.0));
      float r = uSunSize * 0.5;
      float disc = smoothstep(r, r * 0.97, ang);
      if (uStriped > 0.5) {
        // Retro sun: gradient from yellow to pink, cut by stripes that widen towards the bottom.
        float v = (d.y - normalize(uSunDir).y) / r; // about -1 at the bottom of the disc, 1 at the top
        float band = fract(v * 5.0 + uTime * 0.15);
        float gap = smoothstep(0.2, -0.9, v) * 0.55;
        disc *= v > 0.1 ? 1.0 : step(gap, band);
        vec3 sunCol = mix(vec3(1.0, 0.18, 0.55), uSunColor, smoothstep(-1.0, 0.8, v));
        col = mix(col, sunCol * 1.25, disc);
      } else {
        col = mix(col, uSunColor * 1.3, disc);
      }
      col += uSunColor * exp(-ang / (r * 1.6)) * 0.35;
    }
    gl_FragColor = vec4(col, uOpacity);
  }
`;

const auroraVertex = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x * 0.02 + uTime * 0.25) * 18.0 + sin(p.x * 0.05 - uTime * 0.4) * 6.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const auroraFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying vec2 vUv;
  void main() {
    // Bright at the bottom edge, fading upwards, with vertical rays moving along the curtain.
    float rays = 0.55 + 0.45 * sin(vUv.x * 90.0 + uTime * 0.8) * sin(vUv.x * 37.0 - uTime * 0.5);
    float fade = smoothstep(0.0, 0.15, vUv.y) * pow(1.0 - vUv.y, 1.6);
    float ends = smoothstep(0.0, 0.15, vUv.x) * smoothstep(1.0, 0.85, vUv.x);
    vec3 col = mix(uColorA, uColorB, vUv.y);
    float a = fade * ends * rays * 0.75;
    gl_FragColor = vec4(col * a, a);
  }
`;

const weatherVertex = /* glsl */ `
  attribute float aPhase;
  uniform float uTime;
  uniform float uTop;
  uniform float uSpeed;
  uniform float uSway;
  uniform float uSize;
  uniform float uPixelRatio;
  varying float vPhase;
  void main() {
    vPhase = aPhase;
    float fall = fract(uTime * uSpeed * (0.7 + aPhase * 0.6) + aPhase);
    vec3 p = position;
    p.y = mix(uTop, -0.1, fall);
    p.x += sin(uTime * 0.7 + aPhase * 30.0) * uSway + fall * uSway * 2.0;
    p.z += cos(uTime * 0.5 + aPhase * 17.0) * uSway;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(uSize * 60.0 / -mv.z, 1.0, 14.0) * uPixelRatio;
  }
`;
const weatherFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uKind; // 0 snow, 1 rain, 2 petals, 3 embers/dust
  uniform float uTime;
  varying float vPhase;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a;
    if (uKind < 0.5) {
      a = smoothstep(0.5, 0.1, length(c));
    } else if (uKind < 1.5) {
      // Rain: a thin, slightly slanted streak.
      a = smoothstep(0.06, 0.0, abs(c.x + c.y * 0.15)) * smoothstep(0.5, 0.2, abs(c.y));
    } else if (uKind < 2.5) {
      float s = sin(uTime * 2.0 + vPhase * 20.0), co = cos(uTime * 2.0 + vPhase * 20.0);
      c = vec2(c.x * co - c.y * s, c.x * s + c.y * co);
      a = smoothstep(0.5, 0.35, length(c * vec2(1.0, 2.2)));
    } else {
      a = smoothstep(0.5, 0.0, length(c)) * (0.5 + 0.5 * sin(uTime * 3.0 + vPhase * 50.0));
    }
    gl_FragColor = vec4(uColor * a, a * 0.85);
  }
`;

const gridVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const gridFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uInner;
  uniform float uOuter;
  uniform float uTime;
  uniform float uBeat;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    vec2 g = abs(fract(p * 0.25 + vec2(0.0, uTime * 0.12)) - 0.5) / fwidth(p * 0.25);
    float line = 1.0 - min(min(g.x, g.y), 1.0);
    float r = length(p);
    float fade = smoothstep(uInner, uInner + 4.0, r) * (1.0 - smoothstep(uOuter * 0.5, uOuter, r));
    float a = line * fade * (0.75 + uBeat * 0.1);
    gl_FragColor = vec4(uColor * a * 1.6, a);
  }
`;

const earthFragment = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  void main() {
    vec2 c = (vUv - 0.5) * 2.0;
    float d = length(c);
    if (d > 1.0) {
      float halo = exp(-(d - 0.8) * 9.0) * 0.6;
      gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * halo, halo);
      return;
    }
    // Sphere shading: fake 3D from the disc, lit from the side (a crescent of night).
    float z = sqrt(1.0 - d * d);
    vec3 n = vec3(c, z);
    float light = clamp(dot(n, normalize(vec3(0.7, 0.35, 0.6))), 0.0, 1.0);
    vec2 uv = vec2(atan(n.x, n.z) * 0.8 + uTime * 0.01, n.y * 1.5);
    float land = smoothstep(0.52, 0.56, noise(uv * 3.0) * 0.65 + noise(uv * 7.0) * 0.35);
    float cloud = smoothstep(0.55, 0.8, noise(uv * 5.0 + vec2(uTime * 0.02, 0.0)));
    vec3 col = mix(vec3(0.05, 0.22, 0.6), vec3(0.18, 0.5, 0.22), land);
    col = mix(col, vec3(1.0), cloud * 0.8);
    col *= 0.08 + light * 1.1;
    col += vec3(0.3, 0.55, 1.0) * pow(1.0 - z, 3.0) * 0.8;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const billboardVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const WEATHER_KIND = { snow: 0, rain: 1, petals: 2, embers: 3, dust: 3 } as const;
const WEATHER_MOTION = {
  snow: { speed: 0.05, sway: 0.5, size: 2 },
  rain: { speed: 0.6, sway: 0.08, size: 3.2 },
  petals: { speed: 0.04, sway: 0.9, size: 1.6 },
  embers: { speed: 0.08, sway: 0.6, size: 0.9 },
  dust: { speed: 0.02, sway: 1.4, size: 1.3 },
} as const;

/** Sun direction from elevation (0 = horizon) along a fixed azimuth behind the default camera view. */
function sunDir(elevation: number) {
  // Matches HORIZON in the sky shader.
  return new THREE.Vector3(-0.55, elevation - 0.42, -0.83).normalize();
}

export function CityWorld({ world, visible, radius, lowPower }: { world: WorldDef; visible: boolean; radius: number; lowPower: boolean }) {
  const R = Math.max(10, radius);
  const { camera } = useThree();
  const skyGroup = useRef<THREE.Group>(null);

  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uBottom: { value: new THREE.Color() },
          uSunColor: { value: new THREE.Color() },
          uSunDir: { value: new THREE.Vector3(0, 0.1, -1) },
          uSunSize: { value: 0.2 },
          uSunOn: { value: 0 },
          uStriped: { value: 0 },
          uTime: { value: 0 },
          uOpacity: { value: 1 },
        },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        transparent: true,
      }),
    [],
  );
  const auroraMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: auroraVertex,
        fragmentShader: auroraFragment,
        uniforms: { uTime: { value: 0 }, uColorA: { value: new THREE.Color('#34d399') }, uColorB: { value: new THREE.Color('#a78bfa') } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [],
  );
  const weatherMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: weatherVertex,
        fragmentShader: weatherFragment,
        uniforms: {
          uTime: { value: 0 },
          uTop: { value: 12 },
          uSpeed: { value: 0.05 },
          uSway: { value: 0.5 },
          uSize: { value: 1 },
          uPixelRatio: { value: 1 },
          uColor: { value: new THREE.Color('#ffffff') },
          uKind: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const gridMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: gridVertex,
        fragmentShader: gridFragment,
        uniforms: { uColor: { value: new THREE.Color('#ff2bd6') }, uInner: { value: 10 }, uOuter: { value: 200 }, uTime: { value: 0 }, uBeat: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const earthMat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: billboardVertex, fragmentShader: earthFragment, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, fog: false }),
    [],
  );

  const weather = useMemo(() => {
    const rng = mulberry32(3);
    const n = lowPower ? 900 : 2200;
    const pos = new Float32Array(n * 3);
    const phase = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos.set([(rng() - 0.5) * R * 2.4, 0, (rng() - 0.5) * R * 2.4], i * 3);
      phase[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    return g;
  }, [R, lowPower]);
  useEffect(() => () => weather.dispose(), [weather]);

  // Apply the world's settings to the uniforms.
  useEffect(() => {
    const u = skyMat.uniforms;
    if (world.sky) {
      u.uTop.value.set(world.sky.top);
      u.uHorizon.value.set(world.sky.horizon);
      u.uBottom.value.set(world.sky.bottom);
    }
    u.uSunOn.value = world.sun ? 1 : 0;
    if (world.sun) {
      u.uSunColor.value.set(world.sun.color);
      u.uSunSize.value = world.sun.size;
      u.uStriped.value = world.sun.striped ? 1 : 0;
      u.uSunDir.value.copy(sunDir(world.sun.elevation));
    }
    // Night-type worlds: a translucent sky lets the starfield show through.
    u.uOpacity.value = world.stars ? 0.82 : 1;
    if (world.weather) {
      const m = WEATHER_MOTION[world.weather.kind];
      weatherMat.uniforms.uColor.value.set(world.weather.color);
      weatherMat.uniforms.uKind.value = WEATHER_KIND[world.weather.kind];
      weatherMat.uniforms.uSpeed.value = m.speed;
      weatherMat.uniforms.uSway.value = m.sway;
      weatherMat.uniforms.uSize.value = m.size;
    }
    if (world.grid) gridMat.uniforms.uColor.value.set(world.grid);
  }, [world, skyMat, weatherMat, gridMat]);

  useEffect(() => {
    gridMat.uniforms.uInner.value = R * 0.55;
    gridMat.uniforms.uOuter.value = R * 9;
    weatherMat.uniforms.uTop.value = R * 0.9;
  }, [R, gridMat, weatherMat]);

  const time = useRef(0);
  useFrame((state, delta) => {
    if (!visible) return;
    if (!reducedMotion) time.current += delta;
    skyGroup.current?.position.copy(camera.position);
    skyMat.uniforms.uTime.value = time.current;
    auroraMat.uniforms.uTime.value = time.current;
    weatherMat.uniforms.uTime.value = time.current;
    weatherMat.uniforms.uPixelRatio.value = state.gl.getPixelRatio();
    gridMat.uniforms.uTime.value = time.current;
    gridMat.uniforms.uBeat.value = pulses.ground;
    earthMat.uniforms.uTime.value = time.current;
  });

  return (
    <group visible={visible}>
      <group ref={skyGroup} visible={!!world.sky}>
        <mesh material={skyMat} raycast={noRaycast} renderOrder={-2} frustumCulled={false}>
          <sphereGeometry args={[SKY_RADIUS, 48, 24]} />
        </mesh>
      </group>
      <group visible={world.aurora}>
        {[0, 1, 2].map((i) => (
          <mesh
            key={i}
            material={auroraMat}
            raycast={noRaycast}
            position={[(i - 1) * R * 1.1, -R * 0.55 + i * R * 0.25, -R * 4.2 - i * R * 0.8]}
            rotation={[0, (i - 1) * 0.35, 0]}
            frustumCulled={false}
          >
            <planeGeometry args={[R * 8, R * 2.2, 96, 1]} />
          </mesh>
        ))}
      </group>
      <points geometry={weather} material={weatherMat} raycast={noRaycast} visible={!!world.weather} frustumCulled={false} />
      <mesh material={gridMat} raycast={noRaycast} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.16, 0]} visible={!!world.grid} frustumCulled={false}>
        <planeGeometry args={[R * 20, R * 20]} />
      </mesh>
      <Billboard position={[-R * 2.6, -R * 0.75, -R * 4.6]} visible={world.earth}>
        <mesh material={earthMat} raycast={noRaycast} scale={R * 2.2}>
          <planeGeometry />
        </mesh>
      </Billboard>
    </group>
  );
}
