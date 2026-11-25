// Unit III — JWT authentication + RBAC (role-based access control)
const jwt = require('jsonwebtoken');
const config = require('../config');
const { prisma } = require('../config/db');
const HttpError = require('./httpError');

const COOKIE = 'token';

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, name: user.name }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

function cookieOptions() {
  return {
    httpOnly: true, // JavaScript in the browser cannot read it (protects against XSS theft)
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function tokenFrom(req) {
  if (req.cookies && req.cookies[COOKIE]) return req.cookies[COOKIE]; // cookie-parser fills req.cookies
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null; // for Postman / mobile clients
}

function verifyToken(token) {
  const p = jwt.verify(token, config.jwtSecret);
  return { id: Number(p.sub), role: p.role, name: p.name };
}

// Must be logged in
function requireAuth(req, res, next) {
  const token = tokenFrom(req);
  if (!token) return next(new HttpError(401, 'Please sign in'));
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    next(new HttpError(401, 'Session expired, please sign in again'));
  }
}

// RBAC: only these roles may continue — e.g. requireRole('caregiver', 'admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'Please sign in'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, `This action needs role: ${roles.join(' or ')}`));
    }
    next();
  };
}

// Can the logged-in user see data of patient :patientId ?
// patient -> only themselves; caregiver -> only linked patients; admin -> all
async function canAccessPatient(user, patientId) {
  if (user.role === 'admin') return true;
  if (user.role === 'patient') return user.id === patientId;
  const link = await prisma.careLink.findUnique({
    where: { patientId_carerId: { patientId, carerId: user.id } },
  });
  return Boolean(link);
}

// Route-level middleware version; reads :patientId from the URL
function requirePatientAccess(param = 'patientId') {
  return async (req, res, next) => {
    const patientId = Number(req.params[param]);
    if (!Number.isInteger(patientId)) return next(new HttpError(400, 'Invalid patient id'));
    if (!(await canAccessPatient(req.user, patientId))) {
      return next(new HttpError(403, 'You are not part of this patient’s care team'));
    }
    req.patientId = patientId;
    next();
  };
}

module.exports = {
  COOKIE, signToken, cookieOptions, verifyToken, requireAuth, requireRole,
  canAccessPatient, requirePatientAccess,
};
