#!/usr/bin/env node
// Copies the ONNX Runtime WebAssembly files Whisper needs into public/ort/, so the app serves
// them itself (no third-party CDN, works offline once cached). Runs before dev and build.
// Only the single-threaded SIMD build is used; the larger JSEP/JSPI builds are for WebGPU.
import { copyFileSync, mkdirSync } from 'node:fs';

const src = 'node_modules/onnxruntime-web/dist';
mkdirSync('public/ort', { recursive: true });
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) copyFileSync(`${src}/${f}`, `public/ort/${f}`);
console.log('copied ONNX Runtime files to public/ort/');
