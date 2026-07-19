const PLAN_LIMITS = {
  free: { courses: 7, updatesPerMonth: 2 },
  pro: { courses: Infinity, updatesPerMonth: 20 },
};

// Growth Plan billing cycles: monthly is pay-as-you-go at a higher rate;
// annual is billed as one upfront lump sum at a discounted per-month rate.
const BILLING_CYCLES = {
  monthly: { durationDays: 30, pricePaise: 1200 * 100, pricePerMonth: 1200 },
  annual: { durationDays: 365, pricePaise: 999 * 12 * 100, pricePerMonth: 999 },
};
const DEFAULT_BILLING_CYCLE = "monthly";

// Kept for backwards compatibility with any existing references.
const PRO_PLAN_DURATION_DAYS = BILLING_CYCLES.monthly.durationDays;
const PRO_PLAN_PRICE_PAISE = BILLING_CYCLES.monthly.pricePaise;

const toDate = (value) => {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
};

const getEffectivePlan = (institute) => {
  const plan = institute?.plan || {};
  const storedTier = plan.tier === "pro" ? "pro" : "free";
  const expiresAt = toDate(plan.expiresAt);
  const isExpired =
    storedTier === "pro" && expiresAt !== null && expiresAt.getTime() < Date.now();
  const tier = isExpired ? "free" : storedTier;

  return {
    tier,
    storedTier,
    isExpired,
    purchasedAt: toDate(plan.purchasedAt),
    expiresAt,
    billingCycle: plan.billingCycle || null,
    limits: PLAN_LIMITS[tier],
  };
};

const countActiveCourses = async (db, instituteId) => {
  const snapshot = await db
    .collection("courses")
    .where("instituteId", "==", instituteId)
    .get();

  return snapshot.docs.filter((doc) => doc.data().isDeleted !== true).length;
};

const countUpdatesThisMonth = async (db, instituteId) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const snapshot = await db
    .collection("updates")
    .where("instituteId", "==", instituteId)
    .get();

  return snapshot.docs.filter((doc) => {
    const data = doc.data();
    if (data.isDeleted === true) return false;
    const createdAt = data.createdAt ? new Date(data.createdAt) : null;
    return createdAt && createdAt >= startOfMonth;
  }).length;
};

module.exports = {
  PLAN_LIMITS,
  BILLING_CYCLES,
  DEFAULT_BILLING_CYCLE,
  PRO_PLAN_DURATION_DAYS,
  PRO_PLAN_PRICE_PAISE,
  getEffectivePlan,
  countActiveCourses,
  countUpdatesThisMonth,
};
