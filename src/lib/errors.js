function buildError(code, message, details) {
  return {
    error: {
      code,
      message,
      details: details ?? null,
    },
  };
}

function sendError(res, status, code, message, details) {
  res.status(status).json(buildError(code, message, details));
}

module.exports = {
  buildError,
  sendError,
};
