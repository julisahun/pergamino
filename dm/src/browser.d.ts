/* Browser APIs TypeScript's DOM library does not carry yet.

   The File System Access picker and the per-handle permission methods are
   Chromium-only, which is exactly why this app is Chromium-only. Declaring
   them here is a dev-time fact about the platform, not a dependency: the
   alternative is @types/wicg-file-system-access, which would be one.

   Anything added here should be a real, shipped API — never a shim for
   something the app wishes existed. */

interface Window {
  showDirectoryPicker(options?: {
    mode?: 'read' | 'readwrite';
    id?: string;
    startIn?: string | FileSystemHandle;
  }): Promise<FileSystemDirectoryHandle>;
}

interface FileSystemHandle {
  /** Absent on OPFS handles, which have no permission model at all — the
      probes lean on that. */
  queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}
