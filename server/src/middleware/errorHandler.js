export function notFound(req, _res, next) {
  const error = new Error("Route not found.");
  error.status = 404;
  error.expose = true;
  next(error);
}

export function errorHandler(error, _req, res, _next) {
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
    ? error.status
    : 500;
  if (status >= 500 && !error.expose) {
    console.error("Unhandled API request error", { name: error.name || "Error", status });
  }
  res.status(status).json({
    message: error.expose ? error.message : "Something went wrong."
  });
}
