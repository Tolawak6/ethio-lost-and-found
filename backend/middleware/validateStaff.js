const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Passwords must be long enough to be worth hashing. */
const MIN_PASSWORD_LENGTH = 8;

const validateStaffCredentials = (req, res, next) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';

  const fields = {};
  if (!email) fields.email = 'Email is required';
  else if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address';
  if (!password) fields.password = 'Password is required';

  if (Object.keys(fields).length) {
    return res.status(422).json({ error: 'Validation failed', fields });
  }

  req.validatedBody = { email: email.toLowerCase(), password };
  return next();
};

const validatePasswordChange = (req, res, next) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  const fields = {};
  if (!currentPassword) fields.currentPassword = 'Enter your current password';
  if (!newPassword) fields.newPassword = 'Enter a new password';
  else if (newPassword.length < MIN_PASSWORD_LENGTH) {
    fields.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  } else if (newPassword === currentPassword) {
    fields.newPassword = 'Choose a password you have not used here before';
  }

  if (Object.keys(fields).length) {
    return res.status(422).json({ error: 'Validation failed', fields });
  }

  req.validatedBody = { currentPassword, newPassword };
  return next();
};

const validateStaffCreate = (req, res, next) => {
  const body = req.body || {};
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  const fields = {};
  if (!name) fields.name = 'Name is required';
  if (!email) fields.email = 'Email is required';
  else if (!EMAIL_RE.test(email)) fields.email = 'Enter a valid email address';
  if (!password) fields.password = 'Password is required';
  else if (password.length < MIN_PASSWORD_LENGTH) {
    fields.password = `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  if (Object.keys(fields).length) {
    return res.status(422).json({ error: 'Validation failed', fields });
  }

  req.validatedBody = {
    email: email.toLowerCase(),
    name,
    password,
    depot: typeof body.depot === 'string' ? body.depot.trim() : '',
    role: body.role === 'manager' ? 'manager' : 'staff',
  };
  return next();
};

module.exports = {
  validateStaffCredentials,
  validatePasswordChange,
  validateStaffCreate,
  MIN_PASSWORD_LENGTH,
};
