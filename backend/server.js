require('dotenv').config(); // Load environment variables from .env file
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const Item = require('./models/Item'); // Import our new Item model
const upload = require('./upload'); // Import our multer middleware
const cloudinary = require('cloudinary').v2; // Import cloudinary


// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const app = express();
const PORT = 5000;

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- API Routes ---
app.get('/', (req, res) => {
  res.send('Welcome to the Ethio Lost and Found API!');
});

// GET ALL ITEMS - Now with search and filter
app.get('/api/items', async (req, res) => {
  try {
    // 1. Start with an empty filter object
    const filter = {};

    // 2. If a 'category' query parameter exists, add it to the filter
    if (req.query.category) {
      filter.category = req.query.category;
    }

    // 3. If a 'search' query parameter exists, add it to the filter
    if (req.query.search) {
      // Use a regular expression for a case-insensitive search
      // This will find the search term anywhere in the itemName or description
      filter.$or = [
        { itemName: { $regex: req.query.search, $options: 'i' } },
        { description: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // 4. Pass the filter object to the find() method
    const items = await Item.find(filter).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Server error while fetching items' });
  }
});

// GET A SINGLE ITEM BY ID
app.get('/api/items/:id', async (req, res) => {
  try {
    const item = await Item.findById(req.params.id); // Find item by the ID in the URL

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});
// POST A NEW ITEM - Now with image upload
app.post('/api/items', upload.single('image'), async (req, res) => {
  try {
    let imageUrl = 'https://via.placeholder.com/300x200.png?text=Item'; // Default
    
    if (req.file) {
      // req.file is available thanks to multer. It contains the image data.
      // We need to upload it to Cloudinary.
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: "lost-and-found" }, (error, result) => {
          if (error) reject(error);
          resolve(result);
        });
        stream.end(req.file.buffer);
      });
      imageUrl = result.secure_url;
    }

    const newItem = new Item({
      itemName: req.body.itemName,
      description: req.body.description,
      category: req.body.category,
      locationFound: req.body.locationFound,
      imageUrl: imageUrl, // Save the Cloudinary URL
    });
    const savedItem = await newItem.save();
    res.status(201).json(savedItem);
  } catch (err) {
    console.error("Error creating item:", err);
    res.status(400).json({ error: 'Failed to create item', details: err });
  }
});

// UPDATE AN ITEM BY ID
// UPDATE AN ITEM BY ID - Now with optional image upload
app.put('/api/items/:id', upload.single('image'), async (req, res) => {
  try {
    // Start with the text data from the form
    const updateData = { ...req.body };

    // If a new file was uploaded, handle it
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({ folder: "lost-and-found" }, (error, result) => {
          if (error) reject(error);
          resolve(result);
        });
        stream.end(req.file.buffer);
      });
      // Add the new image URL to our update data
      updateData.imageUrl = result.secure_url;
    }

    const updatedItem = await Item.findByIdAndUpdate(
      req.params.id,
      updateData, // Use the potentially modified updateData object
      { new: true }
    );

    if (!updatedItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json(updatedItem);
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Failed to update item' });
  }
});

// DELETE AN ITEM BY ID
app.delete('/api/items/:id', async (req, res) => {
  try {
    const deletedItem = await Item.findByIdAndDelete(req.params.id);

    if (!deletedItem) {
      return res.status(404).json({ error: 'Item not found' });
    }

    res.json({ message: 'Item deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error while deleting item' });
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});