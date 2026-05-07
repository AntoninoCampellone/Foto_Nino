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
const ADMIN_PASSWORD = 'Liberata'
const ADMIN_SESSION_KEY = 'foto_nino_admin_auth'

function mapPhotoRows(photoRows) {
  return (photoRows || []).map((photo, index) => ({
    id: photo.id,
    name: photo.name,
    size: 0,
    sizeLabel: '-',
    type: 'image/*',
    createdAt: photo.created_at ? new Date(photo.created_at).getTime() : Date.now(),
    url: photo.image_url,
    publicId: photo.public_id || `${photo.id}-${index}`,
  }))
}

function AdminLogin({ onSuccess }) {
  const [password, setPassword] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  function handleSubmit(event) {
    event.preventDefault()

    if (password === ADMIN_PASSWORD) {
      localStorage.setItem(ADMIN_SESSION_KEY, 'true')
      onSuccess()
      return
    }

    setErrorMessage('Password non corretta.')
  }

  return (
    <div className="page">
      <div className="background-orb background-orb-1"></div>
      <div className="background-orb background-orb-2"></div>
      <div className="background-orb background-orb-3"></div>
      <div className="background-grid"></div>

      <div className="container">
        <div className="sidebar-card glass-card" style={{ maxWidth: '520px', margin: '80px auto 0' }}>
          <div className="section-title-row">
            <div>
              <h2>Accesso area admin</h2>
              <p className="section-subtitle">
                Inserisci la password per gestire album e fotografie.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <label className="field-label">Password admin</label>
            <input
              className="text-input"
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errorMessage) setErrorMessage('')
              }}
              placeholder="Inserisci la password"
            />

            {errorMessage && (
              <div className="info-box" style={{ marginTop: 0 }}>
                <strong>Errore</strong>
                <p>{errorMessage}</p>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="primary-button" type="submit">
                Entra
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function AdminPage() {
  const [albums, setAlbums] = useState([])
  const [selectedAlbumSlug, setSelectedAlbumSlug] = useState('')
  const [newAlbumName, setNewAlbumName] = useState('')
  const [photos, setPhotos] = useState([])
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [sortBy, setSortBy] = useState('newest')
  const [viewMode, setViewMode] = useState('cozy')
  const [linkCopied, setLinkCopied] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const fileInputRef = useRef(null)
  const navigate = useNavigate()

  const selectedAlbum = useMemo(() => {
    return albums.find((album) => album.slug === selectedAlbumSlug) || null
  }, [albums, selectedAlbumSlug])

  const shareLink = useMemo(() => {
    if (!selectedAlbumSlug) return `${window.location.origin}/album`
    return `${window.location.origin}/album/${selectedAlbumSlug}`
  }, [selectedAlbumSlug])

  function handleLogout() {
    localStorage.removeItem(ADMIN_SESSION_KEY)
    navigate('/')
    window.location.reload()
  }

  async function loadAlbumsFromDatabase() {
    const { data, error } = await supabase
      .from('Albums')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('ERRORE LETTURA ALBUMS:', error)
      return
    }

    const loadedAlbums = data || []
    setAlbums(loadedAlbums)

    if (!selectedAlbumSlug && loadedAlbums.length > 0) {
      setSelectedAlbumSlug(loadedAlbums[0].slug)
    }
  }

  async function loadPhotosFromDatabaseBySlug(slug) {
    try {
      if (!slug) {
        setPhotos([])
        return
      }

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

      const { data: photoRows, error: photosError } = await supabase
        .from('Photos')
        .select('*')
        .eq('album_id', album.id)
        .order('created_at', { ascending: false })

      if (photosError) throw photosError

      setPhotos(mapPhotoRows(photoRows))
    } catch (error) {
      console.error('ERRORE LETTURA PHOTOS:', error)
    }
  }

  async function getAlbumBySlug(slug) {
    const { data, error } = await supabase
      .from('Albums')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (error) throw error
    return data
  }

  async function createAlbum() {
    const trimmedName = newAlbumName.trim()

    if (!trimmedName) {
      alert('Inserisci un nome album.')
      return
    }

    setIsCreatingAlbum(true)

    try {
      const slug = slugify(trimmedName)
      const existing = await getAlbumBySlug(slug)

      if (existing) {
        setSelectedAlbumSlug(existing.slug)
        setNewAlbumName('')
        return
      }

      const { data, error } = await supabase
        .from('Albums')
        .insert([
          {
            name: trimmedName,
            slug,
          },
        ])
        .select()
        .single()

      if (error) throw error

      const updatedAlbums = [data, ...albums]
      setAlbums(updatedAlbums)
      setSelectedAlbumSlug(data.slug)
      setNewAlbumName('')
    } catch (error) {
      console.error('ERRORE CREAZIONE ALBUM:', error)
      alert(`Creazione album fallita: ${error?.message || 'errore sconosciuto'}`)
    } finally {
      setIsCreatingAlbum(false)
    }
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

  async function deletePhotoFromDatabase(photoId) {
    const { error } = await supabase.from('Photos').delete().eq('id', photoId)

    if (error) throw error
  }

  async function removePhoto(photoId) {
    const confirmed = window.confirm('Vuoi davvero rimuovere questa foto?')

    if (!confirmed) return

    setIsDeleting(true)

    try {
      await deletePhotoFromDatabase(photoId)
      setPhotos((prev) => prev.filter((photo) => photo.id !== photoId))
      setSelectedIds((prev) => prev.filter((id) => id !== photoId))
    } catch (error) {
      console.error('ERRORE RIMOZIONE FOTO:', error)
      alert(`Rimozione fallita: ${error?.message || 'errore sconosciuto'}`)
    } finally {
      setIsDeleting(false)
    }
  }

  async function removeSelected() {
    if (selectedIds.length === 0) return

    const confirmed = window.confirm(
      `Vuoi davvero rimuovere ${selectedIds.length} foto selezionate?`
    )

    if (!confirmed) return

    setIsDeleting(true)

    try {
      const { error } = await supabase.from('Photos').delete().in('id', selectedIds)

      if (error) throw error

      setPhotos((prev) => prev.filter((photo) => !selectedIds.includes(photo.id)))
      setSelectedIds([])
    } catch (error) {
      console.error('ERRORE RIMOZIONE FOTO MULTIPLA:', error)
      alert(`Rimozione fallita: ${error?.message || 'errore sconosciuto'}`)
    } finally {
      setIsDeleting(false)
    }
  }

  async function uploadFilesToCloudinary(fileList) {
    if (!selectedAlbum) {
      alert('Seleziona o crea prima un album.')
      return
    }

    const files = Array.from(fileList || []).filter((file) =>
      file.type.startsWith('image/')
    )

    if (files.length === 0) return

    setIsUploading(true)

    try {
      const uploadedPhotos = await Promise.all(
        files.map(async (file, index) => {
          const formData = new FormData()
          formData.append('file', file)
          formData.append('upload_preset', UPLOAD_PRESET)
          formData.append('folder', `${CLOUDINARY_FOLDER}/${selectedAlbum.slug}`)

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

          await savePhotoToDatabase(selectedAlbum.id, photoObject)

          return photoObject
        })
      )

      await loadPhotosFromDatabaseBySlug(selectedAlbum.slug)
      setPhotos((prev) => {
        const merged = [...uploadedPhotos, ...prev]
        const seen = new Set()
        return merged.filter((photo) => {
          if (seen.has(photo.id)) return false
          seen.add(photo.id)
          return true
        })
      })
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
    loadAlbumsFromDatabase()
  }, [])

  useEffect(() => {
    loadPhotosFromDatabaseBySlug(selectedAlbumSlug)
    setSelectedIds([])
  }, [selectedAlbumSlug])

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
            <span className="hero-chip">Area admin privata</span>
            <h1>Nino Gallery Admin</h1>
            <p>
              Qui puoi creare album, caricare fotografie e copiare il link
              pubblico da condividere con gli altri.
            </p>
          </div>

          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isDeleting || !selectedAlbum}
            >
              {isUploading ? 'Caricamento...' : 'Aggiungi fotografie'}
            </button>

            <button className="secondary-button" onClick={copyLink}>
              {linkCopied ? 'Link copiato' : 'Copia collegamento'}
            </button>

            <button className="secondary-button" onClick={handleLogout}>
              Esci
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
                <h2>Gestione album</h2>
                <p className="section-subtitle">
                  Seleziona un album esistente oppure creane uno nuovo.
                </p>
              </div>
            </div>

            <label className="field-label">Album esistenti</label>
            <select
              className="select-input"
              value={selectedAlbumSlug}
              onChange={(e) => setSelectedAlbumSlug(e.target.value)}
            >
              {albums.length === 0 ? (
                <option value="">Nessun album disponibile</option>
              ) : (
                albums.map((album) => (
                  <option key={album.id} value={album.slug}>
                    {album.name}
                  </option>
                ))
              )}
            </select>

            <div style={{ height: '16px' }}></div>

            <label className="field-label">Nuovo album</label>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <input
                className="text-input"
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder="Nome nuovo album"
                style={{ flex: 1, marginBottom: 0 }}
              />
              <button
                className="secondary-button"
                onClick={createAlbum}
                disabled={isCreatingAlbum}
              >
                {isCreatingAlbum ? 'Creazione...' : 'Crea album'}
              </button>
            </div>

            <div className="info-box">
              <strong>Collegamento pubblico</strong>
              <p>{shareLink}</p>
            </div>

            <div className="stats">
              <StatCard value={albums.length} label="album totali" />
              <StatCard value={photos.length} label="foto album" />
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

            <button
              className="secondary-button danger-soft"
              onClick={removeSelected}
              disabled={isDeleting}
            >
              {isDeleting ? 'Rimozione...' : 'Rimuovi selezionate'}
            </button>

            <button className="primary-button" onClick={downloadSelected}>
              Scarica selezionate
            </button>
          </div>
        </section>

        <section className="gallery-card glass-card">
          <div className="gallery-header">
            <div>
              <h2>{selectedAlbum?.name || 'Nessun album selezionato'}</h2>
              <p>
                {filteredAndSortedPhotos.length} fotografie visualizzate su{' '}
                {photos.length}
              </p>
            </div>

            <div className="gallery-badges">
              <span className="mini-badge">admin</span>
              <span className="mini-badge">upload multiplo</span>
              <span className="mini-badge">gestione album</span>
            </div>
          </div>

          {filteredAndSortedPhotos.length === 0 ? (
            <div className="empty-state">
              <h3>Nessuna fotografia presente</h3>
              <p>Seleziona un album oppure carica nuove immagini.</p>
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

function PublicGalleryPage() {
  const { slug } = useParams()
  const navigate = useNavigate()

  const [albums, setAlbums] = useState([])
  const [selectedAlbumSlug, setSelectedAlbumSlug] = useState(slug || '')
  const [photos, setPhotos] = useState([])
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState([])
  const [sortBy, setSortBy] = useState('newest')
  const [viewMode, setViewMode] = useState('cozy')

  const selectedAlbum = useMemo(() => {
    return albums.find((album) => album.slug === selectedAlbumSlug) || null
  }, [albums, selectedAlbumSlug])

  async function loadAlbumsFromDatabase() {
    const { data, error } = await supabase
      .from('Albums')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('ERRORE LETTURA ALBUMS:', error)
      return
    }

    const loadedAlbums = data || []
    setAlbums(loadedAlbums)

    if (!slug && loadedAlbums.length > 0) {
      setSelectedAlbumSlug(loadedAlbums[0].slug)
    }
  }

  async function loadPhotosFromDatabaseBySlug(currentSlug) {
    try {
      if (!currentSlug) {
        setPhotos([])
        return
      }

      const { data: album, error: albumError } = await supabase
        .from('Albums')
        .select('*')
        .eq('slug', currentSlug)
        .maybeSingle()

      if (albumError) throw albumError

      if (!album) {
        setPhotos([])
        return
      }

      const { data: photoRows, error: photosError } = await supabase
        .from('Photos')
        .select('*')
        .eq('album_id', album.id)
        .order('created_at', { ascending: false })

      if (photosError) throw photosError

      setPhotos(mapPhotoRows(photoRows))
    } catch (error) {
      console.error('ERRORE LETTURA PHOTOS:', error)
    }
  }

  function handleAlbumChange(event) {
    const newSlug = event.target.value
    setSelectedAlbumSlug(newSlug)

    if (newSlug) {
      navigate(`/album/${newSlug}`)
    } else {
      navigate('/')
    }
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

  useEffect(() => {
    loadAlbumsFromDatabase()
  }, [])

  useEffect(() => {
    setSelectedAlbumSlug(slug || '')
  }, [slug])

  useEffect(() => {
    loadPhotosFromDatabaseBySlug(selectedAlbumSlug)
    setSelectedIds([])
  }, [selectedAlbumSlug])

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
        </header>

        <section className="dashboard-grid-single">
          <div className="sidebar-card glass-card">
            <div className="section-title-row">
              <div>
                <h2>Seleziona album</h2>
                <p className="section-subtitle">
                  Scegli uno degli album disponibili dal menù a tendina.
                </p>
              </div>
            </div>

            <label className="field-label">Album disponibili</label>
            <select
              className="select-input"
              value={selectedAlbumSlug}
              onChange={handleAlbumChange}
            >
              {albums.length === 0 ? (
                <option value="">Nessun album disponibile</option>
              ) : (
                <>
                  {!selectedAlbumSlug && <option value="">Seleziona album</option>}
                  {albums.map((album) => (
                    <option key={album.id} value={album.slug}>
                      {album.name}
                    </option>
                  ))}
                </>
              )}
            </select>

            <div className="stats" style={{ marginTop: '18px' }}>
              <StatCard value={albums.length} label="album totali" />
              <StatCard value={photos.length} label="foto album" />
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

            <button className="primary-button" onClick={downloadSelected}>
              Scarica selezionate
            </button>
          </div>
        </section>

        <section className="gallery-card glass-card">
          <div className="gallery-header">
            <div>
              <h2>{selectedAlbum?.name || 'Nessun album selezionato'}</h2>
              <p>
                {filteredAndSortedPhotos.length} fotografie visualizzate su{' '}
                {photos.length}
              </p>
            </div>

            <div className="gallery-badges">
              <span className="mini-badge">album pubblico</span>
              <span className="mini-badge">selezione rapida</span>
              <span className="mini-badge">download</span>
            </div>
          </div>

          {filteredAndSortedPhotos.length === 0 ? (
            <div className="empty-state">
              <h3>Nessuna fotografia presente</h3>
              <p>Seleziona un album dal menù a tendina per vedere le foto.</p>
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
                  onRemove={null}
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

function AdminRouteWrapper() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    localStorage.getItem(ADMIN_SESSION_KEY) === 'true'
  )

  if (!isAuthenticated) {
    return <AdminLogin onSuccess={() => setIsAuthenticated(true)} />
  }

  return <AdminPage />
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicGalleryPage />} />
      <Route path="/album/:slug" element={<PublicGalleryPage />} />
      <Route path="/admin" element={<AdminRouteWrapper />} />
    </Routes>
  )
}

export default App