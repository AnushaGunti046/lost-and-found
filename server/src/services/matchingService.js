import Item from '../models/Item.js';
import Notification from '../models/Notification.js';

function calculateDistance(coord1, coord2) {
  const [lng1, lat1] = coord1;
  const [lng2, lat2] = coord2;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateScore(item1, item2) {
  let score = 0;
  const reasons = [];

  if (item1.category === item2.category) {
    score += 30;
    reasons.push('Same category');
  } else {
    return { score: 0, reasons: [] };
  }

  const colors1 = item1.aiAnalysis?.dominantColors || [];
  const colors2 = item2.aiAnalysis?.dominantColors || [];
  const colorOverlap = colors1.filter((c) => colors2.some((c2) => c2.toLowerCase() === c.toLowerCase())).length;
  const maxColors = Math.max(colors1.length, colors2.length) || 1;
  score += (colorOverlap / maxColors) * 20;
  if (colorOverlap > 0) reasons.push('Similar colors');

  if (
    item1.aiAnalysis?.brand &&
    item2.aiAnalysis?.brand &&
    item1.aiAnalysis.brand.toLowerCase() === item2.aiAnalysis.brand.toLowerCase()
  ) {
    score += 15;
    reasons.push('Same brand');
  }

  const kw1 = (item1.aiAnalysis?.keywords || []).map((k) => k.toLowerCase());
  const kw2 = (item2.aiAnalysis?.keywords || []).map((k) => k.toLowerCase());
  const kwOverlap = kw1.filter((k) => kw2.includes(k)).length;
  const maxKw = Math.max(kw1.length, kw2.length) || 1;
  score += (kwOverlap / maxKw) * 25;
  if (kwOverlap > 0) reasons.push('Similar keywords/features');

  if (item1.location?.coordinates && item2.location?.coordinates) {
    const dist = calculateDistance(item1.location.coordinates, item2.location.coordinates);
    if (dist < 0.5) {
      score += 10;
      reasons.push('Close proximity');
    } else if (dist < 2) {
      score += 5;
      reasons.push('Nearby location');
    }
  }

  return { score: Math.round(Math.min(score, 100)), reasons };
}

export async function findMatches(item) {
  const oppositeType = item.type === 'lost' ? 'found' : 'lost';

  const candidates = await Item.find({
    type: oppositeType,
    status: 'open',
    _id: { $ne: item._id },
  }).populate('user', 'name email');

  const matches = [];
  for (const candidate of candidates) {
    const { score, reasons } = calculateScore(item, candidate);
    if (score > 0) {
      matches.push({
        item: candidate,
        score,
        reasons,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const topMatches = matches.slice(0, 5);

  if (topMatches.length > 0) {
    const best = topMatches[0];
    item.matchedItem = best.item._id;
    item.matchScore = best.score;
    item.matchExplanation = best.reasons.join(', ');
    await item.save();

    if (best.score >= 50) {
      const notificationType = item.type === 'lost' ? 'match' : 'match';
      const matchTitle = `Potential ${item.type === 'lost' ? 'found' : 'lost'} item match!`;

      await Notification.create({
        user: item.user,
        type: notificationType,
        title: matchTitle,
        message: `We found a potential match for your "${item.title}" with ${best.score}% confidence.`,
        referenceId: best.item._id,
        referenceModel: 'Item',
      });

      await Notification.create({
        user: best.item.user,
        type: notificationType,
        title: matchTitle,
        message: `We found a potential match for your "${best.item.title}" with ${best.score}% confidence.`,
        referenceId: item._id,
        referenceModel: 'Item',
      });
    }
  }

  return topMatches;
}
