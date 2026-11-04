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

/** Lifecycle of a found item, as handled by the lost property department. */
const STATUSES = ['In Storage', 'Claim Pending', 'Returned', 'Disposed'];

/** Transit agencies operating in Addis Ababa. */
const AGENCIES = [
  'Anbessa City Bus',
  'Sheger Mass Transport',
  'Addis Ababa Light Rail',
  'Minibus (Blue/White)',
  'Other',
];

const ItemSchema = new mongoose.Schema(
  {
    // --- what was found -----------------------------------------------------
    itemName: {
      type: String,
      required: [true, 'Item name is required'],
      trim: true,
      maxlength: [120, 'Item name must be 120 characters or fewer'],
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: { values: CATEGORIES, message: 'Unknown category: {VALUE}' },
      index: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
      maxlength: [2000, 'Description must be 2000 characters or fewer'],
    },
    /** Detail only the real owner would know. Never returned by the API. */
    identifyingDetails: {
      type: String,
      trim: true,
      maxlength: [300, 'Identifying details must be 300 characters or fewer'],
      select: false,
    },
    imageUrl: { type: String, default: '' },
    imagePublicId: { type: String, select: false },

    // --- where it was found -------------------------------------------------
    agency: {
      type: String,
      enum: { values: AGENCIES, message: 'Unknown agency: {VALUE}' },
      default: 'Anbessa City Bus',
      index: true,
    },
    plateNumber: {
      type: String,
      required: [true, 'Bus plate number is required'],
      trim: true,
      uppercase: true,
      maxlength: [20, 'Plate number must be 20 characters or fewer'],
      index: true,
    },
    /** Code number of the bus, e.g. the supervisor's bus number. */
    busCode: {
      type: String,
      trim: true,
      maxlength: [20, 'Bus code must be 20 characters or fewer'],
    },
    route: {
      type: String,
      trim: true,
      maxlength: [120, 'Route must be 120 characters or fewer'],
    },
    /** Where on the bus: "back seat", "under seat 12", "driver's cabin"… */
    foundOnBoard: {
      type: String,
      trim: true,
      maxlength: [60, 'Location on board must be 60 characters or fewer'],
    },
    foundAt: {
      type: Date,
      required: [true, 'Date found is required'],
    },
    /** Supervisor / conductor who handed the item in. */
    reportedBy: {
      type: String,
      trim: true,
      maxlength: [80, 'Reporter name must be 80 characters or fewer'],
    },

    // --- storage & lifecycle ------------------------------------------------
    status: {
      type: String,
      enum: STATUSES,
      default: 'In Storage',
      index: true,
    },
    storageOffice: {
      type: String,
      trim: true,
      maxlength: [120, 'Storage office must be 120 characters or fewer'],
      default: 'Lost Property Office, Merkato',
    },
    storageDeadline: { type: Date, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ItemSchema.index({ createdAt: -1 });
ItemSchema.index({ plateNumber: 1, foundAt: -1 });
ItemSchema.index({ itemName: 'text', description: 'text', route: 'text' });

// Keep derived fields in sync wherever the status changes.
ItemSchema.pre('save', function syncLifecycle(next) {
  if (this.isModified('status')) {
    this.resolvedAt = this.status === 'Returned' ? new Date() : null;
  }
  if (!this.storageDeadline) {
    // Department policy: items are held for 90 days.
    const deadline = new Date(this.foundAt || Date.now());
    deadline.setDate(deadline.getDate() + 90);
    this.storageDeadline = deadline;
  }
  next();
});

const Item = mongoose.model('Item', ItemSchema);

module.exports = { Item, CATEGORIES, STATUSES, AGENCIES };
