import { environment } from '../../../environments/environment';

export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();
  if (!trimmed) return '';

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed;
  }

  const backendBase = (environment.socketUrl || '').replace(/\/$/, '');

  if (trimmed.includes('localhost:5000') || trimmed.includes('127.0.0.1:5000')) {
    return trimmed.replace(/https?:\/\/(localhost|127\.0\.0\.1):5000/, backendBase);
  }
  if (trimmed.startsWith('/uploads')) {
    return `${backendBase}${trimmed}`;
  }
  if (trimmed.startsWith('uploads/')) {
    return `${backendBase}/${trimmed}`;
  }

  return trimmed;
}
