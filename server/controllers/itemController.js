const mongoose = require('mongoose');
const Item = require('../models/Item');

async function listItems(req, res) {
  const items = await Item.find().sort({ name: 1 });
  res.json({ items });
}

async function createItem(req, res) {
  const { name, sku, unit, volumeM3 } = req.body;
  if (!name || !sku) {
    return res.status(400).json({ message: 'name and sku are required' });
  }
  const existing = await Item.findOne({ sku: sku.toUpperCase() });
  if (existing) {
    return res.status(400).json({ message: 'sku already exists' });
  }
  const item = await Item.create({ name, sku, unit, volumeM3 });
  res.status(201).json({ item });
}

async function updateItem(req, res) {
  const { name, unit, volumeM3 } = req.body;
  // Validate that req.params.id is a well-formed MongoDB ObjectId before calling findById
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Item not found' });
  }
  const item = await Item.findById(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  if (name !== undefined) item.name = name;
  if (unit !== undefined) item.unit = unit;
  if (volumeM3 !== undefined) item.volumeM3 = volumeM3;
  await item.save();
  res.json({ item });
}

async function deleteItem(req, res) {
  // Validate that req.params.id is a well-formed MongoDB ObjectId before calling findByIdAndDelete
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Item not found' });
  }
  const item = await Item.findByIdAndDelete(req.params.id);
  if (!item) return res.status(404).json({ message: 'Item not found' });
  res.json({ message: 'Item deleted' });
}

module.exports = { listItems, createItem, updateItem, deleteItem };
