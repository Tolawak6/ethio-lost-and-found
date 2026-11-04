const mongoose = require('mongoose');

const ROLES = ['staff', 'manager'];

const StaffSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    /** scrypt hash — never a plain password. */
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    /** Depot this account belongs to, e.g. "Merkato". Managers see all. */
    depot: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
      index: true,
    },
    role: {
      type: String,
      enum: ROLES,
      default: 'staff',
    },
    active: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const Staff = mongoose.model('Staff', StaffSchema);

module.exports = { Staff, ROLES };
