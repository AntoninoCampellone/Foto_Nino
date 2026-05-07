function PhotoCard({
  photo,
  selected,
  onToggleSelect,
  onDownload,
  onRemove,
  viewMode,
}) {
  return (
    <div className={`photo-card ${selected ? 'photo-card-selected' : ''}`}>
      <div className="photo-topbar">
        <label className="select-badge">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(photo.id)}
          />
          <span>{selected ? 'Selezionata' : 'Seleziona'}</span>
        </label>
      </div>

      <div
        className={`photo-image-wrapper ${
          viewMode === 'compact' ? 'photo-image-wrapper-compact' : ''
        }`}
      >
        <img src={photo.url} alt={photo.name} className="photo-image" />
      </div>

      <div className="photo-content">
        <h3 title={photo.name}>{photo.name}</h3>
        <div className="photo-meta">
          <span>{photo.sizeLabel}</span>
          <span>{new Date(photo.createdAt).toLocaleString()}</span>
        </div>
      </div>

      <div className="photo-actions">
        <button className="download-button" onClick={() => onDownload(photo)}>
          Scarica
        </button>

        {onRemove && (
          <button className="delete-button" onClick={() => onRemove(photo.id)}>
            Rimuovi
          </button>
        )}
      </div>
    </div>
  )
}

export default PhotoCard