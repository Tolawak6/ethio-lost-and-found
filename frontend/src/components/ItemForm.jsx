import { useEffect, useRef, useState } from 'react';

const EMPTY = {
  type: 'Found',
  itemName: '',
  category: '',
  location: '',
  description: '',
  date: new Date().toISOString().slice(0, 10),
  hiddenDetails: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Builds the form state from an item (edit mode) or the blank defaults. */
const toFormValues = (item) => {
  if (!item) return EMPTY;
  const values = Object.fromEntries(
    Object.keys(EMPTY).map((key) => [key, item[key] ?? EMPTY[key]])
  );
  return {
    ...EMPTY,
    ...values,
    date: (item.date || item.createdAt || EMPTY.date).slice(0, 10),
    // Proof details are write-only: never echo a stored value back.
    hiddenDetails: '',
  };
};

function ItemForm({ categories, initialItem, onSubmit, onCancel, submitting }) {
  // Initialised from props rather than a useEffect so the first render is
  // already correct (no flash of an empty form, no SSR mismatch).
  const [values, setValues] = useState(() => toFormValues(initialItem));
  const [errors, setErrors] = useState({});
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(initialItem?.imageUrl || '');
  const fileInput = useRef(null);

  // Object URLs created for previews must be released.
  useEffect(
    () => () => {
      if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  const change = (event) => {
    const { name, value } = event.target;
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => ({ ...current, [name]: undefined }));
  };

  const pickFile = (event) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setErrors((current) => ({ ...current, image: 'Please choose an image file' }));
      return;
    }
    if (selected.size > MAX_IMAGE_BYTES) {
      setErrors((current) => ({ ...current, image: 'Image must be 5 MB or smaller' }));
      return;
    }
    setErrors((current) => ({ ...current, image: undefined }));
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
  };

  const clearFile = () => {
    setFile(null);
    setPreview(initialItem?.imageUrl || '');
    if (fileInput.current) fileInput.current.value = '';
  };

  const validate = () => {
    const next = {};
    if (!values.itemName.trim()) next.itemName = 'Item name is required';
    if (!values.category) next.category = 'Choose a category';
    if (!values.location.trim()) next.location = 'Where was it lost/found?';
    if (!values.description.trim()) next.description = 'Add a short description';
    if (values.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) {
      next.contactEmail = 'Enter a valid email address';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = (event) => {
    event.preventDefault();
    if (!validate()) return;

    const form = new FormData();
    Object.entries(values).forEach(([key, value]) => {
      if (value !== '' && value !== null && value !== undefined) form.append(key, value);
    });
    if (file) form.append('image', file);
    onSubmit(form);
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <fieldset className="segmented">
        <legend className="sr-only">Is this item lost or found?</legend>
        {['Lost', 'Found'].map((type) => (
          <label key={type} className={values.type === type ? 'segmented__item is-active' : 'segmented__item'}>
            <input
              type="radio"
              name="type"
              value={type}
              checked={values.type === type}
              onChange={change}
            />
            <span>{type === 'Lost' ? 'I lost something' : 'I found something'}</span>
          </label>
        ))}
      </fieldset>

      <div className="form__grid">
        <label className="field">
          <span>Item name *</span>
          <input
            name="itemName"
            value={values.itemName}
            onChange={change}
            placeholder="e.g. Black leather wallet"
            maxLength={120}
            aria-invalid={Boolean(errors.itemName)}
          />
          {errors.itemName && <em className="field__error">{errors.itemName}</em>}
        </label>

        <label className="field">
          <span>Category *</span>
          <select name="category" value={values.category} onChange={change} aria-invalid={Boolean(errors.category)}>
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {errors.category && <em className="field__error">{errors.category}</em>}
        </label>

        <label className="field">
          <span>Location *</span>
          <input
            name="location"
            value={values.location}
            onChange={change}
            placeholder="e.g. Meskel Square, Addis Ababa"
            maxLength={160}
            aria-invalid={Boolean(errors.location)}
          />
          {errors.location && <em className="field__error">{errors.location}</em>}
        </label>

        <label className="field">
          <span>Date</span>
          <input type="date" name="date" value={values.date} onChange={change} max={new Date().toISOString().slice(0, 10)} />
        </label>
      </div>

      <label className="field">
        <span>Description *</span>
        <textarea
          name="description"
          rows={4}
          value={values.description}
          onChange={change}
          placeholder="Colour, brand, marks, and where exactly it was found"
          maxLength={2000}
          aria-invalid={Boolean(errors.description)}
        />
        <em className="field__hint">{values.description.length}/2000</em>
        {errors.description && <em className="field__error">{errors.description}</em>}
      </label>

      <label className="field">
        <span>Proof details (kept private)</span>
        <input
          name="hiddenDetails"
          value={values.hiddenDetails}
          onChange={change}
          placeholder="Something only the real owner knows, e.g. a scratch on the back"
          maxLength={300}
        />
        <em className="field__hint">Never shown publicly — use it to verify a claim.</em>
      </label>

      <div className="field">
        <span>Photo</span>
        <div className="uploader">
          {preview ? (
            <img className="uploader__preview" src={preview} alt="Item preview" />
          ) : (
            <div className="uploader__placeholder">No photo</div>
          )}
          <div className="uploader__controls">
            <label className="button button--ghost button--sm">
              {file ? 'Change photo' : 'Choose photo'}
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                onChange={pickFile}
                className="sr-only"
              />
            </label>
            {file && (
              <button type="button" className="button button--ghost button--sm" onClick={clearFile}>
                Remove
              </button>
            )}
            <em className="field__hint">JPEG, PNG, WEBP or GIF · max 5 MB</em>
          </div>
        </div>
        {errors.image && <em className="field__error">{errors.image}</em>}
      </div>

      <div className="form__grid">
        <label className="field">
          <span>Your name</span>
          <input name="contactName" value={values.contactName} onChange={change} maxLength={80} placeholder="Optional" />
        </label>
        <label className="field">
          <span>Phone</span>
          <input name="contactPhone" value={values.contactPhone} onChange={change} maxLength={40} placeholder="+251 …" />
        </label>
        <label className="field">
          <span>Email</span>
          <input
            name="contactEmail"
            type="email"
            value={values.contactEmail}
            onChange={change}
            maxLength={120}
            placeholder="Optional"
            aria-invalid={Boolean(errors.contactEmail)}
          />
          {errors.contactEmail && <em className="field__error">{errors.contactEmail}</em>}
        </label>
      </div>

      <div className="form__actions">
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Saving…' : initialItem ? 'Save changes' : 'Publish report'}
        </button>
      </div>
    </form>
  );
}

export default ItemForm;
