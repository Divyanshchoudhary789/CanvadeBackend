const { admin, db } = require("../../services/firebase");

exports.getRevenueDashboard = async (req, res) => {
  try {
    const ownerUid = req.user.uid;

    const { month, year } = req.query;

    // ---------------------------------------
    // Get Institute Courses
    // ---------------------------------------

    const courseSnapshot = await db
      .collection("courses")
      .where("createdBy", "==", ownerUid)
      .get();

    if (courseSnapshot.empty) {
      return res.status(200).json({
        success: true,
        data: {
          stats: {
            totalRevenue: 0,
            thisMonthRevenue: 0,
            thisMonthPayout: 0,
            pendingPayments: 0,
          },
          revenueOverview: [],
          topCourses: [],
          transactions: [],
        },
      });
    }

    const courseMap = {};
    const courseIds = [];

    courseSnapshot.forEach((doc) => {
      const course = doc.data();

      courseIds.push(doc.id);

      courseMap[doc.id] = {
        id: doc.id,
        title:
          course.basicDetails?.title ||
          course.title ||
          "Untitled Course",
        status: course.status || "Active",
      };
    });

    // ---------------------------------------
    // Fetch Payments
    // ---------------------------------------

    let payments = [];

    for (let i = 0; i < courseIds.length; i += 10) {
      const ids = courseIds.slice(i, i + 10);

      const paymentSnapshot = await db
        .collection("payments")
        .where("courseId", "in", ids)
        .get();

      paymentSnapshot.forEach((doc) => {
        payments.push({
          id: doc.id,
          ...doc.data(),
        });
      });
    }

    payments = payments.sort((a, b) => {
      const d1 = a.createdAt?.toDate() || new Date(0);
      const d2 = b.createdAt?.toDate() || new Date(0);

      return d2 - d1;
    });

    // ---------------------------------------
    // Filter By Month / Year
    // ---------------------------------------

    let filteredPayments = payments;

    if (month || year) {
      filteredPayments = payments.filter((payment) => {
        if (!payment.createdAt) return false;

        const date = payment.createdAt.toDate();

        const matchMonth = month
          ? date.getMonth() + 1 === Number(month)
          : true;

        const matchYear = year
          ? date.getFullYear() === Number(year)
          : true;

        return matchMonth && matchYear;
      });
    }

    // ---------------------------------------
    // Stats
    // ---------------------------------------

    const now = new Date();

    let totalRevenue = 0;
    let thisMonthRevenue = 0;
    let pendingPayments = 0;

    const revenueMap = {};

    const topCoursesMap = {};

    filteredPayments.forEach((payment) => {
      const amount = Number(payment.amount || 0);

      if (payment.status === "captured") {
        totalRevenue += amount;

        if (
          payment.createdAt &&
          payment.createdAt.toDate().getMonth() === now.getMonth() &&
          payment.createdAt.toDate().getFullYear() === now.getFullYear()
        ) {
          thisMonthRevenue += amount;
        }

        const key = payment.createdAt
          ?.toDate()
          .toISOString()
          .split("T")[0];

        revenueMap[key] = (revenueMap[key] || 0) + amount;

        if (!topCoursesMap[payment.courseId]) {
          topCoursesMap[payment.courseId] = {
            courseId: payment.courseId,
            courseName:
              courseMap[payment.courseId]?.title || "",
            revenue: 0,
            enrollments: 0,
            status:
              courseMap[payment.courseId]?.status || "Active",
          };
        }

        topCoursesMap[payment.courseId].revenue += amount;
        topCoursesMap[payment.courseId].enrollments++;
      } else {
        pendingPayments += amount;
      }
    });

    const revenueOverview = Object.keys(revenueMap)
      .sort()
      .map((date) => ({
        date,
        revenue: revenueMap[date],
      }));

    const topCourses = Object.values(topCoursesMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const thisMonthPayout = thisMonthRevenue - pendingPayments;

        

    const transactions = [];

    for (const payment of filteredPayments.slice(0, 10)) {
      const [userDoc, courseDoc] = await Promise.all([
        db.collection("users").doc(payment.userId).get(),
        db.collection("courses").doc(payment.courseId).get(),
      ]);

      const user = userDoc.exists ? userDoc.data() : {};
      const course = courseDoc.exists ? courseDoc.data() : {};

      transactions.push({
        paymentId: payment.paymentId,
        orderId: payment.orderId,

        date: payment.createdAt
          ? payment.createdAt
              .toDate()
              .toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
          : "",

        student: {
          uid: payment.userId,
          name: user.displayName || user.name || "Unknown Student",
          email: user.email || "",
          profileImage: user.profileImage || "",
        },

        course: {
          id: payment.courseId,
          title:
            course.basicDetails?.title ||
            course.title ||
            "Untitled Course",
          status: course.status || "Active",
        },

        amount: payment.amount || 0,
        currency: payment.currency || "INR",
        status: payment.status || "",
      });
    }

    // ---------------------------------------
    // Revenue Trend
    // ---------------------------------------

    const revenueTrend = [];

    if (month && year) {
      const totalDays = new Date(
        Number(year),
        Number(month),
        0
      ).getDate();

      for (let day = 1; day <= totalDays; day++) {
        const key = `${year}-${String(month).padStart(
          2,
          "0"
        )}-${String(day).padStart(2, "0")}`;

        revenueTrend.push({
          date: key,
          revenue: revenueMap[key] || 0,
        });
      }
    }

    // ---------------------------------------
    // Response
    // ---------------------------------------

    return res.status(200).json({
      success: true,

      data: {
        stats: {
          totalRevenue,

          thisMonthRevenue,

          thisMonthPayout,

          pendingPayments,
        },

        revenueOverview:
          revenueTrend.length > 0
            ? revenueTrend
            : revenueOverview,

        topCourses,

        transactions,
      },
    });
  } catch (error) {
    console.error("GET REVENUE DASHBOARD ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};