import serverless from 'serverless-http';
import { createApiApp } from '../../src/app-server.ts';

const app = createApiApp();

export const handler = serverless(app);
