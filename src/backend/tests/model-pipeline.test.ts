import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import AdmZip from 'adm-zip';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';
import { waitForModelJobs } from '../pipeline/processor.ts';
import { stlToDocument } from '../pipeline/convert-stl.ts';
import { parseMtl } from '../pipeline/convert-obj.ts';
import { extractZip } from '../pipeline/archive.ts';
import { pickPrimaryModel } from '../pipeline/formats.ts';

const createdUserIds: string[] = [];
const fixtures = path.join(process.cwd(), 'e2e', 'fixtures');
const blueTriangle = readFileSync(path.join(fixtures, 'blue-triangle.gltf'));
const redTriangle = readFileSync(path.join(fixtures, 'red-triangle.gltf'));

const asciiStl = `solid test
facet normal 0 0 1
  outer loop
    vertex 0 0 0
    vertex 1 0 0
    vertex 0 1 0
  endloop
endfacet
endsolid test`;

const simpleObj = `mtllib cube.mtl
v 0 0 0
v 1 0 0
v 1 1 0
v 0 1 0
usemtl Orange
f 1 2 3
f 1 3 4
`;
const simpleMtl = `newmtl Orange
Kd 1 0.5 0
Ns 50
`;

function uploadPath(publicUrl: string): string {
  return path.join('uploads', publicUrl.replace(/^\/uploads\//, ''));
}

afterAll(async () => {
  await waitForModelJobs();
  await deleteTestUsers(createdUserIds);
});

describe('model pipeline units', () => {
  it('converts ASCII STL to a Y-up glTF document with recomputed normals', () => {
    const document = stlToDocument(Buffer.from(asciiStl), 'test');
    const node = document.getRoot().listNodes()[0];
    const primitive = node.getMesh()!.listPrimitives()[0];

    expect(primitive.getAttribute('POSITION')!.getCount()).toBe(3);
    expect(Array.from(primitive.getAttribute('NORMAL')!.getElement(0, []))).toEqual([0, 0, 1]);
    expect(node.getRotation()[0]).toBeCloseTo(-Math.SQRT1_2);
  });

  it('converts binary STL', () => {
    const buffer = Buffer.alloc(84 + 50);
    buffer.writeUInt32LE(1, 80);
    [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => buffer.writeFloatLE(v, 84 + 12 + i * 4));

    const document = stlToDocument(buffer, 'binary');
    const primitive = document.getRoot().listMeshes()[0].listPrimitives()[0];
    expect(primitive.getAttribute('POSITION')!.getCount()).toBe(3);
  });

  it('rejects an empty STL', () => {
    expect(() => stlToDocument(Buffer.from('solid empty\nendsolid empty'), 'x')).toThrow();
  });

  it('parses MTL colors and texture paths, skipping map options', () => {
    const materials = parseMtl('newmtl Skin\nKd 0.5 0.4 0.3\nd 0.5\nmap_Kd -s 1 1 1 -o 0 0 textures/skin diffuse.png\nmap_Bump -bm 0.8 skin_n.png\n');
    const skin = materials.get('Skin')!;
    expect(skin.diffuse).toEqual([0.5, 0.4, 0.3]);
    expect(skin.opacity).toBe(0.5);
    expect(skin.diffuseMap).toBe('textures/skin diffuse.png');
    expect(skin.normalMap).toBe('skin_n.png');
  });

  it('picks the most native model file from a bundle', () => {
    expect(pickPrimaryModel(['readme.txt', 'export/model.obj', 'model.fbx', 'tex/a.png'])).toBe('model.fbx');
    expect(pickPrimaryModel(['scene.gltf', 'scene.bin', 'backup/scene.obj'])).toBe('scene.gltf');
    expect(pickPrimaryModel(['notes.txt'])).toBeNull();
  });

  it('refuses zip entries that escape the extraction folder', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'zipslip-'));
    try {
      const zip = new AdmZip();
      zip.addFile('model.stl', Buffer.from(asciiStl));
      // adm-zip normalizes names passed to addFile, so forge the raw entry name.
      const evil = zip.getEntries()[0];
      evil.entryName = '../../escaped.stl';
      const zipPath = path.join(dir, 'evil.zip');
      await writeFile(zipPath, zip.toBuffer());

      await expect(extractZip(zipPath, path.join(dir, 'out'))).rejects.toThrow(/invalid file path/);
      expect(existsSync(path.join(dir, '..', 'escaped.stl'))).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('model upload processing', () => {
  let owner: Awaited<ReturnType<typeof registerTestUser>>;
  let stranger: Awaited<ReturnType<typeof registerTestUser>>;

  beforeAll(async () => {
    owner = await registerTestUser();
    stranger = await registerTestUser();
    createdUserIds.push(owner.id, stranger.id);
  });

  const status = (id: string, token = owner.token) =>
    request(app).get(`/api/portfolio/artworks/${id}/status`).set('Authorization', `Bearer ${token}`);

  it('accepts an upload immediately, then converts it to an optimized GLB in the background', async () => {
    const created = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .field('title', 'Triangle')
      .attach('model', blueTriangle, 'triangle.gltf');

    expect(created.status).toBe(201);
    expect(created.body.processingStatus).toBe('processing');
    expect(created.body.modelUrl).toBe('');

    await waitForModelJobs();
    const res = await status(created.body.id);
    expect(res.body.processingStatus).toBe('ready');
    expect(res.body.modelUrl).toMatch(/^\/uploads\/models\/.+\.glb$/);
    expect(res.body.sourceFormat).toBe('gltf');
    expect(res.body.modelVersion).toBe(1);
    expect(res.body.modelSizeBytes).toBeGreaterThan(0);

    const glb = readFileSync(uploadPath(res.body.modelUrl));
    expect(glb.subarray(0, 4).toString()).toBe('glTF');
  });

  it('converts STL and zipped OBJ+MTL uploads', async () => {
    const stl = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('model', Buffer.from(asciiStl), 'part.stl');

    const zip = new AdmZip();
    zip.addFile('cube/cube.obj', Buffer.from(simpleObj));
    zip.addFile('cube/cube.mtl', Buffer.from(simpleMtl));
    const obj = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('model', zip.toBuffer(), 'cube.zip');

    await waitForModelJobs();

    const stlStatus = await status(stl.body.id);
    expect(stlStatus.body.processingStatus).toBe('ready');
    expect(stlStatus.body.sourceFormat).toBe('stl');

    const objStatus = await status(obj.body.id);
    expect(objStatus.body.processingStatus).toBe('ready');
    // The resolved format of the model inside the bundle, not "zip".
    expect(objStatus.body.sourceFormat).toBe('obj');
  });

  it('marks unreadable models as failed and keeps them out of the public portfolio', async () => {
    const created = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .field('title', 'Broken')
      .attach('model', Buffer.from('glTF\x02\x00\x00\x00'), 'broken.glb');

    await waitForModelJobs();
    const res = await status(created.body.id);
    expect(res.body.processingStatus).toBe('failed');
    expect(res.body.processingError).toBeTruthy();
    expect(res.body.modelUrl).toBe('');

    const publicPortfolio = await request(app).get(`/api/users/${owner.username}/portfolio?all=true`);
    const ids = publicPortfolio.body.artworks.map((a: { id: string }) => a.id);
    expect(ids).not.toContain(created.body.id);

    const own = await request(app).get('/api/portfolio').set('Authorization', `Bearer ${owner.token}`);
    expect(own.body.map((a: { id: string }) => a.id)).toContain(created.body.id);

    // Deleting an artwork that never got a model must still work.
    const del = await request(app)
      .delete(`/api/portfolio/artworks/${created.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(del.status).toBe(200);
  });

  it('replaces the model with a new version, keeping likes and dropping the old file', async () => {
    const created = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .field('title', 'Versioned')
      .attach('model', blueTriangle, 'v1.gltf');
    await waitForModelJobs();
    const v1 = await status(created.body.id);

    await request(app)
      .post(`/api/portfolio/artworks/${created.body.id}/like`)
      .set('Authorization', `Bearer ${stranger.token}`);

    const replaced = await request(app)
      .put(`/api/portfolio/artworks/${created.body.id}/model`)
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('model', redTriangle, 'v2.gltf');
    expect(replaced.status).toBe(202);
    expect(replaced.body.processingStatus).toBe('processing');
    // The current version keeps being served while the new one processes.
    expect(replaced.body.modelUrl).toBe(v1.body.modelUrl);

    await waitForModelJobs();
    const v2 = await status(created.body.id);
    expect(v2.body.processingStatus).toBe('ready');
    expect(v2.body.modelVersion).toBe(2);
    expect(v2.body.modelUrl).not.toBe(v1.body.modelUrl);
    expect(v2.body.likeCount).toBe(1);
    expect(existsSync(uploadPath(v1.body.modelUrl))).toBe(false);
    expect(existsSync(uploadPath(v2.body.modelUrl))).toBe(true);
  });

  it('keeps the live version when a new version fails to process', async () => {
    const created = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('model', blueTriangle, 'good.gltf');
    await waitForModelJobs();
    const good = await status(created.body.id);

    await request(app)
      .put(`/api/portfolio/artworks/${created.body.id}/model`)
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('model', Buffer.from('not really a model'), 'bad.stl');
    await waitForModelJobs();

    const after = await status(created.body.id);
    expect(after.body.processingStatus).toBe('failed');
    expect(after.body.modelUrl).toBe(good.body.modelUrl);
    expect(after.body.modelVersion).toBe(1);
  });

  it('only lets the owner replace models, check status or set thumbnails', async () => {
    const created = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('model', blueTriangle, 'mine.gltf');
    await waitForModelJobs();

    expect((await status(created.body.id, stranger.token)).status).toBe(404);

    const replace = await request(app)
      .put(`/api/portfolio/artworks/${created.body.id}/model`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .attach('model', redTriangle, 'theirs.gltf');
    expect(replace.status).toBe(404);

    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const strangerThumb = await request(app)
      .post(`/api/portfolio/artworks/${created.body.id}/thumbnail`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .attach('image', png, 'thumb.png');
    expect(strangerThumb.status).toBe(404);

    const thumb = await request(app)
      .post(`/api/portfolio/artworks/${created.body.id}/thumbnail`)
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('image', png, 'thumb.png');
    expect(thumb.status).toBe(200);
    expect(thumb.body.thumbnailUrl).toMatch(/^\/uploads\/thumbnails\//);
    expect((await status(created.body.id)).body.thumbnailUrl).toBe(thumb.body.thumbnailUrl);
  });

  it('rejects unsupported upload formats', async () => {
    const res = await request(app)
      .post('/api/portfolio/artworks')
      .set('Authorization', `Bearer ${owner.token}`)
      .attach('model', Buffer.from('hello'), 'model.max');
    expect(res.status).toBe(400);
  });
});
