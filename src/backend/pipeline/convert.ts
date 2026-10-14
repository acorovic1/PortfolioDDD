import path from 'node:path';
import { mkdir, open, readFile } from 'node:fs/promises';
import type { Document } from '@gltf-transform/core';
import { extractZip, listFiles, isInside, ArchiveError } from './archive.ts';
import { formatOf, pickPrimaryModel, type ModelFormat } from './formats.ts';
import { stlToDocument } from './convert-stl.ts';
import { objToDocument } from './convert-obj.ts';
import { getIO } from './optimize.ts';

// Errors whose message is safe and useful to show the uploader as-is.
export class ConversionError extends Error {}

export type LoadedModel = {
  document: Document;
  format: ModelFormat;
};

// A glTF's JSON - from a .gltf, or from the first chunk of a .glb.
async function gltfJson(filePath: string): Promise<{ buffers?: { uri?: string }[]; images?: { uri?: string }[] }> {
  if (path.extname(filePath).toLowerCase() === '.gltf') return JSON.parse(await readFile(filePath, 'utf-8'));

  const file = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(20);
    await file.read(header, 0, 20, 0);
    const jsonLength = header.readUInt32LE(12);
    if (header.toString('latin1', 0, 4) !== 'glTF' || header.readUInt32LE(16) !== 0x4e4f534a || jsonLength > 64 * 1024 * 1024) {
      throw new Error('not a GLB');
    }
    const json = Buffer.alloc(jsonLength);
    await file.read(json, 0, jsonLength, 20);
    return JSON.parse(json.toString('utf-8'));
  } finally {
    await file.close();
  }
}

// A glTF names its .bin and texture files by URI, and the reader opens
// whatever they point to - so they must stay inside the upload (`rootDir`),
// or a crafted file could pull server files (secrets, other uploads) into
// the published model.
async function checkGltfReferences(filePath: string, rootDir: string): Promise<void> {
  let json: Awaited<ReturnType<typeof gltfJson>>;
  try {
    json = await gltfJson(filePath);
  } catch {
    throw new ConversionError("Couldn't read the glTF file");
  }

  const uris = [...(json.buffers ?? []), ...(json.images ?? [])]
    .map(item => item.uri)
    .filter((uri): uri is string => typeof uri === 'string' && !uri.startsWith('data:'));
  for (const uri of uris) {
    let relative: string;
    try {
      relative = decodeURIComponent(uri);
    } catch {
      relative = uri;
    }
    const isLocalRelative = !/^[a-z][a-z0-9+.-]*:/i.test(relative) && !path.isAbsolute(relative) && !relative.startsWith('/');
    if (!isLocalRelative || !isInside(rootDir, path.resolve(path.dirname(filePath), relative))) {
      throw new ConversionError(
        "This glTF references files that weren't uploaded - upload a .zip with the .gltf and its .bin/texture files"
      );
    }
  }
}

async function readGltf(filePath: string, rootDir: string): Promise<Document> {
  await checkGltfReferences(filePath, rootDir);
  const io = await getIO();
  try {
    return await io.read(filePath);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      throw new ConversionError(
        "This .gltf references files that weren't uploaded - upload a .zip with the .gltf and its .bin/texture files"
      );
    }
    throw new ConversionError(`Couldn't read the glTF file: ${(error as Error).message}`);
  }
}

// Turns an uploaded file (any supported format, or a .zip bundle) into a glTF
// document. `workDir` is a scratch directory owned by the caller.
export async function loadUploadedModel(sourcePath: string, originalName: string, workDir: string): Promise<LoadedModel> {
  let modelPath = sourcePath;
  // The folder a model may read side files (.bin, .mtl, textures) from. A
  // single uploaded file has none, so it gets an empty one of its own - not
  // the shared uploads folder it sits in.
  let rootDir = path.join(workDir, 'single');
  await mkdir(rootDir, { recursive: true });
  let format = formatOf(originalName);

  if (path.extname(originalName).toLowerCase() === '.zip') {
    rootDir = path.join(workDir, 'extracted');
    try {
      await extractZip(sourcePath, rootDir);
    } catch (error) {
      throw new ConversionError(error instanceof ArchiveError ? error.message : 'The .zip could not be extracted');
    }
    const primary = pickPrimaryModel(await listFiles(rootDir));
    if (!primary) throw new ConversionError('The .zip contains no supported model file');
    modelPath = path.join(rootDir, primary);
    format = formatOf(primary);
  }

  if (!format) throw new ConversionError('Unsupported model format');

  switch (format) {
    case 'glb':
    case 'gltf':
      return { document: await readGltf(modelPath, rootDir), format };

    case 'stl':
      try {
        return { document: stlToDocument(await readFile(modelPath), path.basename(modelPath, '.stl')), format };
      } catch (error) {
        throw new ConversionError((error as Error).message);
      }

    case 'obj':
      try {
        return { document: await objToDocument(modelPath, rootDir), format };
      } catch (error) {
        throw new ConversionError(`Couldn't convert the OBJ file: ${(error as Error).message}`);
      }

    default:
      throw new ConversionError('Unsupported model format');
  }
}
