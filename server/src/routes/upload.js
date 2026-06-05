import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import upload from '../middleware/upload.js';

const router = Router();

router.post('/', protect, upload.array('images', 5), (req, res) => {
  const files = req.files.map((file) => ({
    url: file.path,
    publicId: file.filename,
  }));

  res.status(200).json({
    success: true,
    data: { files },
  });
});

export default router;
