import nodemailer from 'nodemailer'
import type { Config } from './config'

export interface Mail {
  to: string
  subject: string
  text: string
  html?: string
}
export interface Mailer {
  send(mail: Mail): Promise<void>
}

export function createSmtpMailer(config: Config): Mailer {
  const transport = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: false,
    ignoreTLS: true,
  })
  return {
    async send(mail) {
      await transport.sendMail({ from: config.mailFrom, ...mail })
    },
  }
}
