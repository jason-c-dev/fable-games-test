// Post-processing: one fullscreen filter doing per-world color grade
// (tint multiply + lift + saturation), vignette, and a flash tint used by
// hurt/parry moments. Falls back to no filter if shader compile fails.

import { Filter, GlProgram } from 'pixi.js';
import { WORLD_GRADE } from '../config.js';

const vertex = /* glsl */`
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition( void )
{
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord( void )
{
    return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void)
{
    gl_Position = filterVertexPosition();
    vTextureCoord = filterTextureCoord();
}
`;

const fragment = /* glsl */`
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uTint;
uniform vec3 uLift;
uniform float uSat;
uniform float uVig;
uniform vec3 uFlash;
uniform float uFlashAmt;

void main(void)
{
    vec4 c = texture(uTexture, vTextureCoord);
    vec3 col = c.rgb;
    // grade
    col *= uTint;
    col += uLift;
    float l = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(l), col, uSat);
    // vignette
    vec2 uv = vTextureCoord - 0.5;
    float v = 1.0 - dot(uv, uv) * uVig;
    col *= clamp(v, 0.0, 1.0);
    // flash
    col = mix(col, uFlash, uFlashAmt);
    finalColor = vec4(col, c.a);
}
`;

export function makeGradeFilter() {
  try {
    const filter = new Filter({
      glProgram: GlProgram.from({ vertex, fragment }),
      resources: {
        gradeUniforms: {
          uTint: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
          uLift: { value: new Float32Array([0, 0, 0]), type: 'vec3<f32>' },
          uSat: { value: 1, type: 'f32' },
          uVig: { value: 0.55, type: 'f32' },
          uFlash: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
          uFlashAmt: { value: 0, type: 'f32' },
        },
      },
    });
    return filter;
  } catch (err) {
    console.warn('grade filter unavailable:', err);
    return null;
  }
}

export class PostFX {
  constructor() {
    this.filter = makeGradeFilter();
    this.flashAmt = 0;
    this.flashCol = [1, 1, 1];
    this.reducedFlash = false;
  }
  get filters() { return this.filter ? [this.filter] : null; }

  setWorld(worldIdx) {
    if (!this.filter) return;
    const g = WORLD_GRADE[worldIdx] || WORLD_GRADE[0];
    const u = this.filter.resources.gradeUniforms.uniforms;
    u.uTint[0] = g.tint[0]; u.uTint[1] = g.tint[1]; u.uTint[2] = g.tint[2];
    u.uLift[0] = g.lift[0]; u.uLift[1] = g.lift[1]; u.uLift[2] = g.lift[2];
    u.uSat = g.sat;
  }

  flash(col, amt) {
    const cap = this.reducedFlash ? 0.25 : 1;
    this.flashCol = col;
    this.flashAmt = Math.max(this.flashAmt, amt * cap);
  }

  update(dt) {
    if (!this.filter) return;
    const u = this.filter.resources.gradeUniforms.uniforms;
    this.flashAmt = Math.max(0, this.flashAmt - 0.06 * dt);
    u.uFlash[0] = this.flashCol[0]; u.uFlash[1] = this.flashCol[1]; u.uFlash[2] = this.flashCol[2];
    u.uFlashAmt = this.flashAmt;
  }
}
