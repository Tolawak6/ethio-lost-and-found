const { CATEGORIES, STATUSES } = require('../models/Item');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_LIMITS = {
  itemName: 120,
  description: 2000,
  location: 160,
  hiddenDetails: 300,
  contactName: 80,
  contactPhone: 40,
  contactEmail: 120,
};

const asText = (value) => (typeof value === 'string' ? value.trim() : '');

const validateItemPayload = (body, { partial = false } = {}) => {
  const errors = {};
  const data = {};

  const checkText = (field, { required }) => {
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
    // Optional fields left blank are simply omitted instead of stored as "".
    if (!value && !required) return;
    data[field] = value;
  };

  checkText('itemName', { required: true });
  checkText('description', { required: true });
  checkText('location', { required: true });
  checkText('hiddenDetails', { required: false });
  checkText('contactName', { required: false });
  checkText('contactPhone', { required: false });
  checkText('contactEmail', { required: false });

  if (data.contactEmail && !EMAIL_RE.test(data.contactEmail)) {
    errors.contactEmail = 'Please provide a valid email address';
    delete data.contactEmail;
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

  if (body.type !== undefined) {
    const type = asText(body.type);
    if (!['Lost', 'Found'].includes(type)) {
      errors.type = 'type must be "Lost" or "Found"';
    } else {
      data.type = type;
    }
  }

  if (body.status !== undefined) {
    const status = asText(body.status);
    if (!STATUSES.includes(status)) {
      errors.status = `status must be one of: ${STATUSES.join(', ')}`;
    } else {
      data.status = status;
    }
  }

  if (body.date !== undefined && asText(body.date) !== '') {
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) {
      errors.date = 'date must be a valid date';
    } else {
      data.date = date;
    }
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

module.exports = { validateItem, validateItemPayload, FIELD_LIMITS };
