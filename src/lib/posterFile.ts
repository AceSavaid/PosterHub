// Reading and writing PosterHub project files (`.poster.json`). Shared by the
// "Export project file" button and the desktop app's on-disk library.
import type { Poster } from '../types';
import { sanitizePoster } from './sanitize';
import { sanitizeNotes } from './notes';

export const FILE_EXT = '.poster.json';

export function safeFileName(name: string) {
  return (name || 'poster').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'poster';
}

export function posterToText(p: Poster, opts: { keepThumbnail?: boolean } = {}) {
  const { thumbnail, ...rest } = p;
  const data = opts.keepThumbnail && thumbnail ? { ...rest, thumbnail } : rest;
  return JSON.stringify({ app: 'posterhub', ...data }, null, 1);
}

export function parsePosterText(text: string): Poster {
  const data = JSON.parse(text);
  if (!data || typeof data !== 'object' || !Array.isArray(data.elements) || !data.width || !data.height) {
    throw new Error('This file is not a PosterHub project.');
  }
  delete data.app;
  // Review notes come from other people's files: keep only clean, plain-text notes.
  if (data.notes !== undefined) data.notes = sanitizeNotes(data.notes, { width: data.width, height: data.height });
  return sanitizePoster(data as Poster);
}
