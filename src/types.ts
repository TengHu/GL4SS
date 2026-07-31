/**
 * Shared types for The Looking Glass.
 *
 * Originally these lived inline in the v1 dashboard component; extracted so library code
 * (history persistence, sharing, future video/3D modules) can reuse them
 * without circular imports.
 */

export type ViewMode = 'wide-field' | 'chrono-selfie' | 'cinematic';

export type AppStatus =
  | 'idle'
  | 'targeting'
  | 'generating'
  | 'scanning'
  | 'rendering-video'
  | 'complete'
  | 'error';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface JumpPoint {
  id: string;
  name: string;
  year: number;
  coordinates: Coordinates;
  description?: string;
}

export interface GeneratedView {
  id: string;
  timestamp: number;
  location: string;
  coordinates: Coordinates;
  year: number;
  mode: ViewMode;
  /** For wide-field / chrono-selfie: 3 image URLs. Empty in cinematic mode. */
  panels: string[];
  /** For cinematic mode: a single video URL (mp4). */
  videoUrl?: string;
  /** Optional poster frame for video modes — defaults to panels[0] if present. */
  posterUrl?: string;
  /** If the user ran ANIMATE: parallel array of video URLs per panel. null = still or failed. */
  panelVideoUrls?: (string | null)[];
  description: string;
  /** Optional: the prompts that were actually sent to the image/video model.
   *  Persisted so the user can inspect or re-use them. Backwards-compatible. */
  lastPrompts?: string[];
}

export type PanelStatus = 'pending' | 'rendering' | 'ready' | 'error';
