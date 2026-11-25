// A small Error subclass so routes can say `throw new HttpError(404, 'Not found')`
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
module.exports = HttpError;
