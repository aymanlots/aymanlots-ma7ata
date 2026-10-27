import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { eq, desc } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  workspaces,
  stations,
  parcels,
  trips,
  transactions,
  auditLogs,
} from './src/db/schema.ts';
import { requireAuth } from './src/middleware/auth.ts';
import { getOrCreateUser } from './src/db/users.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '5mb' }));

  // Authenticated User Profile Sync
  app.get('/api/me', requireAuth, async (req, res) => {
    try {
      const user = await getOrCreateUser((req as any).user);
      res.json({ user });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Cloud SQL Workspace & Data Sync Endpoint
  app.get('/api/workspace-state', requireAuth, async (req, res) => {
    try {
      const user = await getOrCreateUser((req as any).user);
      const workspaceId = (req.query.workspaceId as string) || 'ws-dakhla-main';

      let wsList: any[] = [];
      let stList: any[] = [];
      let prList: any[] = [];
      let trList: any[] = [];
      let txList: any[] = [];

      try {
        wsList = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
        stList = await db.select().from(stations).where(eq(stations.workspaceId, workspaceId));
        prList = await db
          .select()
          .from(parcels)
          .where(eq(parcels.workspaceId, workspaceId))
          .orderBy(desc(parcels.createdAt));
        trList = await db
          .select()
          .from(trips)
          .where(eq(trips.workspaceId, workspaceId))
          .orderBy(desc(trips.createdAt));
        txList = await db
          .select()
          .from(transactions)
          .where(eq(transactions.workspaceId, workspaceId))
          .orderBy(desc(transactions.createdAt));
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database query failed' });
      }

      res.json({
        user,
        workspace: wsList[0] || null,
        stations: stList,
        parcels: prList,
        trips: trList,
        transactions: txList,
      });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Public Tracking Lookup from Cloud SQL
  app.get('/api/public-tracking/:code', async (req, res) => {
    try {
      const code = (req.params.code || '').trim().toUpperCase();
      if (!code) {
        return res.status(400).json({ error: 'Missing tracking code' });
      }
      try {
        const found = await db
          .select()
          .from(parcels)
          .where(eq(parcels.trackingCode, code))
          .limit(1);
        if (found.length === 0) {
          return res.status(404).json({ error: 'Parcel not found' });
        }
        return res.json({ parcel: found[0] });
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database query failed' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Upsert Parcel to Cloud SQL
  app.post('/api/parcels', requireAuth, async (req, res) => {
    try {
      await getOrCreateUser((req as any).user);
      const body = req.body;
      if (!body?.id || !body?.tracking_code) {
        return res.status(400).json({ error: 'Invalid parcel payload' });
      }
      try {
        const [saved] = await db
          .insert(parcels)
          .values({
            id: String(body.id),
            workspaceId: String(body.workspace_id || 'ws-dakhla-main'),
            trackingCode: String(body.tracking_code),
            senderName: String(body.sender_name || ''),
            senderPhone: String(body.sender_phone || ''),
            receiverName: String(body.receiver_name || ''),
            receiverPhone: String(body.receiver_phone || ''),
            originStationId: String(body.origin_station_id || ''),
            destinationStationId: String(body.destination_station_id || ''),
            originStationName: body.origin_station_name ?? null,
            destinationStationName: body.destination_station_name ?? null,
            weightKg: String(body.weight_kg ?? '1.00'),
            piecesCount: Number(body.pieces_count ?? 1),
            description: body.description ?? '',
            amountDue: String(body.amount_due ?? '0.00'),
            amountPaid: String(body.amount_paid ?? '0.00'),
            currency: String(body.currency || 'MAD'),
            paymentStatus: String(body.payment_status || 'unpaid'),
            status: String(body.status || 'registered'),
            tripId: body.trip_id ?? null,
            driverName: body.driver_name ?? null,
            driverPhone: body.driver_phone ?? null,
            vehiclePlate: body.vehicle_plate ?? null,
            notes: body.notes ?? null,
          })
          .onConflictDoUpdate({
            target: parcels.id,
            set: {
              status: String(body.status || 'registered'),
              paymentStatus: String(body.payment_status || 'unpaid'),
              amountPaid: String(body.amount_paid ?? '0.00'),
              tripId: body.trip_id ?? null,
              driverName: body.driver_name ?? null,
              driverPhone: body.driver_phone ?? null,
              vehiclePlate: body.vehicle_plate ?? null,
              notes: body.notes ?? null,
              updatedAt: new Date(),
            },
          })
          .returning();

        return res.json({ parcel: saved });
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database write failed' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Upsert Transaction to Cloud SQL
  app.post('/api/transactions', requireAuth, async (req, res) => {
    try {
      await getOrCreateUser((req as any).user);
      const body = req.body;
      if (!body?.id || !body?.type) {
        return res.status(400).json({ error: 'Invalid transaction payload' });
      }
      try {
        const [saved] = await db
          .insert(transactions)
          .values({
            id: String(body.id),
            workspaceId: String(body.workspace_id || 'ws-dakhla-main'),
            stationId: String(body.station_id || ''),
            stationName: body.station_name ?? null,
            type: String(body.type),
            category: String(body.category || 'manual_Deposit'),
            amount: String(body.amount ?? '0.00'),
            currency: String(body.currency || 'MAD'),
            exchangeRateUsed: body.exchange_rate_used != null ? String(body.exchange_rate_used) : null,
            convertedAmount: body.converted_amount != null ? String(body.converted_amount) : null,
            convertedCurrency: body.converted_currency ?? null,
            relatedParcelId: body.related_parcel_id ?? null,
            description: String(body.description || ''),
            createdByUserId: body.created_by_user_id ?? null,
            createdByName: body.created_by_name ?? null,
          })
          .onConflictDoNothing()
          .returning();

        return res.json({ transaction: saved });
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database write failed' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Upsert Audit Log to Cloud SQL
  app.post('/api/audit-logs', requireAuth, async (req, res) => {
    try {
      await getOrCreateUser((req as any).user);
      const body = req.body;
      if (!body?.id || !body?.action) {
        return res.status(400).json({ error: 'Invalid audit payload' });
      }
      try {
        await db
          .insert(auditLogs)
          .values({
            id: String(body.id),
            workspaceId: String(body.workspace_id || 'ws-dakhla-main'),
            userId: String(body.user_id || ''),
            userName: String(body.user_name || ''),
            userRole: String(body.user_role || 'owner'),
            action: String(body.action),
            entityType: String(body.entity_type || 'system'),
            entityId: String(body.entity_id || ''),
            details: String(body.details || ''),
          })
          .onConflictDoNothing();
        return res.json({ ok: true });
      } catch (dbErr) {
        console.error('[DB Error]', dbErr);
        return res.status(500).json({ error: 'Database write failed' });
      }
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
