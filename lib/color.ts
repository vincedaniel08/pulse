// Stable colour per session id, so a stranger's dot, avatar and chat accent
// all match without the server having to store anything.
export function dotColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return `hsl(${Math.abs(hash) % 360} 85% 66%)`;
}
