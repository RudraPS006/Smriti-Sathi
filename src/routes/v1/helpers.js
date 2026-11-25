// Small shared helpers for routers
const HttpError = require('../../middleware/httpError');

// Unit IV — pagination: ?page=2&limit=10 -> skip 10, take 10
function paginate(req, defaultLimit = 10, maxLimit = 50) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function pageResult(items, total, { page, limit }) {
  return { items, page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

// A patient can only act for themselves; carers must pass a patientId they are linked to
function mustBePatient(req) {
  if (req.user.role !== 'patient') throw new HttpError(403, 'Only the patient can do this');
  return req.user.id;
}

const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, role: u.role, language: u.language, phone: u.phone });

module.exports = { paginate, pageResult, mustBePatient, publicUser };
