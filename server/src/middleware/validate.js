import { body } from 'express-validator';

export const registerValidation = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
];

export const loginValidation = [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').notEmpty().withMessage('Password is required'),
];

export const createItemValidation = [
  body('type').isIn(['lost', 'found']).withMessage('Type must be lost or found'),
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('dateOccurred').isISO8601().withMessage('Valid date is required'),
];

export const createClaimValidation = [
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('verificationAnswer').trim().notEmpty().withMessage('Verification answer is required'),
];
