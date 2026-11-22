function hasPrefix(data, bytes) {
  return Buffer.isBuffer(data) && bytes.every((byte, index) => data[index] === byte)
}

function isSupportedImageData(data, contentType) {
  if (!Buffer.isBuffer(data) || data.length < 12) return false
  if (contentType === 'image/jpeg') return hasPrefix(data, [0xff, 0xd8, 0xff])
  if (contentType === 'image/png') return hasPrefix(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (contentType === 'image/webp') {
    return data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP'
  }
  return false
}

module.exports = { isSupportedImageData }
