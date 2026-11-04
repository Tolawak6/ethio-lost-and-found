import { useEffect, useRef, useState } from 'react';

const EMPTY = {
  itemName: '',
  category: '',
  description: '',
  identifyingDetails: '',
  agency: 'Anbessa City Bus',
  plateNumber: '',
  busCode: '',
  route: '',
  foundOnBoard: '',
  foundAt: new Date().toISOString().slice(0, 10),
  reportedBy: '',
  storageOffice: 'Lost Property Office, Merkato',
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const toFormValues = (item) => {
  if (!item) return EMPTY;
  const values = Object.fromEntries(Object.keys(EMPTY).map((key) => [key, item[key] ?? EMPTY[key]]));
  return {
    ...EMPTY,
    ...values,
    foundAt: (item.foundAt || item.createdAt || EMPTY.foundAt).slice(0, 10),
    identifyingDetails: item.identifyingDetails || '',
  };
};

function ItemForm({ categories, agencies, initialItem, onSubmit, onCancel, submitting }) {
  const [values, setValues] = useState(() => toFormValues(initialItem));
  const [errors, setErrors] = useState({});
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(initialItem?.imageUrl || '');
  const fileInput = useRef(null);

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
    if (!values.description.trim()) next.description = 'Describe the item';
    if (!values.plateNumber.trim()) next.plateNumber = 'Bus plate number is required';
    if (!values.foundAt) next.foundAt = 'Date found is required';
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
      <div className="form__section">
        <h4>The item</h4>
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
        </div>

        <label className="field">
          <span>Description *</span>
          <textarea
            name="description"
            rows={3}
            value={values.description}
            onChange={change}
            placeholder="Colour, brand, condition, contents — what a passenger would recognise"
            maxLength={2000}
            aria-invalid={Boolean(errors.description)}
          />
          <em className="field__hint">{values.description.length}/2000</em>
          {errors.description && <em className="field__error">{errors.description}</em>}
        </label>

        <label className="field">
          <span>Identifying details (staff only)</span>
          <textarea
            name="identifyingDetails"
            rows={2}
            value={values.identifyingDetails}
            onChange={change}
            placeholder="Details only the owner would know, e.g. ID name, marks, lock screen"
            maxLength={300}
          />
          <em className="field__hint">Never shown publicly — used to verify claims.</em>
        </label>
      </div>

      <div className="form__section">
        <h4>Where it was found</h4>
        <div className="form__grid">
          <label className="field">
            <span>Bus plate number *</span>
            <input
              name="plateNumber"
              value={values.plateNumber}
              onChange={change}
              placeholder="AA-3-12345"
              maxLength={20}
              aria-invalid={Boolean(errors.plateNumber)}
            />
            {errors.plateNumber && <em className="field__error">{errors.plateNumber}</em>}
          </label>

          <label className="field">
            <span>Bus code</span>
            <input name="busCode" value={values.busCode} onChange={change} placeholder="B-118" maxLength={20} />
          </label>

          <label className="field">
            <span>Agency</span>
            <select name="agency" value={values.agency} onChange={change}>
              {agencies.map((agency) => (
                <option key={agency} value={agency}>
                  {agency}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Route</span>
            <input
              name="route"
              value={values.route}
              onChange={change}
              placeholder="Merkato – Bole"
              maxLength={120}
            />
          </label>

          <label className="field">
            <span>Date found *</span>
            <input
              type="date"
              name="foundAt"
              value={values.foundAt}
              onChange={change}
              max={new Date().toISOString().slice(0, 10)}
              aria-invalid={Boolean(errors.foundAt)}
            />
            {errors.foundAt && <em className="field__error">{errors.foundAt}</em>}
          </label>

          <label className="field">
            <span>Found on board</span>
            <input
              name="foundOnBoard"
              value={values.foundOnBoard}
              onChange={change}
              placeholder="Back seat, under seat 12…"
              maxLength={60}
            />
          </label>

          <label className="field">
            <span>Reported by</span>
            <input
              name="reportedBy"
              value={values.reportedBy}
              onChange={change}
              placeholder="Supervisor name"
              maxLength={80}
            />
          </label>

          <label className="field">
            <span>Storage office</span>
            <input
              name="storageOffice"
              value={values.storageOffice}
              onChange={change}
              maxLength={120}
            />
          </label>
        </div>
      </div>

      <div className="form__section">
        <h4>Photo</h4>
        <div className="uploader">
          {preview ? (
            <img className="uploader__preview" src={preview} alt="Item preview" />
          ) : (
            <div className="uploader__placeholder">No photo</div>
          )}
          <div className="uploader__controls">
            <label className="button button--ghost button--sm">
              {file ? 'Change photo' : 'Choose photo'}
              <input ref={fileInput} type="file" accept="image/*" onChange={pickFile} className="sr-only" />
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

      <div className="form__actions">
        <button type="button" className="button button--ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Saving…' : initialItem ? 'Save changes' : 'Add to register'}
        </button>
      </div>
    </form>
  );
}

export default ItemForm;
