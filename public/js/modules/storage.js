/**
 * storage.js — Supabase Storage helpers for image management
 *
 * Handles hero image uploads, URL retrieval, and deletion.
 */

import { supabase } from './api.js';
import { STORAGE_BUCKET } from '../config.js';

/**
 * Upload an image file to Supabase Storage.
 * Returns the public URL of the uploaded file.
 *
 * @param {File}   file      - browser File object
 * @param {string} folder    - storage path prefix (e.g., 'heroes')
 * @returns {Promise<{url: string|null, path: string|null, error: Error|null}>}
 */
export async function uploadImage(file, folder = 'heroes') {
  if (!file) return { url: null, path: null, error: new Error('No file provided') };

  // Validate file type
  const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { url: null, path: null, error: new Error('Invalid file type. Use JPG, PNG, WebP, or GIF.') };
  }

  // Validate file size (5MB max)
  const MAX_SIZE = 5 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return { url: null, path: null, error: new Error('File too large. Maximum size is 5MB.') };
  }

  // Generate unique filename
  const ext      = file.name.split('.').pop().toLowerCase();
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const path     = `${folder}/${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type,
    });

  if (uploadError) {
    return { url: null, path: null, error: uploadError };
  }

  const url = getPublicUrl(path);
  return { url, path, error: null };
}

/**
 * Get the public URL for a storage path.
 * @param {string} path - e.g., 'heroes/image.jpg'
 * @returns {string}
 */
export function getPublicUrl(path) {
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return data?.publicUrl || '';
}

/**
 * Delete an image from storage by its path.
 * @param {string} path
 * @returns {Promise<{error: Error|null}>}
 */
export async function deleteImage(path) {
  if (!path) return { error: null };

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .remove([path]);

  return { error };
}

/**
 * Extract storage path from a full public URL.
 * @param {string} url
 * @returns {string|null}
 */
export function pathFromUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    // Supabase storage URLs contain /storage/v1/object/public/{bucket}/{path}
    const match = parsed.pathname.match(/\/object\/public\/[^/]+\/(.+)$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

// ── Upload Zone UI helper ────────────────────────────────────

/**
 * Initialise a drag-and-drop upload zone.
 *
 * @param {object} opts
 * @param {string}   opts.zoneId       - ID of the drop zone element
 * @param {string}   opts.inputId      - ID of the hidden file input
 * @param {string}   opts.previewWrapId - ID of the preview wrapper div
 * @param {string}   opts.previewImgId  - ID of the preview <img>
 * @param {string}   opts.removeId     - ID of the remove button
 * @param {string}   opts.hiddenInputId - ID of hidden URL input
 * @param {function} [opts.onUpload]   - callback(url, path) on success
 * @param {function} [opts.onError]    - callback(message) on failure
 * @param {function} [opts.onLoading]  - callback(bool) loading state
 */
export function initUploadZone({
  zoneId,
  inputId,
  previewWrapId,
  previewImgId,
  removeId,
  hiddenInputId,
  onUpload,
  onError,
  onLoading,
} = {}) {
  const zone        = document.getElementById(zoneId);
  const fileInput   = document.getElementById(inputId);
  const previewWrap = document.getElementById(previewWrapId);
  const previewImg  = document.getElementById(previewImgId);
  const removeBtn   = document.getElementById(removeId);
  const hiddenInput = document.getElementById(hiddenInputId);

  if (!zone || !fileInput) return;

  // Click to browse
  zone.addEventListener('click', () => fileInput.click());

  // File selected
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (file) await handleFile(file);
  });

  // Drag and drop
  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('dragging');
  });

  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));

  zone.addEventListener('drop', async e => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = e.dataTransfer?.files[0];
    if (file) await handleFile(file);
  });

  // Remove image
  removeBtn?.addEventListener('click', () => {
    if (hiddenInput) hiddenInput.value = '';
    if (previewWrap) previewWrap.style.display = 'none';
    const zoneWrap = document.getElementById(zoneId.replace('Zone', 'ZoneWrap') || 'uploadZoneWrap');
    if (zoneWrap) zoneWrap.style.display = '';
    if (fileInput) fileInput.value = '';
    onUpload?.(null, null);
  });

  async function handleFile(file) {
    onLoading?.(true);

    // Local preview first (instant feedback)
    const localUrl = URL.createObjectURL(file);
    if (previewImg)  previewImg.src = localUrl;
    if (previewWrap) {
      previewWrap.style.display = '';
      const zoneWrap = document.getElementById('uploadZoneWrap');
      if (zoneWrap) zoneWrap.style.display = 'none';
    }

    // Upload to Supabase Storage
    const { url, path, error } = await uploadImage(file);

    onLoading?.(false);

    if (error) {
      // Revert preview
      if (previewWrap) previewWrap.style.display = 'none';
      const zoneWrap = document.getElementById('uploadZoneWrap');
      if (zoneWrap) zoneWrap.style.display = '';
      URL.revokeObjectURL(localUrl);
      onError?.(error.message);
      return;
    }

    // Update with real URL
    if (previewImg) previewImg.src = url;
    if (hiddenInput) hiddenInput.value = url;
    URL.revokeObjectURL(localUrl);
    onUpload?.(url, path);
  }
}
