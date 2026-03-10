import request from 'supertest';
import { createApp, cleanDatabase } from './setup';

describe('Wallet Transfer', () => {
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

  it('prevent negative balance', async () => {
    const email = `wallet-${Date.now()}@test.com`;

    await request(server).post('/api/v1/auth/register').send({
      email,
      username: 'walletUser',
      password: 'password123',
    });

    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'password123' });

    const cookie = login.headers['set-cookie'];

    const res = await request(server)
      .post('/api/v1/wallet/transfer')
      .set('Cookie', cookie)
      .send({
        toUserId: 'fake-id',
        amount: 999999,
      });

    expect(res.status).toBe(403);
  });
});
