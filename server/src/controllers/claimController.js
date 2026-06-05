import { validationResult } from 'express-validator';
import Claim from '../models/Claim.js';
import Item from '../models/Item.js';
import Notification from '../models/Notification.js';
import AppError from '../utils/AppError.js';
import catchAsync from '../utils/catchAsync.js';
import { awardPoints } from '../services/rewardService.js';
import { sendClaimNotification } from '../services/emailService.js';

export const createClaim = catchAsync(async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new AppError(errors.array().map((e) => e.msg).join(', '), 400));
  }

  const { itemId, description, verificationAnswer } = req.body;

  const item = await Item.findById(itemId).populate('user', 'name email');
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  if (item.status !== 'open') {
    return next(new AppError('This item is no longer available for claims', 400));
  }

  if (item.user._id.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot claim your own item', 400));
  }

  const existingClaim = await Claim.findOne({
    item: itemId,
    claimant: req.user._id,
    status: { $ne: 'rejected' },
  });
  if (existingClaim) {
    return next(new AppError('You have already claimed this item', 400));
  }

  const claim = await Claim.create({
    item: itemId,
    claimant: req.user._id,
    owner: item.user._id,
    description,
    verificationAnswer,
  });

  await Notification.create({
    user: item.user._id,
    type: 'claim',
    title: 'New Claim',
    message: `${req.user.name} has claimed your item "${item.title}"`,
    referenceId: claim._id,
    referenceModel: 'Claim',
  });

  try {
    await sendClaimNotification(item.user.email, item.title, req.user.name);
  } catch (err) {
    console.error('Claim notification email failed:', err.message);
  }

  const io = req.app.get('io');
  if (io) {
    io.to(item.user._id.toString()).emit('newClaim', { claimId: claim._id, itemTitle: item.title });
  }

  res.status(201).json({
    success: true,
    data: { claim },
  });
});

export const getItemClaims = catchAsync(async (req, res, next) => {
  const item = await Item.findById(req.params.itemId);
  if (!item) {
    return next(new AppError('Item not found', 404));
  }

  if (item.user.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError('Only the item owner can view claims', 403));
  }

  const claims = await Claim.find({ item: req.params.itemId })
    .populate('claimant', 'name email profilePicture phone department')
    .sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: { claims },
  });
});

export const getMyClaims = catchAsync(async (req, res, next) => {
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 20;
  const skip = (page - 1) * limit;

  const [claims, total] = await Promise.all([
    Claim.find({ claimant: req.user._id })
      .populate('item', 'title images type status')
      .populate('owner', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Claim.countDocuments({ claimant: req.user._id }),
  ]);

  res.status(200).json({
    success: true,
    data: {
      claims,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    },
  });
});

export const updateClaimStatus = catchAsync(async (req, res, next) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return next(new AppError('Status must be approved or rejected', 400));
  }

  const claim = await Claim.findById(req.params.id)
    .populate('item', 'title status user')
    .populate('claimant', 'name email');
  if (!claim) {
    return next(new AppError('Claim not found', 404));
  }

  if (claim.owner.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError('Only the item owner can update claim status', 403));
  }

  claim.status = status;
  await claim.save();

  if (status === 'approved') {
    const item = await Item.findById(claim.item._id);
    item.status = 'resolved';
    item.save();

    await awardPoints(claim.claimant._id, 'verified_return', `Item returned: ${item.title}`, item._id, 'Item');
    await awardPoints(claim.owner, 'successful_return', `Resolved item: ${item.title}`, item._id, 'Item');
  }

  await Notification.create({
    user: claim.claimant._id,
    type: 'claim_update',
    title: `Claim ${status}`,
    message: `Your claim for "${claim.item.title}" has been ${status}.`,
    referenceId: claim._id,
    referenceModel: 'Claim',
  });

  const io = req.app.get('io');
  if (io) {
    io.to(claim.claimant._id.toString()).emit('claimUpdate', {
      claimId: claim._id,
      status,
      itemTitle: claim.item.title,
    });
  }

  res.status(200).json({
    success: true,
    data: { claim },
  });
});
