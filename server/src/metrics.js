import client from 'prom-client';

export const register = new client.Registry();

// Enable default metrics collection (CPU, memory, event loop lag, etc.)
client.collectDefaultMetrics({ register });

// 1. Cache hit / miss counters
export const cacheHitsCounter = new client.Counter({
  name: 'cache_hits_total',
  help: 'Total number of Redis cache hits',
});
register.registerMetric(cacheHitsCounter);

export const cacheMissesCounter = new client.Counter({
  name: 'cache_misses_total',
  help: 'Total number of Redis cache misses',
});
register.registerMetric(cacheMissesCounter);

// 2. HTTP Request duration histogram (excluding /metrics)
export const httpRequestDurationHistogram = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
});
register.registerMetric(httpRequestDurationHistogram);

// 3. Socket connections gauge
export const activeSocketConnectionsGauge = new client.Gauge({
  name: 'active_socket_connections',
  help: 'Number of active socket.io connections',
});
register.registerMetric(activeSocketConnectionsGauge);

// 4. Active rooms gauge
export const activeRoomsGauge = new client.Gauge({
  name: 'active_rooms_total',
  help: 'Total number of active rooms in Redis',
});
register.registerMetric(activeRoomsGauge);

// Express middleware to measure response times
export function metricsMiddleware(req, res, next) {
  // Exclude /metrics endpoint to avoid noise
  if (req.path === '/metrics') {
    return next();
  }

  const start = process.hrtime();

  res.on('finish', () => {
    const diff = process.hrtime(start);
    const duration = diff[0] + diff[1] / 1e9;
    
    // Construct the route pattern (e.g. /api/rooms/:id) instead of actual IDs
    const routePath = req.route ? `${req.baseUrl || ''}${req.route.path}` : req.path;
    
    httpRequestDurationHistogram.observe(
      { method: req.method, route: routePath },
      duration
    );
  });

  next();
}
