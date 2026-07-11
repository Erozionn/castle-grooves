import assert from 'node:assert/strict'

import { fuzzyRatio, isLikelyWakePhrase, parseVoiceSongCommand } from '@utils/voiceCommandParser'

const options = {
  wakePhrase: 'castle grooves',
  commandPrefix: 'play',
}

assert.deepEqual(parseVoiceSongCommand('castle grooves play blinding lights', options), {
  transcript: 'castle grooves play blinding lights',
  query: 'blinding lights',
})

assert.equal(parseVoiceSongCommand('Castle Grooves, play Blinding Lights!', options)?.query, 'blinding lights')
assert.equal(parseVoiceSongCommand('castle groves play blinding lights', options)?.query, 'blinding lights')
assert.equal(parseVoiceSongCommand('castle group play blinding lights', options)?.query, 'blinding lights')
assert.equal(parseVoiceSongCommand('hey castle grooves play blinding lights', options)?.query, 'blinding lights')
assert.equal(parseVoiceSongCommand('castle grooves pray blinding lights', options)?.query, 'blinding lights')

assert.equal(isLikelyWakePhrase('castle groo', options), true)
assert.equal(isLikelyWakePhrase('castle group', options), true)
assert.equal(isLikelyWakePhrase('plastic spoons', options), false)
assert.equal(isLikelyWakePhrase('cancel group', options), false)

assert.ok(fuzzyRatio('castle groves', 'castle grooves') >= 74)
assert.equal(parseVoiceSongCommand('castle grooves queue blinding lights', options), null)
assert.equal(parseVoiceSongCommand('play blinding lights', options), null)
assert.equal(parseVoiceSongCommand('can you castle grooves play blinding lights', options), null)
assert.equal(parseVoiceSongCommand('castle grooves play', options), null)
assert.equal(parseVoiceSongCommand('castle grooves play a', options), null)

console.log('voice command parser tests passed')
