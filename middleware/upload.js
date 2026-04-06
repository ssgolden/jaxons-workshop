const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Ensure upload directories exist
const uploadDir = path.join(__dirname, '..', 'uploads', 'products');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const productId = req.params.productId || req.body.productId || 'temp';
        const productDir = path.join(uploadDir, productId.toString());

        if (!fs.existsSync(productDir)) {
            fs.mkdirSync(productDir, { recursive: true });
        }

        cb(null, productDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

// File filter - only images
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (jpeg, jpg, png, webp, gif)'));
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 10 // Max 10 files per upload
    }
});

// Image optimization middleware
async function optimizeImages(req, res, next) {
    if (!req.files || req.files.length === 0) {
        return next();
    }

    const optimizedFiles = [];

    try {
        for (const file of req.files) {
            const filename = path.basename(file.path, path.extname(file.path));
            const dirname = path.dirname(file.path);

            // Generate optimized versions
            const sizes = {
                thumb: { width: 200, height: 200, suffix: 'thumb' },
                card: { width: 400, height: 400, suffix: 'card' },
                large: { width: 800, height: 800, suffix: 'large' }
            };

            const originalPath = file.path;
            const productFolder = req.params.productId || req.body.productId || 'temp';
            const imageSet = {
                url: '',
                thumb: '',
                card: '',
                large: ''
            };

            for (const [key, size] of Object.entries(sizes)) {
                const outputPath = path.join(dirname, `${filename}-${size.suffix}.webp`);
                const publicUrl = `/uploads/products/${productFolder}/${filename}-${size.suffix}.webp`;

                await sharp(originalPath)
                    .resize(size.width, size.height, {
                        fit: 'cover',
                        position: 'center'
                    })
                    .webp({ quality: 80 })
                    .toFile(outputPath);

                imageSet[key] = publicUrl;
                if (key === 'large') {
                    imageSet.url = publicUrl;
                }
            }

            // Remove original file to save space
            fs.unlinkSync(originalPath);
            optimizedFiles.push(imageSet);
        }

        req.optimizedFiles = optimizedFiles;
        next();
    } catch (error) {
        console.error('Image optimization error:', error);
        res.status(500).json({ error: 'Failed to optimize images' });
    }
}

module.exports = {
    upload,
    optimizeImages,
    uploadDir,
};
