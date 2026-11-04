const mongoose = require('mongoose');

/**
 * One recorded department action.
 *
 * The audit log answers the questions a lost-property office actually gets
 * asked: who logged this item, who changed its status, who handed it back to a
 * passenger? Entries are append-only — nothing in the app edits or deletes
 * them, and they keep a denormalised actor name so the trail stays readable
 * even after an account is renamed or removed.
 */
const auditSchema = new mongoose.Schema(
  {
    // What happened: item.created, item.updated, item.deleted,
    // item.returned, claim.reviewed, claim.collected, account.created, ...
    action: { type: String, required: true, trim: true },
    // What it happened to.
    entity: { type: String, required: true, enum: ['item', 'claim', 'account', 'session'] },
    entityId: { type: String, default: '', trim: true },
    // A human-readable label captured at the time (item name, claim reference).
    entityLabel: { type: String, default: '', trim: true, maxlength: 200 },

    // Who did it. Copy the name and depot so the trail survives account changes.
    actorId: { type: String, default: '', trim: true },
    actorName: { type: String, default: '', trim: true, maxlength: 120 },
    actorEmail: { type: String, default: '', trim: true, maxlength: 200 },
    actorDepot: { type: String, default: '', trim: true, maxlength: 80 },

    // Extra context, e.g. { from: 'In Storage', to: 'Returned' }.
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

// The workspace reads newest-first, usually filtered to one item.
auditSchema.index({ createdAt: -1 });
auditSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

const AuditEntry = mongoose.models.AuditEntry || mongoose.model('AuditEntry', auditSchema);

module.exports = { AuditEntry };
