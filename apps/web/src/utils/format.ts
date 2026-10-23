import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)

export const formatDate = (value: string | null | undefined): string => (value ? dayjs(value).format('MMM D, YYYY') : '—')
export const formatDateTime = (value: string | null | undefined): string => (value ? dayjs(value).format('MMM D, YYYY HH:mm') : '—')
export const fromNow = (value: string | null | undefined): string => (value ? dayjs(value).fromNow() : '—')
export const todayString = (): string => dayjs().format('YYYY-MM-DD')
