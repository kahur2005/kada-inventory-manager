const mongoose = require('mongoose');
const Store = require('../models/Store');

async function listStores(req, res) {
  if (req.user.role === 'store_admin') {
    const stores = req.user.store ? await Store.find({ _id: req.user.store }) : [];
    return res.json({ stores });
  }
  const stores = await Store.find().sort({ name: 1 });
  res.json({ stores });
}

async function createStore(req, res) {
  const { name, address, coords } = req.body;
  if (!name || !address) {
    return res.status(400).json({ message: 'name and address are required' });
  }
  const store = await Store.create({ name, address, coords });
  res.status(201).json({ store });
}

async function updateStore(req, res) {
  // Validate that req.params.id is a well-formed MongoDB ObjectId before calling findById
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Store not found' });
  }
  const { name, address, coords } = req.body;
  const store = await Store.findById(req.params.id);
  if (!store) return res.status(404).json({ message: 'Store not found' });
  if (name !== undefined) store.name = name;
  if (address !== undefined) store.address = address;
  if (coords !== undefined) store.coords = coords;
  await store.save();
  res.json({ store });
}

async function deleteStore(req, res) {
  // Validate that req.params.id is a well-formed MongoDB ObjectId before calling findByIdAndDelete
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: 'Store not found' });
  }
  const store = await Store.findByIdAndDelete(req.params.id);
  if (!store) return res.status(404).json({ message: 'Store not found' });
  res.json({ message: 'Store deleted' });
}

module.exports = { listStores, createStore, updateStore, deleteStore };
