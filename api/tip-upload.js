// Handles anonymous tip file uploads (images, video, or any other file).
// Files never pass through this function's body -- the browser uploads
// directly to Vercel Blob using a short-lived token issued here, so
// there's no size limit imposed by this serverless function itself.
//
// No identifying info (name, email, IP) is requested or stored anywhere
// in this flow.

const { handleUpload } = require('@vercel/blob/client');

const MAX_FILE_BYTES = 300 * 1024 * 1024; // 300MB per file

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async function () {
        return {
          addRandomSuffix: true,
          maximumSizeInBytes: MAX_FILE_BYTES,
          tokenPayload: JSON.stringify({ submittedAt: new Date().toISOString() })
        };
      },
      onUploadCompleted: async function (event) {
        console.log('Anonymous tip file received:', event.blob.pathname);
      }
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    return res.status(400).json({ error: String((err && err.message) || err) });
  }
};

