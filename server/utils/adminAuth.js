const TOKEN_HEADER = 'x-admin-token';
const ACTOR_HEADER = 'x-admin-user';

export function getAdminActor(req) {
  const headerValue = req.headers[ACTOR_HEADER];
  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim();
  }
  return 'admin';
}

export function requireAdmin(req, res, next) {
  const requiredToken = process.env.CONFIG_ADMIN_TOKEN;
  if (!requiredToken) {
    console.warn('CONFIG_ADMIN_TOKEN not set; admin enforcement is disabled.');
    req.adminActor = getAdminActor(req);
    return next();
  }

  const providedToken = req.headers[TOKEN_HEADER];
  if (typeof providedToken !== 'string' || providedToken !== requiredToken) {
    return res.status(403).json({ success: false, error: 'Admin token required.' });
  }

  req.adminActor = getAdminActor(req);
  return next();
}
