const express = require('express');

// Four 5 MiB files expand to about 26.7 MiB when encoded as base64.
const standard = express.json({ limit: '10mb', inflate: false });
const enrollment = express.json({ limit: '28mb', inflate: false });
module.exports = (req, res, next) => {
  const isEnrollment = req.method === 'POST'
    && /^\/api\/student\/(register|re-enroll)\/?$/i.test(req.path);
  return (isEnrollment ? enrollment : standard)(req, res, next);
};
