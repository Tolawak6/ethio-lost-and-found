const { CATEGORIES, STATUSES, AGENCIES } = require('../models/Item');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Ethiopian plates look like AA-3-12345, 3-12345, or 12345. */
const PLATE_RE = /^[A-Z0-9][A-Z0-9\-\s]{1,18}[A-Z0-9]$/;
/** Plausible Ethiopian mobile numbers: +2519…, 09…, 07… with spaces allowed. */
const PHONE_RE = /^(\+?251|0)?[79]\d{8}$/;

const FIELD_LIMITS = {
  itemName: 120,
  description: 2000,
  identifyingDetails: 300,
  plateNumber: 20,
  busCode: 20,
  route: 120,
  foundOnBoard: 60,
  reportedBy: 80,
  storageOffice: 120,
};

const REQUIRED_FIELDS = ['itemName', 'description', 'category', 'plateNumber', 'foundAt'];

const asText = (value) => (typeof value === 'string' ? value.trim() : '');

const normalisePhone = (value) => value.replace(/[\s()-]/g, '');

const validateItemPayload = (body = {}, { partial = false, now = new Date() } = {}) => {
  const errors = {};
  const data = {};

  const checkText = (field, { required = false, transform } = {}) => {
    if (body[field] === undefined) {
      if (!partial && required) errors[field] = `${field} is required`;
      return;
    }
    const value = asText(body[field]);
    if (required && !value) {
      errors[field] = `${field} is required`;
      return;
    }
    if (value.length > FIELD_LIMITS[field]) {
      errors[field] = `${field} must be ${FIELD_LIMITS[field]} characters or fewer`;
      return;
    }
    if (!value) return; // optional + blank => omit rather than store ""
    data[field] = transform ? transform(value) : value;
  };

  checkText('itemName', { required: true });
  checkText('description', { required: true });
  checkText('identifyingDetails');
  checkText('plateNumber', { required: true, transform: (v) => v.toUpperCase() });
  checkText('busCode');
  checkText('route');
  checkText('foundOnBoard');
  checkText('reportedBy');
  checkText('storageOffice');

  if (data.plateNumber && !PLATE_RE.test(data.plateNumber)) {
    errors.plateNumber = 'Enter a valid plate number, e.g. AA-3-12345';
    delete data.plateNumber;
  }
  if (data.busCode && !/^[A-Za-z0-9\- ]+$/.test(data.busCode)) {
    errors.busCode = 'Bus code may only contain letters, numbers and dashes';
    delete data.busCode;
  }

  if (body.category !== undefined) {
    const category = asText(body.category);
    if (!CATEGORIES.includes(category)) {
      errors.category = `Category must be one of: ${CATEGORIES.join(', ')}`;
    } else {
      data.category = category;
    }
  } else if (!partial) {
    errors.category = 'category is required';
  }

  if (body.agency !== undefined && asText(body.agency) !== '') {
    const agency = asText(body.agency);
    if (!AGENCIES.includes(agency)) {
      errors.agency = `Agency must be one of: ${AGENCIES.join(', ')}`;
    } else {
      data.agency = agency;
    }
  }

  if (body.status !== undefined) {
    const status = asText(body.status);
    if (!STATUSES.includes(status)) {
      errors.status = `Status must be one of: ${STATUSES.join(', ')}`;
    } else {
      data.status = status;
    }
  }

  if (body.foundAt !== undefined && asText(body.foundAt) !== '') {
    const foundAt = new Date(body.foundAt);
    if (Number.isNaN(foundAt.getTime())) {
      errors.foundAt = 'foundAt must be a valid date';
    } else if (foundAt.getTime() > now.getTime() + 60 * 60 * 1000) {
      errors.foundAt = 'foundAt cannot be in the future';
    } else {
      data.foundAt = foundAt;
    }
  } else if (!partial) {
    errors.foundAt = 'foundAt is required';
  }

  // Storage deadlines are derived, never client supplied.
  if (data.foundAt) {
    const deadline = new Date(data.foundAt);
    deadline.setDate(deadline.getDate() + 90);
    data.storageDeadline = deadline;
  }

  return { data, errors, valid: Object.keys(errors).length === 0 };
};

const validateItem = ({ partial = false } = {}) => (req, res, next) => {
  const { data, errors, valid } = validateItemPayload(req.body || {}, { partial });
  if (!valid) {
    return res.status(422).json({ error: 'Validation failed', fields: errors });
  }
  req.validatedBody = data;
  return next();
};

// --- claims ---------------------------------------------------------------

const CLAIM_LIMITS = { claimantName: 80, phone: 40, email: 120, proof: 1000 };

const validateClaimPayload = (body = {}) => {
  const errors = {};
  const data = {};

  const text = (field) => asText(body[field]);

  data.claimantName = text('claimantName');
  if (!data.claimantName) errors.claimantName = 'Your name is required';
  else if (data.claimantName.length > CLAIM_LIMITS.claimantName) {
    errors.claimantName = `Name must be ${CLAIM_LIMITS.claimantName} characters or fewer`;
  }

  data.phone = normalisePhone(text('phone'));
  if (!data.phone) errors.phone = 'Phone number is required';
  else if (!PHONE_RE.test(data.phone)) errors.phone = 'Enter a valid Ethiopian phone number, e.g. 0911234567';

  const email = text('email');
  if (email) {
    if (!EMAIL_RE.test(email)) errors.email = 'Enter a valid email address';
    else data.email = email;
  }

  data.proof = text('proof');
  if (!data.proof) {
    errors.proof = 'Describe something that proves the item is yours';
  } else if (data.proof.length < 15) {
    errors.proof = 'Please give a little more detail (at least 15 characters)';
  } else if (data.proof.length > CLAIM_LIMITS.proof) {
    errors.proof = `Proof must be ${CLAIM_LIMITS.proof} characters or fewer`;
  }

  return { data, errors, valid: Object.keys(errors).length === 0 };
};

const validateClaim = (req, res, next) => {
  const { data, errors, valid } = validateClaimPayload(req.body || {});
  if (!valid) return res.status(422).json({ error: 'Validation failed', fields: errors });
  req.validatedBody = data;
  return next();
};

module.exports = {
  validateItem,
  validateItemPayload,
  validateClaim,
  validateClaimPayload,
  FIELD_LIMITS,
  PLATE_RE,
  PHONE_RE,
};
