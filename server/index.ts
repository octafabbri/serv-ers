import 'dotenv/config';
import express from 'express';
import { bearerAuth } from './middleware/bearerAuth';
import authRouter from './routes/auth';
import casesRouter from './routes/cases';

const app = express();
const PORT = process.env.PORT ?? 3001;

// Parse JSON and URL-encoded bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// OAuth2 token endpoint (no auth required)
app.use('/idp', authRouter);

// Case management routes (Bearer auth required)
app.use('/api/v3/cases', bearerAuth, casesRouter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`[serv-ers API] listening on http://localhost:${PORT}`);
});
