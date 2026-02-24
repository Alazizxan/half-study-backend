import request from 'supertest';
import { createApp, cleanDatabase } from './setup';

describe('Submission', () => {
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

  it('unauthorized without cookie', async () => {
    const res = await request(server)
      .post('/api/v1/submissions')
      .send({ assignmentId: 'fake', textAnswer: 'test' });

    expect(res.status).toBe(401);
  });
});