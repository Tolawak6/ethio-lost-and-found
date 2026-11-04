import { useState } from 'react';

const EMPTY = { claimantName: '', phone: '', email: '', proof: '' };

function ClaimForm({ item, onSubmit, onCancel, submitting }) {
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const change = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const validate = () => {
    const next = {};
    if (!values.claimantName.trim()) next.claimantName = 'Your name is required';
    const phone = values.phone.replace(/[\s()-]/g, '');
    if (!phone) next.phone = 'A phone number is required so the office can reach you';
    else if (!/^(\+?251|0)?[79]\d{8}$/.test(phone)) {
      next.phone = 'Enter a valid Ethiopian number, e.g. 0911234567';
    }
    if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) {
      next.email = 'Enter a valid email address';
    }
    if (values.proof.trim().length < 15) {
      next.proof = 'Describe something specific that proves the item is yours (15+ characters)';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (event) => {
    event.preventDefault();
    if (!validate()) return;
    onSubmit(values);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="claim__intro">
        <strong>Claiming: {item.itemName}</strong>
        <p>
          Give as much detail as you can. Staff at the lost property office will compare your
          description with details recorded when the item was handed in.
        </p>
      </div>

      <div className="form__grid">
        <label className="field">
          <span>Your full name *</span>
          <input
            name="claimantName"
            value={values.claimantName}
            onChange={change}
            autoComplete="name"
            aria-invalid={Boolean(errors.claimantName)}
          />
          {errors.claimantName && <em className="field__error">{errors.claimantName}</em>}
        </label>

        <label className="field">
          <span>Phone number *</span>
          <input
            name="phone"
            type="tel"
            value={values.phone}
            onChange={change}
            placeholder="0911234567"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
          />
          {errors.phone && <em className="field__error">{errors.phone}</em>}
        </label>

        <label className="field">
          <span>Email (optional)</span>
          <input
            name="email"
            type="email"
            value={values.email}
            onChange={change}
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <em className="field__error">{errors.email}</em>}
        </label>
      </div>

      <label className="field">
        <span>What proves the item is yours? *</span>
        <textarea
          name="proof"
          rows={4}
          value={values.proof}
          onChange={change}
          placeholder="e.g. the wallet has a student ID with my name and a photo of two children inside"
          maxLength={1000}
          aria-invalid={Boolean(errors.proof)}
        />
        <em className="field__hint">
          Do not include passwords. Describe marks, contents or anything recorded when it was found.
        </em>
        {errors.proof && <em className="field__error">{errors.proof}</em>}
      </label>

      <div className="form__actions">
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit claim'}
        </button>
      </div>
    </form>
  );
}

export default ClaimForm;
