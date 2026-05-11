import crypto from 'crypto'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo non consentito' })
  }

  try {
    const { publicId } = req.body || {}

    if (!publicId) {
      return res.status(400).json({ error: 'publicId mancante' })
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME
    const apiKey = process.env.CLOUDINARY_API_KEY
    const apiSecret = process.env.CLOUDINARY_API_SECRET

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({ error: 'Variabili Cloudinary mancanti' })
    }

    const timestamp = Math.floor(Date.now() / 1000)
    const signatureBase = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`
    const signature = crypto.createHash('sha1').update(signatureBase).digest('hex')

    const formData = new URLSearchParams()
    formData.append('public_id', publicId)
    formData.append('timestamp', String(timestamp))
    formData.append('api_key', apiKey)
    formData.append('signature', signature)

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'Errore Cloudinary',
      })
    }

    return res.status(200).json(data)
  } catch (error) {
    return res.status(500).json({
      error: error?.message || 'Errore interno server',
    })
  }
}