// Unit II — central error handling. Express recognises an error handler
// by its FOUR parameters (err, req, res, next).
const config = require('../config');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || 500;
  let message = err.message || 'Something went wrong';

  if (err.name === 'ValidationError') { status = 422; } // Mongoose validation
  if (err.name === 'CastError') { status = 400; message = 'Invalid id'; } // bad Mongo ObjectId
  if (err.code === 'P2002') { status = 409; message = 'This record already exists'; } // Prisma unique
  if (err.code === 'P2025') { status = 404; message = 'Record not found'; } // Prisma not found
  if (err.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'Photo is too large (max 3 MB)'; }

  if (status >= 500 && !config.isTest) console.error('[error]', err);

  res.status(status).json({
    error: {
      status,
      message: status >= 500 && config.isProd ? 'Internal server error' : message,
      ...(err.details ? { details: err.details } : {}),
    },
  });
}

// Unit III — app.all(): catches every HTTP method on unknown API paths
function apiNotFound(req, res) {
  res.status(404).json({ error: { status: 404, message: `No API route for ${req.method} ${req.originalUrl}` } });
}

module.exports = { errorHandler, apiNotFound };
