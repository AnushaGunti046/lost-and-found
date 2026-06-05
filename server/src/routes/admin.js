import { Router } from 'express';
import { getStats, getUsers, updateUserRole, deleteUser, getAllItems, deleteItemModerate, getAllClaims, moderateClaim } from '../controllers/adminController.js';
import { protect, authorize } from '../middleware/auth.js';

const router = Router();

router.use(protect, authorize('admin'));

router.get('/stats', getStats);
router.get('/users', getUsers);
router.put('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.get('/items', getAllItems);
router.delete('/items/:id', deleteItemModerate);
router.get('/claims', getAllClaims);
router.put('/claims/:id', moderateClaim);

export default router;
