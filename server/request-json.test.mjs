import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { readJson, maxJsonBodyBytes } from './request-json.mjs';

test('accepts a full bracket payload exceeding the former 16 KB limit', async () => {
  const input = {title:'Bracket', songs:Array.from({length:128},(_,index)=>({title:`Song ${index}`,assignedSeed:index%8+1,youtubeUrl:'https://youtube.com/watch?v='+ 'a'.repeat(100),spotifyUrl:'https://open.spotify.com/track/'+ 'b'.repeat(100),albumCoverUrl:'https://example.com/'+ 'c'.repeat(200)}))};
  const body=Buffer.from(JSON.stringify(input));
  assert.ok(body.length>16384);
  assert.deepEqual(await readJson(Readable.from([body.subarray(0,10000),body.subarray(10000)])),input);
});

test('accepts the byte limit and rejects larger chunked requests', async () => {
  const body=Buffer.from(JSON.stringify('a'.repeat(maxJsonBodyBytes-2)));
  assert.equal((await readJson(Readable.from([body]))).length,maxJsonBodyBytes-2);
  await assert.rejects(readJson(Readable.from([body,Buffer.from(' ')])),{status:413});
});

test('decodes Unicode split across chunks and rejects invalid JSON', async () => {
  const body=Buffer.from('"🎵"');
  assert.equal(await readJson(Readable.from([body.subarray(0,3),body.subarray(3)])),'🎵');
  await assert.rejects(readJson(Readable.from(['{'])),{status:400});
});
