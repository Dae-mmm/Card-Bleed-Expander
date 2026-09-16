import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'

const TO_EMAIL = 'd.mammoli.design+feedback@gmail.com'
const MAX_MESSAGE = 5000
const MAX_FIELD = 200

type FeedbackBody = {
  message?: unknown
  name?: unknown
  contact?: unknown
  /** Honeypot — must stay empty */
  website?: unknown
}

function asTrimmedString(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, max)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = process.env.GMAIL_USER?.trim()
  const pass = process.env.GMAIL_APP_PASSWORD?.trim()
  if (!user || !pass) {
    return res.status(500).json({ error: 'Feedback is not configured' })
  }

  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as FeedbackBody

  // Silent success for bots filling the honeypot
  if (asTrimmedString(body.website, MAX_FIELD)) {
    return res.status(200).json({ ok: true })
  }

  const message = asTrimmedString(body.message, MAX_MESSAGE)
  const name = asTrimmedString(body.name, MAX_FIELD)
  const contact = asTrimmedString(body.contact, MAX_FIELD)

  if (message.length < 5) {
    return res.status(400).json({ error: 'Message is too short' })
  }

  const lines = [
    name ? `Name: ${name}` : null,
    contact ? `Contact: ${contact}` : null,
    '',
    message,
  ].filter((line) => line !== null)

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    })

    await transporter.sendMail({
      from: `Card Bleed Expander <${user}>`,
      to: TO_EMAIL,
      replyTo: contact && contact.includes('@') ? contact : undefined,
      subject: `Card Bleed feedback${name ? ` — ${name}` : ''}`,
      text: lines.join('\n'),
    })

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('Feedback handler error', err)
    return res.status(500).json({ error: 'Failed to send feedback' })
  }
}
