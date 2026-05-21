import { DRAKE_DISCOGRAPHY } from '@/lib/discography';

export interface Track {
  index: number;
  song: string;
  album: string;
  year: number;
}

export function buildTrackList(): Track[] {
  const tracks: Track[] = [];
  let index = 0;
  for (const { album, year, songs } of DRAKE_DISCOGRAPHY) {
    for (const song of songs) {
      index++;
      tracks.push({ index, song, album, year });
    }
  }
  return tracks;
}

export function trackKey(song: string, album: string): string {
  return `${song}|||${album}`;
}
