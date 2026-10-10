import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.middleware.ts';
import { eventStream } from '../services/realtime.ts';

export const eventsRoutes = Router();

eventsRoutes.get('/', authenticateToken, eventStream);
