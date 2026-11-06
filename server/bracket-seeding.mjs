import { randomInt } from 'node:crypto';
const shuffled=items=>{const result=[...items];for(let i=result.length-1;i>0;i--){const j=randomInt(i+1);[result[i],result[j]]=[result[j],result[i]];}return result;};
export const seedSizes = [4,8,16,32,64,128];
export function parseSeedingSize(value, songCount) {
  if(value == null) return null;
  if(!Number.isInteger(value) || !seedSizes.includes(value) || value>songCount) throw new Error('Choose a seed range available for this bracket size.');
  return value;
}
export function validateAssignedSeeds(songs, size, songCount=songs.length) {
  if(size==null) return;
  parseSeedingSize(size,songCount);
  const required=songCount/size, counts=Array(size).fill(0);
  if(songs.length!==songCount) throw new Error(`Assign seeds to all ${songCount} songs.`);
  for(const song of songs) {
    if(!Number.isInteger(song.assignedSeed)||song.assignedSeed<1||song.assignedSeed>size) throw new Error(`Assign every song a seed from 1 to ${size}.`);
    counts[song.assignedSeed-1]++;
  }
  const invalid=counts.findIndex(count=>count!==required);
  if(invalid!==-1) throw new Error(`Seed ${invalid+1} needs exactly ${required} song${required===1?'':'s'}; currently assigned ${counts[invalid]}.`);
}
// Traditional bracket order separates the highest-ranked entrants into halves,
// quarters, etc. Equal ranks are distributed across those same sections.
export function seededOrder(items, rank, randomize=false, shuffle=shuffled) {
  if(items.length<2 || (items.length & (items.length-1))!==0) throw new Error('A seeded draw needs a power-of-two field.');
  const ranked=(randomize?shuffle(items):[...items]).sort((a,b)=>rank(a)-rank(b));
  let positions=[1,2];
  for(let size=4;size<=items.length;size*=2) positions=positions.flatMap(seed=>[seed,size+1-seed]);
  return positions.map(seed=>ranked[seed-1]);
}
