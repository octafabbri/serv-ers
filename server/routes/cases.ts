import { Router, Request, Response } from 'express';
import { getSupabaseAdmin } from '../services/supabaseAdmin';
import { apiPayloadToDbRow, CreateCasePayload } from '../mappers/apiToDb';
import { dbRowToApiResponse, dbRowToListItem } from '../mappers/dbToApi';

const router = Router();

/**
 * POST /api/v3/cases
 * Create a new TIRE ERS case.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const payload: CreateCasePayload = req.body;

  // TIRE-only guard
  const productType = payload.products?.[0]?.type;
  if (productType !== 'TIRE') {
    res.status(400).json({
      errors: { products: [`Only TIRE cases are supported. Received: ${productType ?? 'missing'}`] },
    });
    return;
  }

  try {
    const row = apiPayloadToDbRow(payload);
    const db = getSupabaseAdmin();
    const id = crypto.randomUUID();
    const createdById = crypto.randomUUID();

    const { rows } = await db.query(
      `INSERT INTO service_requests (
        id, caller_type, caller_name, caller_phone,
        driver_name, contact_phone, fleet_name, ship_to,
        vehicle_type, unit_number, vin_number,
        location, service_type, urgency,
        tire_info, mechanical_info, status, submitted_at,
        created_by_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
      ) RETURNING *`,
      [
        id,
        row.caller_type, row.caller_name ?? null, row.caller_phone ?? null,
        row.driver_name, row.contact_phone, row.fleet_name, row.ship_to,
        row.vehicle_type, row.unit_number, row.vin_number,
        JSON.stringify(row.location), row.service_type, row.urgency,
        row.tire_info ? JSON.stringify(row.tire_info) : null,
        row.mechanical_info ? JSON.stringify(row.mechanical_info) : null,
        row.status, row.submitted_at,
        createdById,
      ]
    );

    res.status(200).json(dbRowToApiResponse(rows[0]));
  } catch (err) {
    console.error('POST /cases error:', err);
    res.status(500).json({ errors: { detail: 'Internal server error' } });
  }
});

/**
 * GET /api/v3/cases
 * List cases filtered by customerShipTo (required) + date range.
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { customerShipTo, customerBillTo, startDate, endDate, limit, skip } = req.query as Record<string, string>;

  const shipTo = customerShipTo || customerBillTo;
  if (!shipTo) {
    res.status(400).json({ errors: { query: 'Either customerShipTo or customerBillTo is required' } });
    return;
  }
  if (!startDate || !endDate) {
    res.status(400).json({ errors: { query: 'startDate and endDate are required' } });
    return;
  }

  try {
    const db = getSupabaseAdmin();
    const pageLimit = limit ? parseInt(limit, 10) : 50;
    const offset = skip ? parseInt(skip, 10) : 0;

    const { rows } = await db.query(
      `SELECT *, COUNT(*) OVER() AS total_count
       FROM service_requests
       WHERE ship_to = $1
         AND created_at >= $2
         AND created_at <= $3
       ORDER BY created_at DESC
       LIMIT $4 OFFSET $5`,
      [
        shipTo,
        new Date(startDate).toISOString(),
        new Date(endDate + 'T23:59:59Z').toISOString(),
        pageLimit,
        offset,
      ]
    );

    const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;

    res.json({
      cases: rows.map(dbRowToListItem),
      total,
    });
  } catch (err) {
    console.error('GET /cases error:', err);
    res.status(500).json({ errors: { detail: 'Internal server error' } });
  }
});

/**
 * GET /api/v3/cases/:id
 * Get a single case by ID.
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  try {
    const db = getSupabaseAdmin();
    const { rows } = await db.query(
      'SELECT * FROM service_requests WHERE id = $1',
      [id]
    );

    if (rows.length === 0) {
      res.status(404).json({ errors: { detail: 'Case not found' } });
      return;
    }

    res.json(dbRowToApiResponse(rows[0]));
  } catch (err) {
    console.error('GET /cases/:id error:', err);
    res.status(500).json({ errors: { detail: 'Internal server error' } });
  }
});

/**
 * PATCH /api/v3/cases/:id
 * Update billing information on a case.
 */
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { billingInfo } = req.body ?? {};

  try {
    const db = getSupabaseAdmin();

    // Fetch current row first
    const { rows: existing } = await db.query(
      'SELECT * FROM service_requests WHERE id = $1',
      [id]
    );

    if (existing.length === 0) {
      res.status(404).json({ errors: { detail: 'Case not found' } });
      return;
    }

    const setClauses: string[] = [];
    const values: unknown[] = [];

    if (billingInfo?.poNumber !== undefined) {
      values.push(billingInfo.poNumber);
      setClauses.push(`po_number = $${values.length}`);
    }
    if (billingInfo?.comment !== undefined) {
      values.push(billingInfo.comment);
      setClauses.push(`billing_comment = $${values.length}`);
    }

    if (setClauses.length === 0) {
      res.json(dbRowToApiResponse(existing[0]));
      return;
    }

    values.push(id);
    const { rows: updated } = await db.query(
      `UPDATE service_requests SET ${setClauses.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );

    res.json(dbRowToApiResponse(updated[0]));
  } catch (err) {
    console.error('PATCH /cases/:id error:', err);
    res.status(500).json({ errors: { detail: 'Internal server error' } });
  }
});

export default router;
