import { validationResult } from 'express-validator';
import Item from '../models/Item.js';
import Notification from '../models/Notification.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { analyzeImage } from '../services/geminiService.js';
import { findMatches } from '../services/matchingService.js';
import { awardPoints } from '../services/rewardService.js';
import { cloudinary } from '../config/cloudinary.js';

export const getItems = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.type) filter.type = req.query.type;
  if (req.query.category) filter.category = req.query.category;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) {
    filter.$or = [
      { title: { $regex: req.query.search, $options: 'i' } },
      { description: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Item.find(filter)
      .populate('user', 'name email profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Item.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    },
  });
});

export const createItem = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array().map((e) => e.msg).join(', '), 400));
  }

  const { type, title, description, category, dateOccurred, location, reward, images } = req.body;

  const hasValidCoords = location?.coordinates?.length === 2 && location.coordinates.every((c) => c != null);

  const item = await Item.create({
    user: req.user._id,
    type,
    title,
    description,
    category,
    dateOccurred,
    location: hasValidCoords ? location : undefined,
    reward: type === 'lost' ? reward : undefined,
    images: images || [],
  });

  const imageUrls = (images || []).map((img) => img.url);
  const analysis = await analyzeImage(imageUrls);

  if (analysis && analysis.category) {
    item.aiAnalysis = analysis;
    if (analysis.category !== category) {
      item.category = analysis.category;
    }
  }

  const matches = await findMatches(item);

  const io = req.app.get('io');
  if (io) {
    io.to(item.user.toString()).emit('itemCreated', { itemId: item._id });
  }

  const action = type === 'found' ? 'report_found' : 'create_item';
  await awardPoints(req.user._id, action, `Created ${type} item: ${title}`, item._id, 'Item');

  res.status(201).json({
    success: true,
    data: {
      item,
      matches: matches.map((m) => ({
        item: m.item,
        score: m.score,
        reasons: m.reasons,
      })),
    },
  });
});

export const getItem = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id)
    .populate('user', 'name email profilePicture phone department')
    .populate('matchedItem');

  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  res.status(200).json({
    success: true,
    data: { item },
  });
});

export const updateItem = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  if (item.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError('You can only update your own items', 403));
  }

  const allowedFields = ['title', 'description', 'category', 'status', 'location', 'reward'];
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      if (field === 'location' && typeof req.body.location === 'string') {
        item.location = JSON.parse(req.body.location);
      } else {
        item[field] = req.body[field];
      }
    }
  }

  if (req.files && req.files.length > 0) {
    const newImages = req.files.map((file) => ({
      url: file.path,
      publicId: file.filename,
    }));
    item.images = [...item.images, ...newImages];
  }

  await item.save();

  res.status(200).json({
    success: true,
    data: { item },
  });
});

export const deleteItem = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  if (item.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError('You can only delete your own items', 403));
  }

  if (item.images && item.images.length > 0) {
    for (const img of item.images) {
      if (img.publicId) {
        await cloudinary.uploader.destroy(img.publicId).catch(() => {});
      }
    }
  }

  await Item.findByIdAndDelete(req.params.id);

  res.status(200).json({
    success: true,
    message: 'Item deleted successfully',
  });
});

export const markResolved = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  if (item.user.toString() !== req.user._id.toString()) {
    return next(new AppError('You can only mark your own items as resolved', 403));
  }

  if (item.status === 'resolved') {
    return next(new AppError('Item is already resolved', 400));
  }

  item.status = 'resolved';
  await item.save();

  await awardPoints(req.user._id, 'successful_return', `Resolved item: ${item.title}`, item._id, 'Item');

  if (item.matchedItem) {
    await Notification.create({
      user: item.matchedItem,
      type: 'resolution',
      title: 'Item Resolved',
      message: `Your matched item "${item.title}" has been marked as resolved.`,
      referenceId: item._id,
      referenceModel: 'Item',
    });
  }

  const io = req.app.get('io');
  if (io) {
    if (item.matchedItem) {
      io.to(item.matchedItem.toString()).emit('itemResolved', { itemId: item._id });
    }
    io.to(item.user.toString()).emit('itemResolved', { itemId: item._id });
  }

  res.status(200).json({
    success: true,
    data: { item },
  });
});
