// Biome look tables: sky/fog, lights, deck vertex colours, prop palettes.
// The renderer lerps between entries at biome borders.

import * as THREE from 'three';

export const BIOME_LOOK = {
  meadow: {
    ground: 0x69a04e,
    sky: 0x8fc8e8, fogColor: 0x9ecf8f, fogNear: 30, fogFar: 95,
    hemiSky: 0xd8f0c0, hemiGround: 0x3c5a30, hemiI: 1.05,
    sunColor: 0xfff3cf, sunI: 1.6, sunPos: [5, 9, -4],
    deck: [0x5d8f46, 0x4a7a38], deckEdge: 0x3c6030, divider: 0x8fd06a,
    props: { trunk: 0x6b4a30, leaf: 0x4d8a3a, accent: 0xe8c95c, crystal: 0xbde07a },
  },
  cavern: {
    ground: 0x131828,
    sky: 0x070a12, fogColor: 0x0b1020, fogNear: 6, fogFar: 34,
    hemiSky: 0x2a3a55, hemiGround: 0x0a0d18, hemiI: 0.5,
    sunColor: 0x9fb8ff, sunI: 0.35, sunPos: [-3, 10, -2],
    deck: [0x3a4258, 0x2e3548], deckEdge: 0x1e2436, divider: 0x5fd8c8,
    props: { trunk: 0x4a5a78, leaf: 0x33445e, accent: 0x66e0ff, crystal: 0x7fd8ff },
  },
  cloudline: {
    ground: 0xbcd4ec, groundDrop: -26,      // the Spans hang over cloud-void
    sky: 0xcfe4f8, fogColor: 0xdceaf8, fogNear: 34, fogFar: 120,
    hemiSky: 0xffffff, hemiGround: 0x93a8c0, hemiI: 1.15,
    sunColor: 0xfff8e0, sunI: 1.8, sunPos: [-6, 8, -3],
    deck: [0xb9a988, 0xa08e6e], deckEdge: 0x7d6c50, divider: 0xffe9a8,
    props: { trunk: 0xcaba98, leaf: 0xf0f4fa, accent: 0x8fc8e8, crystal: 0xfff2c0 },
  },
  wastes: {
    ground: 0x2e2030,
    sky: 0x2a1e30, fogColor: 0x3a2438, fogNear: 18, fogFar: 70,
    hemiSky: 0x8a5a78, hemiGround: 0x1c1018, hemiI: 0.75,
    sunColor: 0xff9a66, sunI: 0.8, sunPos: [7, 6, -5],
    deck: [0x5e4a52, 0x4c3a44], deckEdge: 0x33232c, divider: 0xd873a0,
    props: { trunk: 0x3c2a34, leaf: 0x6e3a52, accent: 0xff5a4a, crystal: 0xc84a8a },
  },
};

export function lookAt(biome) { return BIOME_LOOK[biome] || BIOME_LOOK.meadow; }

export const c = (hex) => new THREE.Color(hex);
