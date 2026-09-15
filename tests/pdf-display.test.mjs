import test from 'node:test';import assert from 'node:assert/strict';import {pdfDisplay} from '../lib/pdf-display.js';
test('Retina preview retains CSS width and renders three times more pixels per axis',()=>{const r=pdfDisplay(595,842,351,1,3);assert.equal(r.width,351);assert.equal(r.pixelWidth,1053);assert.equal(r.ratio,3);});
test('zoom rerenders at larger size without forcing a narrow phone to overflow at fit width',()=>{const fit=pdfDisplay(595,842,296,1,3),zoom=pdfDisplay(595,842,296,2,3);assert.equal(fit.width,296);assert.equal(zoom.width,592);assert.equal(zoom.pixelWidth,1776);});
test('large PDF previews cap canvas memory and dimension',()=>{const r=pdfDisplay(595,842,1300,3,3);assert.ok(r.pixelWidth*r.pixelHeight<8010000);assert.ok(r.pixelHeight<=4097);});
