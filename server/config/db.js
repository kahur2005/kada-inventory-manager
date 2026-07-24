const mongoose = require('mongoose');

let cached = null;

async function connectDB(uri) {
  if (cached) return cached;

  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri);
  cached = conn;
  return conn;
}

module.exports = { connectDB };
