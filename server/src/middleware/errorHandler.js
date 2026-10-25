export function notFound(req, _res, next) {
  const error = new Error("Route not found.");
  error.status = 404;
  error.expose = true;
  next(error);
}

function redactErrorText(value) {
  return String(value)
    .replace(/mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi, "[REDACTED_MONGODB_URI]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b(password|token|secret|authorization|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED_TOKEN]");
}

export function errorHandler(error, _req, res, _next) {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 500;
  if (status >= 500 && !error.expose) {
    console.error("Unhandled API request error", {
      name: error.name || "Error",
      status,
      message: redactErrorText(error.message || "Unknown server error."),
      stack: redactErrorText(error.stack || "")
    });
  }
  res.status(status).json({
    message: error.expose ? error.message : "Something went wrong."
  });
}
