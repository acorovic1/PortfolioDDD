import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { chmod } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

const CONVERTER_TIMEOUT_MS = 10 * 60 * 1000;

export class ConverterUnavailableError extends Error {}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('Model conversion timed out'));
    }, CONVERTER_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        // Keep just the tail - converter logs can be very long.
        reject(new Error(`Converter exited with code ${code}: ${output.trim().split('\n').slice(-8).join('\n')}`));
      }
    });
  });
}

// --- FBX2glTF (shipped as prebuilt binaries in the fbx2gltf npm package) ---

function fbx2gltfBinary(): string | null {
  try {
    const require = createRequire(import.meta.url);
    const packageDir = path.dirname(require.resolve('fbx2gltf/package.json'));
    const binary = path.join(packageDir, 'bin', os.type(), os.type() === 'Windows_NT' ? 'FBX2glTF.exe' : 'FBX2glTF');
    return existsSync(binary) ? binary : null;
  } catch {
    return null;
  }
}

export async function convertWithFbx2gltf(input: string, output: string): Promise<void> {
  // Absolute paths: the converter runs with the model's folder as its cwd.
  const inputPath = path.resolve(input);
  const outputGlbPath = path.resolve(output);
  const binary = fbx2gltfBinary();
  if (!binary) throw new ConverterUnavailableError(`FBX2glTF has no binary for ${os.type()}`);

  // npm doesn't always preserve the executable bit.
  if (os.type() !== 'Windows_NT') await chmod(binary, 0o755).catch(() => {});

  // FBX2glTF appends the extension itself.
  const outputBase = outputGlbPath.replace(/\.glb$/i, '');
  await run(binary, ['--binary', '--input', inputPath, '--output', outputBase], path.dirname(inputPath));
  if (!existsSync(outputGlbPath)) throw new Error('FBX2glTF produced no output');
}

// --- Blender (optional; required for .blend and USD formats) ---

function findBlender(): string | null {
  if (process.env.BLENDER_PATH) {
    return existsSync(process.env.BLENDER_PATH) ? process.env.BLENDER_PATH : null;
  }

  const pathDirs = (process.env.PATH ?? '').split(path.delimiter);
  const names = os.type() === 'Windows_NT' ? ['blender.exe'] : ['blender'];
  for (const dir of pathDirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }

  const installRoots = os.type() === 'Windows_NT'
    ? ['C:\\Program Files\\Blender Foundation']
    : os.type() === 'Darwin' ? ['/Applications'] : [];
  for (const root of installRoots) {
    if (!existsSync(root)) continue;
    // Newest version first ("Blender 4.2" sorts after "Blender 3.6").
    for (const entry of readdirSync(root).sort().reverse()) {
      const candidate = os.type() === 'Darwin'
        ? path.join(root, entry, 'Contents', 'MacOS', 'Blender')
        : path.join(root, entry, 'blender.exe');
      if (/blender/i.test(entry) && existsSync(candidate)) return candidate;
    }
  }
  return null;
}

// Imports the source (by extension) into an empty scene - or opens it, for
// .blend - and exports a GLB. Falls back to the legacy importer operators on
// older Blender versions.
const BLENDER_SCRIPT = `
import bpy, os, sys
src, dst = sys.argv[sys.argv.index('--') + 1:][:2]
ext = os.path.splitext(src)[1].lower()

def first_working(*ops):
    error = None
    for op in ops:
        try:
            return op()
        except (AttributeError, RuntimeError, TypeError) as e:
            error = e
    raise error

if ext != '.blend':
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=src)
    elif ext == '.obj':
        first_working(lambda: bpy.ops.wm.obj_import(filepath=src), lambda: bpy.ops.import_scene.obj(filepath=src))
    elif ext == '.stl':
        first_working(lambda: bpy.ops.wm.stl_import(filepath=src), lambda: bpy.ops.import_mesh.stl(filepath=src))
    elif ext in ('.usd', '.usda', '.usdc', '.usdz'):
        bpy.ops.wm.usd_import(filepath=src)
    else:
        raise RuntimeError('Unsupported format: ' + ext)

if not any(obj.type == 'MESH' for obj in bpy.context.scene.objects):
    raise RuntimeError('The file contains no mesh objects')

bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True, export_lights=True)
`;

export function isBlenderAvailable(): boolean {
  return findBlender() !== null;
}

export async function convertWithBlender(input: string, output: string): Promise<void> {
  const inputPath = path.resolve(input);
  const outputGlbPath = path.resolve(output);
  const blender = findBlender();
  if (!blender) {
    throw new ConverterUnavailableError(
      'Converting this format requires Blender on the server (install it or set BLENDER_PATH)'
    );
  }

  const isBlend = path.extname(inputPath).toLowerCase() === '.blend';
  const args = [
    '--background',
    '--factory-startup',
    ...(isBlend ? [inputPath] : []),
    '--python-exit-code', '1',
    '--python-expr', BLENDER_SCRIPT,
    '--', inputPath, outputGlbPath,
  ];

  await run(blender, args, path.dirname(inputPath));
  if (!existsSync(outputGlbPath)) throw new Error('Blender produced no output');
}
