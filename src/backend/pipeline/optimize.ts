import { NodeIO, Logger, type Document, type Transform } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, weld, meshopt, draco, textureCompress } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

export type GeometryCompression = 'meshopt' | 'draco' | 'none';

// Meshopt by default: smaller decoder and faster decode than Draco, and it
// also compresses animation and morph data. MODEL_COMPRESSION overrides it.
export function geometryCompression(): GeometryCompression {
  const value = process.env.MODEL_COMPRESSION?.toLowerCase();
  return value === 'draco' || value === 'none' ? value : 'meshopt';
}

const MAX_TEXTURE_SIZE = Number(process.env.MODEL_MAX_TEXTURE_SIZE) || 4096;

let ioPromise: Promise<NodeIO> | null = null;

// One NodeIO for the process: the Draco/Meshopt WASM modules are expensive to
// instantiate. Decoders are registered too, so already-compressed uploads
// can be read.
export function getIO(): Promise<NodeIO> {
  if (!ioPromise) {
    ioPromise = (async () => {
      await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
      return new NodeIO()
        .registerExtensions(ALL_EXTENSIONS)
        .registerDependencies({
          'draco3d.decoder': await draco3d.createDecoderModule(),
          'draco3d.encoder': await draco3d.createEncoderModule(),
          'meshopt.decoder': MeshoptDecoder,
          'meshopt.encoder': MeshoptEncoder,
        });
    })();
  }
  return ioPromise;
}

// Cleans up and compresses a document in place: dedupes/prunes unused data,
// welds vertices, resamples animation, re-encodes textures as WebP (capped at
// MAX_TEXTURE_SIZE) and applies geometry compression.
export async function optimizeDocument(document: Document): Promise<void> {
  // gltf-transform narrates every step at info level; keep server logs quiet.
  document.setLogger(new Logger(Logger.Verbosity.ERROR));

  const transforms: Transform[] = [
    dedup(),
    prune(),
    resample(),
    weld(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [MAX_TEXTURE_SIZE, MAX_TEXTURE_SIZE],
    }),
  ];

  const compression = geometryCompression();
  if (compression === 'meshopt') {
    transforms.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  } else if (compression === 'draco') {
    transforms.push(draco());
  }

  await document.transform(...transforms);
}

export async function writeGlb(document: Document): Promise<Uint8Array> {
  const io = await getIO();
  return io.writeBinary(document);
}
