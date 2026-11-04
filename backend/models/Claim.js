const mongoose = require('mongoose');

const CLAIM_STATUSES = ['Pending', 'Approved', 'Rejected', 'Collected'];

const ClaimSchema = new mongoose.Schema(
  {
    item: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Item',
      required: true,
      index: true,
    },
    claimantName: {
      type: String,
      required: [true, 'Your name is required'],
      trim: true,
      maxlength: [80, 'Name must be 80 characters or fewer'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      maxlength: [40, 'Phone number must be 40 characters or fewer'],
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [120, 'Email must be 120 characters or fewer'],
      match: [/^$|^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
    },
    /** What the passenger says proves ownership, e.g. the lock screen photo. */
    proof: {
      type: String,
      required: [true, 'Please describe something that proves the item is yours'],
      trim: true,
      maxlength: [1000, 'Proof must be 1000 characters or fewer'],
    },
    status: {
      type: String,
      enum: CLAIM_STATUSES,
      default: 'Pending',
      index: true,
    },
    /** Internal note written by the department when reviewing the claim. */
    reviewNote: {
      type: String,
      trim: true,
      maxlength: [500, 'Review note must be 500 characters or fewer'],
    },
    reviewedAt: { type: Date, default: null },
    /** Human-friendly code the passenger quotes at the office. */
    reference: {
      type: String,
      unique: true,
      index: true,
    },
  },
  { timestamps: true }
);

ClaimSchema.index({ item: 1, createdAt: -1 });

ClaimSchema.pre('validate', function setReference(next) {
  if (!this.reference) {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.reference = `EC-${random}`;
  }
  next();
});

const Claim = mongoose.model('Claim', ClaimSchema);

module.exports = { Claim, CLAIM_STATUSES };
