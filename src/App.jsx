import './App.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Routes, Route, useNavigate, useParams } from 'react-router-dom'
import PhotoCard from './components/PhotoCard'
import StatCard from './components/StatCard'
import { formatFileSize, slugify } from './utils/photoUtils'
import { supabase } from './services/supabase'

const CLOUD_NAME = 'dcf9xe0rk'
const UPLOAD_PRESET = 'photo_share'
const CLOUDINARY_FOLDER = 'photo-share'

function GalleryPage() {
  const params = useParams()
  const navigate = useNavigate()
  const initialSlug = params.slug || 'ricordi-piu-belli'
  const initialAlbumName = initialSlug.replace(/-/g, ' ')

  const [albumName, setAlbumName] = useState(initialAlbumName)
  const [search, setSearch] = useState('')
  const [photos, setPhotos] = useState([])
  const [selectedIds, setSelectedIds] = useState([])
  const [sortBy, setSortBy] = useState('newest')
  const [viewMode, setViewMode] = useState('cozy')
  const [linkCopied, setLinkCopied] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const fileInputRef = useRef(null)

  const albumSlug = useMemo(() => {
    return slugify(albumName || initialAlbumName || 'album')
  }, [albumName, initialAlbumName])

  const shareLink = useMemo(() => {
    return `${window.location.origin}/album/${albumSlug || 'album-demo'}`
  }, [albumSlug])

  useEffect(() => {
    if (params.slug) {
      setAlbumName(params.slug.replace(/-/g, ' '))
    }
  }, [params.slug])

  async function getOrCreateAlbum() {
    const slug = slugify(albumName || 'album')

    const { data: existingAlbum, error: findError } = await supabase
      .from('Albums')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (findError) throw findError
    if (existingAlbum) return existingAlbum

    const { data: newAlbum, error: insertError } = await supabase
      .from('Albums')
      .insert([
        {
          name: albumName,
          slug,
        },
      ])
      .select()
      .single()

    if (insertError) throw insertError

    return newAlbum
  }

  async function savePhotoToDatabase(albumId, photo) {
    const { error } = await supabase.from('Photos').insert([
      {
        album_id: albumId,
        name: photo.name,
        image_url: photo.url,
        public_id: photo.publicId,
      },
    ])

    if (error) throw error
  }

  async function loadPhotosFromDatabase(currentSlug) {
    try {
      const slug = currentSlug || slugify(albumName || 'album')

      const { data: album, error: albumError } = await supabase
        .from('Albums')
        .select('*')
        .eq('slug', slug)
        .maybeSingle()

      if (albumError) throw albumError

      if (!album) {
        setPhotos([])
        return
      }

      if (album.name && album.name !== albumName) {
        setAlbumName(album.name)
      }

      const { data: photoRows, error: photosError } = await supabase
        .from('Photos')
        .select('*')
        .eq('album_id', album.id)
        .order('created_at', { ascending: false })

      if (photosError) throw photosError

      const mappedPhotos = (photoRows || []).map((photo, index) => ({
        id: photo.id || `${photo.public_id}-${index}`,
        name: photo.name,
        size: 0,
        sizeLabel: '-',
        type: 'image/*',
        createdAt: photo.created_at ? new Date(photo.created_at).getTime() : Date.now(),
        url: photo.image_url,
        publicId: photo.public_id,
      }))

      setPhotos(mappedPhotos)
    } catch (error) {
      console.error('ERRORE LETTURA SUPABASE:', error)
    }
  }

  async function uploadFilesToCloudinary(fileList) {
    const files = Array.from(fileList || []).filter((file) =>
      file.type.startsWith('image/')
    )

    if (files.length === 0) return

    setIsUploading(true)

    try {
      const album = await getOrCreateAlbum()

      const uploadedPhotos = await Promise.all(
        files.map(async (file, index) => {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('upload_preset', UPLOAD_PRESET)
          formData.append('folder', CLOUDINARY_FOLDER)

          const response = await fetch(
            `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
            {
              method: 'POST',
              body: formData,
            }
          )

          const data = await response.json()

          if (!response.ok) {
            throw new Error(data?.error?.message || 'Errore upload Cloudinary')
          }

          const photoObject = {
            id: `${Date.now()}-${index}-${file.name}`,
            name: file.name,
            size: file.size,
            sizeLabel: formatFileSize(file.size),
            type: file.type,
            createdAt: Date.now() + index,
            url: data.secure_url,
            publicId: data.public_id,
          }

          await savePhotoToDatabase(album.id, photoObject)

          return photoObject
        })
      )

      setPhotos((prev) => [...uploadedPhotos, ...prev])
    } catch (error) {
      console.error('ERRORE CLOUDINARY/SUPABASE:', error)
      alert(`Caricamento fallito: ${error?.message || 'errore sconosciuto'}`)
    } finally {
      setIsUploading(false)
    }
  }

  function handleInputChange(event) {
    uploadFilesToCloudinary(event.target.files)
    event.target.value = ''
  }

  function handleAlbumNameChange(event) {
    const newName = event.target.value
    setAlbumName(newName)
  }

  function applyAlbumName() {
    const newSlug = slugify(albumName || 'album')
    navigate(`/album/${newSlug}`)
  }

  function toggleSelect(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  function selectAllFiltered() {
    const ids = filteredAndSortedPhotos.map((photo) => photo.id)
    setSelectedIds(ids)
  }

  function clearSelection() {
    setSelectedIds([])
  }

  function removePhoto(id) {
    setPhotos((prev) => prev.filter((photo) => photo.id !== id))
    setSelectedIds((prev) => prev.filter((item) => item !== id))
  }

  function removeSelected() {
    if (selectedIds.length === 0) return
    setPhotos((prev) => prev.filter((photo) => !selectedIds.includes(photo.id)))
    setSelectedIds([])
  }

  function downloadPhoto(photo) {
    const a = document.createElement('a')
    a.href = photo.url
    a.download = photo.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  function downloadSelected() {
    const selectedPhotos = filteredAndSortedPhotos.filter((photo) =>
      selectedIds.includes(photo.id)
    )

    if (selectedPhotos.length === 0) {
      alert('Seleziona almeno una foto prima di scaricare.')
      return
    }

    selectedPhotos.forEach((photo, index) => {
      setTimeout(() => {
        downloadPhoto(photo)
      }, index * 250)
    })
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 1500)
    } catch (error) {
      alert('Non sono riuscito a copiare il link.')
    }
  }

  useEffect(() => {
    if (params.slug) {
      loadPhotosFromDatabase(params.slug)
    }
  }, [params.slug])

  const filteredPhotos = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return photos
    return photos.filter((photo) => photo.name.toLowerCase().includes(q))
  }, [photos, search])

  const filteredAndSortedPhotos = useMemo(() => {
    const list = [...filteredPhotos]

    switch (sortBy) {
      case 'name-asc':
        list.sort((a, b) => a.name.localeCompare(b.name))
        break
      case 'name-desc':
        list.sort((a, b) => b.name.localeCompare(a.name))
        break
      case 'size-asc':
        list.sort((a, b) => a.size - b.size)
        break
      case 'size-desc':
        list.sort((a, b) => b.size - a.size)
        break
      case 'oldest':
        list.sort((a, b) => a.createdAt - b.createdAt)
        break
      case 'newest':
      default:
        list.sort((a, b) => b.createdAt - a.createdAt)
        break
    }

    return list
  }, [filteredPhotos, sortBy])

  const totalSize = useMemo(() => {
    return photos.reduce((sum, photo) => sum + photo.size, 0)
  }, [photos])

  const selectedCount = selectedIds.length

  return (
    <div className="page">
      <div className="background-orb background-orb-1"></div>
      <div className="background-orb background-orb-2"></div>
      <div className="background-orb background-orb-3"></div>
      <div className="background-grid"></div>

      <div className="container">
        <header className="hero">
          <div className="hero-text">
            <span className="hero-chip">Galleria privata per ubriaiconi</span>
            <h1>Nino Gallery</h1>
            <p>
              Uno spazio elegante dove raccogliere, organizzare e condividere
              le serate dei rimasti.
            </p>
          </div>

          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? 'Caricamento...' : 'Aggiungi fotografie'}
            </button>

            <button className="secondary-button" onClick={copyLink}>
              {linkCopied ? 'Link copiato' : 'Copia collegamento'}
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={handleInputChange}
            />
          </div>
        </header>

        <section className="dashboard-grid-single">
          <div className="sidebar-card glass-card">
            <div className="section-title-row">
              <div>
                <h2>Panoramica raccolta</h2>
                <p className="section-subtitle">
                  Personalizza il titolo dell’album e tieni sotto controllo i
                  dati essenziali della tua selezione.
                </p>
              </div>
            </div>

            <label className="field-label">Titolo raccolta</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                className="text-input"
                type="text"
                value={albumName}
                onChange={handleAlbumNameChange}
                placeholder="Inserisci il titolo del tuo album"
                style={{ flex: 1, marginBottom: 0 }}
              />
              <button className="secondary-button" onClick={applyAlbumName}>
                Apri album
              </button>
            </div>

            <div className="info-box">
              <strong>Collegamento condivisibile</strong>
              <p>{shareLink}</p>
            </div>

            <div className="stats">
              <StatCard value={photos.length} label="scatti totali" />
              <StatCard value={filteredAndSortedPhotos.length} label="in vista" />
              <StatCard value={selectedCount} label="in selezione" />
              <StatCard value={formatFileSize(totalSize)} label="archivio" />
            </div>
          </div>
        </section>

        <section className="toolbar glass-card">
          <div className="toolbar-left">
            <input
              className="text-input search-input"
              type="text"
              placeholder="Cerca per nome file..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select
              className="select-input"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="newest">Più recenti</option>
              <option value="oldest">Più datate</option>
              <option value="name-asc">Nome A-Z</option>
              <option value="name-desc">Nome Z-A</option>
              <option value="size-asc">Peso crescente</option>
              <option value="size-desc">Peso decrescente</option>
            </select>

            <select
              className="select-input"
              value={viewMode}
              onChange={(e) => setViewMode(e.target.value)}
            >
              <option value="cozy">Vista elegante</option>
              <option value="compact">Vista compatta</option>
            </select>
          </div>

          <div className="toolbar-right">
            <button className="secondary-button" onClick={selectAllFiltered}>
              Seleziona visibili
            </button>

            <button className="secondary-button" onClick={clearSelection}>
              Annulla selezione
            </button>

            <button className="secondary-button danger-soft" onClick={removeSelected}>
              Rimuovi selezionate
            </button>

            <button className="primary-button" onClick={downloadSelected}>
              Scarica selezionate
            </button>
          </div>
        </section>

        <section className="gallery-card glass-card">
          <div className="gallery-header">
            <div>
              <h2>{albumName}</h2>
              <p>
                {filteredAndSortedPhotos.length} fotografie visualizzate su{' '}
                {photos.length}
              </p>
            </div>

            <div className="gallery-badges">
              <span className="mini-badge">stile premium</span>
              <span className="mini-badge">selezione rapida</span>
              <span className="mini-badge">upload multiplo</span>
            </div>
          </div>

          {filteredAndSortedPhotos.length === 0 ? (
            <div className="empty-state">
              <h3>Nessuna fotografia presente</h3>
              <p>Aggiungi immagini oppure modifica i filtri di ricerca.</p>
            </div>
          ) : (
            <div
              className={`gallery-grid ${
                viewMode === 'compact' ? 'gallery-grid-compact' : ''
              }`}
            >
              {filteredAndSortedPhotos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  selected={selectedIds.includes(photo.id)}
                  onToggleSelect={toggleSelect}
                  onDownload={downloadPhoto}
                  onRemove={removePhoto}
                  viewMode={viewMode}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<GalleryPage />} />
      <Route path="/album/:slug" element={<GalleryPage />} />
    </Routes>
  )
}

export default App