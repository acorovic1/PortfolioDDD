import { Document } from '@gltf-transform/core';

const MAX_TRIANGLES = 20_000_000;

export class StlError extends Error {}

function isBinaryStl(buffer: Buffer): boolean {
  if (buffer.length < 84) return false;
  const triangles = buffer.readUInt32LE(80);
  // Binary STL is exactly an 80-byte header + count + 50 bytes per triangle.
  // ("solid" at the start isn't reliable - some binary exporters write it.)
  return buffer.length === 84 + triangles * 50;
}

function parseBinary(buffer: Buffer): Float32Array<ArrayBuffer> {
  const triangles = buffer.readUInt32LE(80);
  if (triangles > MAX_TRIANGLES) throw new StlError('STL has too many triangles');

  const positions = new Float32Array(triangles * 9);
  for (let t = 0; t < triangles; t++) {
    const offset = 84 + t * 50 + 12; // skip the stored facet normal
    for (let v = 0; v < 9; v++) {
      positions[t * 9 + v] = buffer.readFloatLE(offset + v * 4);
    }
  }
  return positions;
}

function parseAscii(text: string): Float32Array<ArrayBuffer> {
  const values: number[] = [];
  const vertex = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = vertex.exec(text)) !== null) {
    values.push(Number(match[1]), Number(match[2]), Number(match[3]));
    if (values.length > MAX_TRIANGLES * 9) throw new StlError('STL has too many triangles');
  }
  if (values.length === 0 || values.length % 9 !== 0 || values.some(Number.isNaN)) {
    throw new StlError('The STL file is empty or malformed');
  }
  return new Float32Array(values);
}

// Facet normals recomputed from the winding (stored STL normals are often
// zeroed out or wrong).
function faceNormals(positions: Float32Array): Float32Array<ArrayBuffer> {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i + 3] - positions[i], ay = positions[i + 4] - positions[i + 1], az = positions[i + 5] - positions[i + 2];
    const bx = positions[i + 6] - positions[i], by = positions[i + 7] - positions[i + 1], bz = positions[i + 8] - positions[i + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length; ny /= length; nz /= length;
    for (let v = 0; v < 3; v++) {
      normals[i + v * 3] = nx;
      normals[i + v * 3 + 1] = ny;
      normals[i + v * 3 + 2] = nz;
    }
  }
  return normals;
}

export function stlToDocument(buffer: Buffer, name: string): Document {
  const positions = isBinaryStl(buffer) ? parseBinary(buffer) : parseAscii(buffer.toString('utf-8'));
  if (positions.length === 0) throw new StlError('The STL file contains no triangles');

  const document = new Document();
  const gltfBuffer = document.createBuffer();

  const position = document.createAccessor('POSITION').setType('VEC3').setArray(positions).setBuffer(gltfBuffer);
  const normal = document.createAccessor('NORMAL').setType('VEC3').setArray(faceNormals(positions)).setBuffer(gltfBuffer);

  const material = document.createMaterial(name)
    .setBaseColorFactor([0.8, 0.8, 0.8, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.6);

  const primitive = document.createPrimitive()
    .setAttribute('POSITION', position)
    .setAttribute('NORMAL', normal)
    .setMaterial(material);

  const mesh = document.createMesh(name).addPrimitive(primitive);

  // STL is conventionally Z-up (3D printing/CAD); glTF is Y-up.
  const node = document.createNode(name)
    .setMesh(mesh)
    .setRotation([-Math.SQRT1_2, 0, 0, Math.SQRT1_2]);

  document.createScene(name).addChild(node);
  return document;
}
