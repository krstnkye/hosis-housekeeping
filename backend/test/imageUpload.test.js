const test = require('node:test')
const assert = require('node:assert/strict')
const { isSupportedImageData } = require('../src/utils/imageUpload')

test('uploaded image content must match its declared type', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])
  const webp = Buffer.from('RIFF0000WEBP', 'ascii')
  assert.equal(isSupportedImageData(png, 'image/png'), true)
  assert.equal(isSupportedImageData(jpeg, 'image/jpeg'), true)
  assert.equal(isSupportedImageData(webp, 'image/webp'), true)
  assert.equal(isSupportedImageData(Buffer.from('<script>'), 'image/png'), false)
  assert.equal(isSupportedImageData(png, 'image/jpeg'), false)
})
