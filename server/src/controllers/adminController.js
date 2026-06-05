import User from '../models/User.js';
import Item from '../models/Item.js';
import Claim from '../models/Claim.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { cloudinary } from '../config/cloudinary.js';

export const getStats = catchAsync(async (req, res, next) => {
  const [totalUsers, totalItems, totalClaims, openItems, resolvedItems, itemsByCategory, itemsByType] =
    await Promise.all([
      User.countDocuments(),
      Item.countDocuments(),
      Claim.countDocuments(),
      Item.countDocuments({ status: 'open' }),
      Item.countDocuments({ status: 'resolved' }),
      Item.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      Item.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }]),
    ]);

  const recentItems = await Item.find()
    .populate('user', 'name email')
    .sort({ createdAt: -1 })
    .limit(5);

  const recentUsers = await User.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('name email role createdAt');

  res.status(200).json({
    success: true,
    data: {
      totalUsers,
      totalItems,
      totalClaims,
      openItems,
      resolvedItems,
      resolutionRate: totalItems > 0 ? Math.round((resolvedItems / totalItems) * 100) : 0,
      itemsByCategory,
      itemsByType,
      recentItems,
      recentUsers,
    },
  });
});

export const getUsers = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.search) {
    filter.$or = [
      { name: { $regex: req.query.search, $options: 'i' } },
      { email: { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      users,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

export const updateUserRole = catchAsync(async (req, res, next) => {
  const { role } = req.body;
  if (!['student', 'faculty', 'admin'].includes(role)) {
    return next(new AppError('Invalid role. Must be student, faculty, or admin', 400));
  }

  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    success: true,
    data: { user },
  });
});

export const deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return next(new AppError('User not found', 404));
  }

  await Item.deleteMany({ user: user._id });
  await Claim.deleteMany({ $or: [{ claimant: user._id }, { owner: user._id }] });
  await User.findByIdAndDelete(user._id);

  res.status(200).json({
    success: true,
    message: 'User and all related data deleted successfully',
  });
});

export const getAllItems = catchAsync(async (req, res, next) => {
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
    Item.find(filter).populate('user', 'name email').sort({ createdAt: -1 }).skip(skip).limit(limit),
    Item.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      items,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

export const deleteItemModerate = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.id);
  if (!item) {
    return next(new AppError('Item not found', 404));
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

export const getAllClaims = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const filter = {};
  if (req.query.status) filter.status = req.query.status;

  const [claims, total] = await Promise.all([
    Claim.find(filter)
      .populate('item', 'title images type category')
      .populate('claimant', 'name email')
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Claim.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      claims,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

export const moderateClaim = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  if (!['approved', 'rejected', 'pending'].includes(status)) {
    return next(new AppError('Status must be approved, rejected, or pending', 400));
  }

  const claim = await Claim.findByIdAndUpdate(req.params.id, { status }, { new: true })
    .populate('item', 'title')
    .populate('claimant', 'name email');

  if (!claim) {
    return next(new AppError('Claim not found', 404));
  }

  res.status(200).json({
    success: true,
    data: { claim },
  });
});
