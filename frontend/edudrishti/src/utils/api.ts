/**
 * API base URL utility.
 * - Local dev:  empty string → Vite proxy forwards /api → http://localhost:8000
 * - Production: VITE_API_URL env variable → https://your-backend.onrender.com
 */
export const API_BASE = import.meta.env.VITE_API_URL || '';

export const apiUrl = (path: string) => `${API_BASE}${path}`;
