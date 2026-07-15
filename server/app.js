const express = require('express');
const cors = require('cors');
const healthRoutes = require('./routes/healthRoutes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());

app.use('/api/health', healthRoutes);
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));
app.use('/api/stores', require('./routes/storeRoutes'));
app.use('/api/warehouses', require('./routes/warehouseRoutes'));
app.use('/api/warehouse-stock', require('./routes/warehouseStockRoutes'));
app.use('/api/store-stock', require('./routes/storeStockRoutes'));
app.use('/api/alerts', require('./routes/alertsRoutes'));
app.use('/api/boxes', require('./routes/boxRoutes'));
app.use('/api/drivers', require('./routes/driverRoutes'));
app.use('/api/scan', require('./routes/scanRoutes'));
app.use('/api', require('./routes/driverLocationRoutes'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));
app.use('/api/logs', require('./routes/logsRoutes'));
app.use('/api/tracking', require('./routes/trackingRoutes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
