import { Router } from 'express';
import {
  submitReport,
  getModerationOverview,
  getReports,
  resolveReport,
  getAdminUsers,
  suspendUser,
  setUserRole,
} from '../controllers/moderation.controller.ts';
import { authenticateToken, requireAdmin } from '../middleware/auth.middleware.ts';
import { validateBody } from '../middleware/validate.middleware.ts';
import { reportSchema, resolveReportSchema, suspendUserSchema, setRoleSchema } from '../validation/schemas.ts';

export const reportsRoutes = Router();
reportsRoutes.post('/', authenticateToken, validateBody(reportSchema), submitReport);

export const adminRoutes = Router();
adminRoutes.use(authenticateToken, requireAdmin);
adminRoutes.get('/overview', getModerationOverview);
adminRoutes.get('/reports', getReports);
adminRoutes.post('/reports/:reportId/resolve', validateBody(resolveReportSchema), resolveReport);
adminRoutes.get('/users', getAdminUsers);
adminRoutes.post('/users/:userId/suspend', validateBody(suspendUserSchema), suspendUser);
adminRoutes.post('/users/:userId/role', validateBody(setRoleSchema), setUserRole);
