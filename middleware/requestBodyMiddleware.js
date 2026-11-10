const express = require('express');

// Limit incoming JSON sizes to reduce memory use from oversized requests.
// Compressed bodies are rejected because inflate is false.
// Four 5 MiB files expand to about 26.7 MiB when encoded as base64.
const standard = express.json({ limit: '10mb', inflate: false });
const enrollment = express.json({ limit: '28mb', inflate: false });
module.exports = (req, res, next) => {
  // Only registration and re-enrollment receive the larger limit needed for uploads.
  const isEnrollment = req.method === 'POST'
    && /^\/api\/student\/(register|re-enroll)\/?$/i.test(req.path);
  return (isEnrollment ? enrollment : standard)(req, res, next);
};
