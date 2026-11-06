// Seeds are unique within each group of sixteen songs (a bracket region).
export function assignSongSeeds(songs) {
  const result = [];
  for (let offset = 0; offset < songs.length; offset += 16) {
    const region = songs.slice(offset, offset + 16);
    const used = new Set();
    const seeds = region.map(song => {
      const value = song.seed;
      if (value == null || (typeof value === 'string' && !value.trim())) return null;
      if (!['string', 'number'].includes(typeof value) || !/^(?:[1-9]|1[0-6])$/.test(String(value).trim())) {
        throw new Error('Seed must be a whole number from 1 to 16, or left blank.');
      }
      const seed = Number(value);
      if (used.has(seed)) throw new Error(`Seed ${seed} is repeated in region ${offset / 16 + 1}. Choose unique seeds within each group of 16 songs.`);
      used.add(seed);
      return seed;
    });
    for (const seed of seeds) {
      if (seed !== null) { result.push(seed); continue; }
      let available = 1;
      while (used.has(available)) available++;
      used.add(available);
      result.push(available);
    }
  }
  return result;
}
