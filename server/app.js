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

app.use(notFound);
app.use(errorHandler);

module.exports = app;
