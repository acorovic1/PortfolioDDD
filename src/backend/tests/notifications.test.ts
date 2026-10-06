import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../app.ts';
import { registerTestUser, deleteTestUsers, createProcessedArtwork } from './helpers.ts';

const createdUserIds: string[] = [];

afterAll(async () => {
  await deleteTestUsers(createdUserIds);
});

describe('notifications', () => {
  let owner: Awaited<ReturnType<typeof registerTestUser>>;
  let actor: Awaited<ReturnType<typeof registerTestUser>>;
  let artworkId: string;

  beforeAll(async () => {
    owner = await registerTestUser();
    actor = await registerTestUser();
    createdUserIds.push(owner.id, actor.id);

    artworkId = await createProcessedArtwork(owner.token, { title: 'Notify Piece' });
  });

  it('notifies the owner when someone else likes their artwork, but not on self-like', async () => {
    await request(app)
      .post(`/api/portfolio/artworks/${artworkId}/like`)
      .set('Authorization', `Bearer ${owner.token}`); // self-like: no notification

    await request(app)
      .post(`/api/portfolio/artworks/${artworkId}/like`)
      .set('Authorization', `Bearer ${actor.token}`); // real like: notification

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${owner.token}`);

    expect(res.status).toBe(200);
    expect(res.body.notifications).toHaveLength(1);
    expect(res.body.notifications[0]).toMatchObject({ type: 'like', artworkId, isRead: false });
    expect(res.body.unreadCount).toBe(1);
  });

  it('notifies the owner on a comment and supports marking read', async () => {
    await request(app)
      .post(`/api/portfolio/artworks/${artworkId}/comments`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ text: 'Great work!' });

    const listRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${owner.token}`);

    const commentNotification = listRes.body.notifications.find((n: { type: string }) => n.type === 'comment');
    expect(commentNotification).toBeDefined();

    const markRes = await request(app)
      .post(`/api/notifications/${commentNotification.id}/read`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(markRes.status).toBe(200);

    const afterMark = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${owner.token}`);
    const updated = afterMark.body.notifications.find((n: { id: string }) => n.id === commentNotification.id);
    expect(updated.isRead).toBe(true);

    const markAllRes = await request(app)
      .post('/api/notifications/read-all')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(markAllRes.status).toBe(200);

    const finalRes = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(finalRes.body.unreadCount).toBe(0);
  });
});
