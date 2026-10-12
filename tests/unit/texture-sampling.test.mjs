import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleMaterial } from '../../src/surface.js';
import { linearToSrgb } from '../../src/paint-core.js';
const red=[1,0,0],green=[0,1,0],blue=[0,0,1],white=[1,1,1];
function texture(colors,{width=colors.length,height=1,nearest=true,wrapS=1001,wrapT=1001,flipY=false}={}) {
  return {linear:[1,1,1],texture:{width,height,nearest,wrapS,wrapT,flipY,srgb:true,matrix:[1,0,0,0,1,0,0,0,1],data:Uint8ClampedArray.from(colors.flatMap(c=>[...c.map(v=>v*255),255]))}};
}
const sample=(m,u,v=.5)=>sampleMaterial({uv:[u,v],linear:[1,1,1]},m);
function close(actual,expected) { actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-8,`${actual} != ${expected}`)); }
test('nearest sampling uses floor(u*width), not rounded endpoint coordinates',()=>{
  const m=texture([red,green,blue,white]);
  close(sample(m,.2),red);close(sample(m,.25),green);close(sample(m,.7),blue);close(sample(m,.8),white);
});
test('nearest clamp includes both texture endpoints',()=>{
  const m=texture([red,blue]);close(sample(m,-.1),red);close(sample(m,0),red);close(sample(m,1),blue);close(sample(m,1.2),blue);
});
test('linear sampling addresses half-texel centers and interpolates in linear RGB',()=>{
  const m=texture([red,blue],{nearest:false});close(sample(m,.25),red);close(sample(m,.75),blue);
  close(sample(m,.5),[linearToSrgb(.5),0,linearToSrgb(.5)]);close(sample(m,0),red);close(sample(m,1),blue);
});
test('linear repeat interpolates across the last/first texel seam',()=>{
  const m=texture([red,blue],{nearest:false,wrapS:1000}),mid=[linearToSrgb(.5),0,linearToSrgb(.5)];
  close(sample(m,0),mid);close(sample(m,1),mid);close(sample(m,-.25),blue);close(sample(m,1.25),red);
});
test('mirrored repeat reflects texel taps rather than wrapping to the opposite end',()=>{
  const m=texture([red,blue],{nearest:false,wrapS:1002});close(sample(m,0),red);close(sample(m,1),blue);close(sample(m,-.25),red);close(sample(m,1.25),blue);
});
test('texture transform and flipped two-dimensional coordinates are sampled at texel centers',()=>{
  const m=texture([red,green,blue,white],{width:2,height:2,flipY:true});
  close(sample(m,.25,.25),blue);m.texture.matrix[6]=.5;close(sample(m,.25,.25),white);
});
test('one-pixel images stay constant with every wrap/filter combination',()=>{
  for(const wrapS of [1000,1001,1002]) for(const nearest of [true,false]) {
    const m=texture([green],{wrapS,wrapT:wrapS,nearest});close(sample(m,-1.3,2.7),green);
  }
});
