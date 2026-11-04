const mongoose = require('mongoose');

const CATEGORIES = [
  'Electronics',
  'Wallet',
  'Keys',
  'Documents',
  'ID & Cards',
  'Books',
  'Clothing',
  'Bags',
  'Jewelry',
  'Pets',
  'Other',
];

const STATUSES = ['Unclaimed', 'Claimed'];

const ItemSchema = new mongoose.Schema(
  {
    /** "Lost" = the owner is looking for it, "Found" = someone picked it up. */
    type: {
      type: String,
      enum: ['Lost', 'Found'],
      default: 'Found',
      index: true,
    },
    itemName: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: [120, 'Item name must be 120 characters or fewer'],
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description must be 2000 characters or fewer'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: { values: CATEGORIES, message: 'Unknown category: {VALUE}' },
      trim: true,
      index: true,
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
      maxlength: [160, 'Location must be 160 characters or fewer'],
    },
    /** Free-form way for the owner to prove ownership ("has a blue sticker"). */
    hiddenDetails: {
      type: String,
      trim: true,
      maxlength: [300, 'Hidden details must be 300 characters or fewer'],
      // Never sent to clients: it is how claims are verified.
      select: false,
    },
    contactName: {
      type: String,
      trim: true,
      maxlength: [80, 'Contact name must be 80 characters or fewer'],
    },
    contactPhone: {
      type: String,
      trim: true,
      maxlength: [40, 'Contact phone must be 40 characters or fewer'],
    },
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [120, 'Contact email must be 120 characters or fewer'],
      match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    date: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: STATUSES,
      default: 'Unclaimed',
      index: true,
    },
    imageUrl: {
      type: String,
      default: '',
    },
    imagePublicId: {
      type: String,
      select: false,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Speeds up the default listing (newest first) and common text searches.
ItemSchema.index({ createdAt: -1 });
ItemSchema.index({ itemName: 'text', description: 'text', location: 'text' });

// Keep derived fields in sync no matter where the status is changed.
ItemSchema.pre('save', function syncResolvedAt(next) {
  if (this.isModified('status')) {
    this.resolvedAt = this.status === 'Claimed' ? new Date() : null;
  }
  next();
});

const Item = mongoose.model('Item', ItemSchema);

module.exports = { Item, CATEGORIES, STATUSES };
