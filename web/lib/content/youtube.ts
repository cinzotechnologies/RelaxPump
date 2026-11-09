/** The 11-character id of youtube.com/watch?v=…, youtu.be/…, youtube.com/shorts|embed/… links. */
export function youtubeId(url: string): string | null {
  const m = url.match(
    /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})(?:[?&#/].*)?$/,
  );
  return m ? m[1] : null;
}
