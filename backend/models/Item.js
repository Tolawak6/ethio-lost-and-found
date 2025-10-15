const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
  itemName: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  locationFound: { type: String, required: true },
  dateFound: { type: Date, default: Date.now },
  status: { type: String, default: 'Unclaimed' },
  imageUrl: { type: String, default: 'https://via.placeholder.com/300x200.png?text=Item' }
}, { timestamps: true }); // timestamps adds createdAt and updatedAt fields automatically

module.exports = mongoose.model('Item', ItemSchema);