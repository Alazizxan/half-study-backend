import request from 'supertest';
import { createApp, cleanDatabase } from './setup';

describe('Lesson Completion', () => {
  let app;
  let server;
  let agent;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
    agent = request.agent(server);
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('reject if lesson not exists', async () => {
    const email = `progress-${Date.now()}@test.com`;

    await request(server).post('/api/v1/auth/register').send({
      email,
      username: 'progressUser',
      password: 'password123',
    });

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });

    const cookie = login.headers['set-cookie'];

    const res = await request(server)
      .post('/api/v1/progress/lesson/fake-id/complete')
      .set('Cookie', cookie);

    expect(res.status).toBe(404);
  });
});
