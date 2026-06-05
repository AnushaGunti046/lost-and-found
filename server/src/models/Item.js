import mongoose from 'mongoose';

const itemSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  type: {
    type: String,
    enum: ['lost', 'found'],
    required: [true, 'Type is required'],
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
  },
  status: {
    type: String,
    enum: ['open', 'resolved', 'closed'],
    default: 'open',
  },
  images: [
    {
      url: String,
      publicId: String,
    },
  ],
  dateOccurred: {
    type: Date,
    required: [true, 'Date occurred is required'],
  },
  location: {
    name: String,
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      default: [0, 0],
    },
  },
  reward: {
    type: Number,
  },
  aiAnalysis: {
    description: String,
    category: String,
    dominantColors: [String],
    brand: String,
    uniqueFeatures: [String],
    keywords: [String],
    confidence: Number,
  },
  matchedItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Item',
  },
  matchScore: Number,
  matchExplanation: String,
}, { timestamps: true });

itemSchema.index({ location: '2dsphere' }, { sparse: true });
itemSchema.index({ type: 1, status: 1, category: 1 });

const Item = mongoose.model('Item', itemSchema);
export default Item;
