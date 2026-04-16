import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

/**
 * POST /idp/v2/b2b/oauth2/token
 * Mimics OAuth2 Client Credentials flow.
 * Accepts: grant_type=client_credentials + client_id + client_secret (form-encoded or JSON)
 * Returns: { access_token, token_type, expires_in }
 */
router.post('/v2/b2b/oauth2/token', (req: Request, res: Response): void => {
  const body = req.body ?? {};
  const grantType = body.grant_type;
  const clientId = body.client_id;
  const clientSecret = body.client_secret;

  if (grantType !== 'client_credentials') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }

  if (
    clientId !== process.env.API_CLIENT_ID ||
    clientSecret !== process.env.API_CLIENT_SECRET
  ) {
    res.status(401).json({ error: 'invalid_client' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration' });
    return;
  }

  const expiresIn = 3600; // 1 hour
  const token = jwt.sign({ client_id: clientId }, secret, { expiresIn });

  res.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresIn,
  });
});

export default router;
