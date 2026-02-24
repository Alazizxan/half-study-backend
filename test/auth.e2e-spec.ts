import request from 'supertest';
import { cleanDatabase, createApp } from './setup';

describe('Auth Flow', () => {
  let app;
  let server;
  let agent;

  beforeAll(async () => {
    app = await createApp();
    server = app.getHttpServer();
    agent = request.agent(server); // 🔥 agent ishlatamiz
  });

  beforeEach(async () => {
    await cleanDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('register + login works', async () => {
    const email = `user-${Date.now()}@test.com`;
    const password = 'password123';

    // REGISTER
    await agent
      .post('/api/v1/auth/register')
      .send({
        email,
        username: 'tester',
        password,
        displayName: 'Tester User',
      })
      .expect(201);

    // LOGIN
    await agent
      .post('/api/v1/auth/login')
      .send({
        email,
        password,
      })
      .expect(201);

    // 🔥 Endi cookie avtomatik yuboriladi
    const protectedReq = await agent
      .get('/api/v1/users/me');

    expect(protectedReq.status).toBe(200);
  });
});