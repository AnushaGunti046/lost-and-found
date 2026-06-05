import Reward from '../models/Reward.js';
import User from '../models/User.js';

const POINTS_MAP = {
  create_item: 5,
  report_found: 10,
  successful_return: 50,
  verified_return: 100,
};

const BADGE_DEFINITIONS = [
  {
    name: 'First Finder',
    icon: '🎯',
    description: 'Created your first lost/found item',
    check: (stats) => stats.totalItems >= 1,
  },
  {
    name: 'Campus Helper',
    icon: '⭐',
    description: 'Earned 50+ reward points',
    check: (stats) => stats.totalPoints >= 50,
  },
  {
    name: 'Recovery Expert',
    icon: '🏆',
    description: 'Earned 200+ reward points',
    check: (stats) => stats.totalPoints >= 200,
  },
  {
    name: 'Top Contributor',
    icon: '👑',
    description: 'Earned 500+ reward points',
    check: (stats) => stats.totalPoints >= 500,
  },
];

export async function awardPoints(userId, action, description, referenceId, referenceModel) {
  const points = POINTS_MAP[action] || 0;
  if (points === 0) return null;

  const reward = await Reward.create({
    user: userId,
    points,
    action,
    description,
    referenceId,
    referenceModel,
  });

  const user = await User.findById(userId);
  user.rewardPoints += points;

  const existingBadgeNames = user.badges.map((b) => b.name);
  const stats = {
    totalItems: await Reward.countDocuments({ user: userId }),
    totalPoints: user.rewardPoints,
  };

  for (const badgeDef of BADGE_DEFINITIONS) {
    if (!existingBadgeNames.includes(badgeDef.name) && badgeDef.check(stats)) {
      user.badges.push({
        name: badgeDef.name,
        icon: badgeDef.icon,
        description: badgeDef.description,
        earnedAt: new Date(),
      });
    }
  }

  await user.save();
  return reward;
}

export async function getPointsHistory(userId, page = 1, limit = 20) {
  const skip = (page - 1) * limit;
  const [rewards, total] = await Promise.all([
    Reward.find({ user: userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Reward.countDocuments({ user: userId }),
  ]);
  return { rewards, total, page, pages: Math.ceil(total / limit) };
}

export async function getBadges(userId) {
  const user = await User.findById(userId).select('badges');
  return user?.badges || [];
}
