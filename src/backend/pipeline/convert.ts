import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Document } from '@gltf-transform/core';
import { extractZip, listFiles, ArchiveError } from './archive.ts';
import { formatOf, pickPrimaryModel, BLENDER_FORMATS, type ModelFormat } from './formats.ts';
import { stlToDocument } from './convert-stl.ts';
import { objToDocument } from './convert-obj.ts';
import { convertWithFbx2gltf, convertWithBlender, ConverterUnavailableError } from './convert-external.ts';
import { getIO } from './optimize.ts';

// Errors whose message is safe and useful to show the uploader as-is.
export class ConversionError extends Error {}

export type LoadedModel = {
  document: Document;
  format: ModelFormat;
};

async function readGltf(filePath: string): Promise<Document> {
  const io = await getIO();
  try {
    return await io.read(filePath);
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      throw new ConversionError(
        'This .gltf references files that weren\'t uploaded - upload a .zip with the .gltf and its .bin/texture files'
      );
    }
    throw new ConversionError(`Couldn't read the glTF file: ${(error as Error).message}`);
  }
}

async function viaExternal(
  modelPath: string,
  workDir: string,
  converters: ((input: string, output: string) => Promise<void>)[]
): Promise<Document> {
  const output = path.join(workDir, 'converted.glb');
  let conversionError: Error | null = null;
  let unavailableError: Error | null = null;

  for (const convert of converters) {
    try {
      await convert(modelPath, output);
      return await readGltf(output);
    } catch (error) {
      if (error instanceof ConverterUnavailableError) unavailableError ??= error;
      else conversionError ??= error as Error;
    }
  }

  // A converter that ran and failed explains more than one that's missing.
  if (conversionError) throw new ConversionError(`Conversion failed: ${conversionError.message}`);
  throw new ConversionError(unavailableError?.message ?? 'No converter available for this format');
}

// Turns an uploaded file (any supported format, or a .zip bundle) into a glTF
// document. `workDir` is a scratch directory owned by the caller.
export async function loadUploadedModel(sourcePath: string, originalName: string, workDir: string): Promise<LoadedModel> {
  let modelPath = sourcePath;
  let rootDir = path.dirname(sourcePath);
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
      return { document: await readGltf(modelPath), format };

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

    case 'fbx':
      // FBX2glTF first (no external install needed); Blender as a fallback.
      return { document: await viaExternal(modelPath, workDir, [convertWithFbx2gltf, convertWithBlender]), format };

    default:
      if (BLENDER_FORMATS.has(format)) {
        return { document: await viaExternal(modelPath, workDir, [convertWithBlender]), format };
      }
      throw new ConversionError('Unsupported model format');
  }
}
