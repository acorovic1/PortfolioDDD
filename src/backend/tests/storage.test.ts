import { describe, it, expect, afterAll } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { persistUpload, deleteStoredFile, readStoredFile, storageDriver, contentTypeFor } from '../storage/storage.ts';
import { storageUsage } from '../repositories/storage-usage.repository.ts';
import { registerTestUser, deleteTestUsers } from './helpers.ts';

const createdUserIds: string[] = [];
afterAll(() => deleteTestUsers(createdUserIds));

describe('storage (local driver)', () => {
  it('serves local uploads from /uploads and deletes them, counting them towards the owner', async () => {
    expect(storageDriver()).toBe('local');
    const owner = await registerTestUser();
    createdUserIds.push(owner.id);
    const name = `${crypto.randomUUID()}.png`;
    await mkdir(path.join('uploads', 'renders'), { recursive: true });
    await writeFile(path.join('uploads', 'renders', name), 'png-bytes');

    const url = await persistUpload('renders', name, owner.id);
    expect(url).toBe(`/uploads/renders/${name}`);
    expect((await readStoredFile(url)).toString()).toBe('png-bytes');
    expect((await storageUsage(owner.id)).usedBytes).toBe('png-bytes'.length);

    await deleteStoredFile(url);
    expect(existsSync(path.join('uploads', 'renders', name))).toBe(false);
    expect((await storageUsage(owner.id)).usedBytes).toBe(0);
    // Already gone / empty: fine.
    await deleteStoredFile(url);
    await deleteStoredFile(null);
  });

  it('refuses paths that escape ./uploads and ignores foreign URLs', async () => {
    await expect(readStoredFile('/uploads/../package.json')).rejects.toThrow();
    await expect(deleteStoredFile('/uploads/../../package.json')).rejects.toThrow();
    expect(existsSync('package.json')).toBe(true);
    await deleteStoredFile('https://elsewhere.example.com/file.png');
  });

  it('sets content types by extension', () => {
    expect(contentTypeFor('a.glb')).toBe('model/gltf-binary');
    expect(contentTypeFor('a.webp')).toBe('image/webp');
    expect(contentTypeFor('a.bin')).toBe('application/octet-stream');
  });
});
