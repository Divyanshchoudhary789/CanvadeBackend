const razorpay = require("../../config/razorpay");
const crypto = require("crypto");
const { admin, db } = require("../../services/firebase");
const {
  getEffectivePlan,
  countActiveCourses,
  countUpdatesThisMonth,
  BILLING_CYCLES,
  DEFAULT_BILLING_CYCLE,
} = require("../../utils/planHelper");

const resolveMyInstitute = async (uid) => {
  const snapshot = await db
    .collection("institutes")
    .where("ownerUid", "==", uid)
    .limit(1)
    .get();

  if (snapshot.empty) return null;
  return { id: snapshot.docs[0].id, data: snapshot.docs[0].data() };
};

exports.createPlanOrder = async (req, res) => {
  try {
    const institute = await resolveMyInstitute(req.user.uid);
    if (!institute) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
      });
    }

    const billingCycle = BILLING_CYCLES[req.body?.billingCycle]
      ? req.body.billingCycle
      : DEFAULT_BILLING_CYCLE;
    const cyclePricing = BILLING_CYCLES[billingCycle];

    const order = await razorpay.orders.create({
      amount: cyclePricing.pricePaise,
      currency: "INR",
      receipt: `PLAN${Date.now()}`,
      notes: {
        instituteId: institute.id,
        userId: req.user.uid,
        type: "institute_pro_plan",
        billingCycle,
      },
    });

    await db
      .collection("planOrders")
      .doc(order.id)
      .set({
        orderId: order.id,
        instituteId: institute.id,
        userId: req.user.uid,
        amount: order.amount / 100,
        currency: order.currency,
        status: "pending",
        planTier: "pro",
        billingCycle,
        createdAt: new Date(),
      });

    return res.status(200).json({
      success: true,
      message: "Plan order created successfully",
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error("Create Plan Order:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create plan order",
    });
  }
};

exports.verifyPlanPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const userId = req.user?.uid;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    const payment = await razorpay.payments.fetch(razorpay_payment_id);
    if (payment.status !== "captured") {
      return res.status(400).json({
        success: false,
        message: "Payment not captured",
      });
    }

    const orderRef = db.collection("planOrders").doc(razorpay_order_id);
    const orderDoc = await orderRef.get();
    if (!orderDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Plan order not found",
      });
    }

    const orderData = orderDoc.data();
    if (orderData.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (orderData.status === "completed") {
      const institute = await resolveMyInstitute(userId);
      const effective = getEffectivePlan(institute?.data);
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        data: { tier: effective.tier, expiresAt: effective.expiresAt },
      });
    }

    await db
      .collection("planPayments")
      .doc(razorpay_payment_id)
      .set({
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id,
        instituteId: orderData.instituteId,
        userId,
        amount: payment.amount / 100,
        currency: payment.currency,
        status: payment.status,
        createdAt: new Date(),
      });

    const billingCycle = BILLING_CYCLES[orderData.billingCycle]
      ? orderData.billingCycle
      : DEFAULT_BILLING_CYCLE;
    const durationDays = BILLING_CYCLES[billingCycle].durationDays;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    await db
      .collection("institutes")
      .doc(orderData.instituteId)
      .update({
        plan: {
          tier: "pro",
          billingCycle,
          purchasedAt: admin.firestore.Timestamp.fromDate(now),
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          lastPlanOrderId: razorpay_order_id,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    await orderRef.update({
      status: "completed",
      paymentId: razorpay_payment_id,
      completedAt: new Date(),
    });

    return res.status(200).json({
      success: true,
      message: "Plan upgraded to Pro successfully",
      data: { tier: "pro", expiresAt: expiresAt.toISOString() },
    });
  } catch (error) {
    console.error("Verify Plan Payment:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to verify plan payment",
    });
  }
};

exports.getMyPlan = async (req, res) => {
  try {
    const institute = await resolveMyInstitute(req.user.uid);
    if (!institute) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
      });
    }

    const effective = getEffectivePlan(institute.data);
    const [coursesUsed, updatesUsed] = await Promise.all([
      countActiveCourses(db, institute.id),
      countUpdatesThisMonth(db, institute.id),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        tier: effective.tier,
        storedTier: effective.storedTier,
        isExpired: effective.isExpired,
        purchasedAt: effective.purchasedAt,
        expiresAt: effective.expiresAt,
        billingCycle: effective.billingCycle,
        limits: {
          courses: effective.limits.courses === Infinity ? null : effective.limits.courses,
          updatesPerMonth: effective.limits.updatesPerMonth,
        },
        usage: { courses: coursesUsed, updatesThisMonth: updatesUsed },
        pricing: {
          currency: "INR",
          monthly: {
            pricePerMonth: BILLING_CYCLES.monthly.pricePerMonth,
            totalPerCycle: BILLING_CYCLES.monthly.pricePerMonth,
          },
          annual: {
            pricePerMonth: BILLING_CYCLES.annual.pricePerMonth,
            totalPerCycle: BILLING_CYCLES.annual.pricePerMonth * 12,
          },
        },
      },
    });
  } catch (error) {
    console.error("Get My Plan:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
