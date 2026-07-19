const jwt = require("jsonwebtoken");
const { admin, db } = require("../../services/firebase");

exports.getViewCount = async (req, res) => {
  try {
    const uid = req.user?.uid;

    if (!uid) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    // Fetch institute & courses
    const [instituteSnapshot, courseSnapshot] = await Promise.all([
      db.collection("institutes").where("ownerUid", "==", uid).limit(1).get(),
      db.collection("courses").where("createdBy", "==", uid).get(),
    ]);

    if (instituteSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Institute not found.",
      });
    }

    const instituteData = instituteSnapshot.docs[0].data();

    const instituteViews = Array.isArray(instituteData.viewerIds)
      ? instituteData.viewerIds.length
      : 0;

    // No courses
    if (courseSnapshot.empty) {
      return res.status(200).json({
        success: true,
        instituteViews,
        courseViews: 0,
        totalEnrollments: 0,
        totalRevenue: 0,
        courseStatusCounts: {},
        cityCounts: {},
      });
    }

    // ===============================
    // Course Status Count
    // ===============================
    const courseStatusCounts = {};

    courseSnapshot.docs.forEach((doc) => {
      const status = doc.data().status || "Unknown";

      courseStatusCounts[status] = (courseStatusCounts[status] || 0) + 1;
    });

    // ===============================
    // Course Views
    // ===============================
    const courseViews = courseSnapshot.docs.reduce((total, courseDoc) => {
      const viewerIds = courseDoc.data().viewerIds || [];
      return total + viewerIds.length;
    }, 0);

    // ===============================
    // Collect Unique Viewer IDs
    // ===============================
    const uniqueViewerIds = new Set();

    (instituteData.viewerIds || []).forEach((id) => uniqueViewerIds.add(id));

    courseSnapshot.docs.forEach((doc) => {
      (doc.data().viewerIds || []).forEach((id) => uniqueViewerIds.add(id));
    });

    // ===============================
    // City Count
    // ===============================
    const cityCounts = {};

    const userDocs = await Promise.all(
      [...uniqueViewerIds].map((viewerUid) =>
        db.collection("users").doc(viewerUid).get(),
      ),
    );
    userDocs.forEach((userDoc) => {
      if (!userDoc.exists) return;

      const state = userDoc.data().address?.state || "Unknown";

      cityCounts[state] = (cityCounts[state] || 0) + 1;
    });

    // ===============================
    // Enrollments
    // ===============================
    const enrollmentCounts = await Promise.all(
      courseSnapshot.docs.map(async (courseDoc) => {
        const enrollmentSnapshot = await db
          .collection("enrollments")
          .where("courseId", "==", courseDoc.id)
          .get();

        return enrollmentSnapshot.size;
      }),
    );

    const totalEnrollments = enrollmentCounts.reduce(
      (sum, count) => sum + count,
      0,
    );

    // ===============================
    // Revenue
    // ===============================
    const revenueList = await Promise.all(
      courseSnapshot.docs.map(async (courseDoc) => {
        const orderSnapshot = await db
          .collection("orders")
          .where("courseId", "==", courseDoc.id)
          .where("status", "==", "completed")
          .get();

        return orderSnapshot.docs.reduce((sum, orderDoc) => {
          return sum + (orderDoc.data().amount || 0);
        }, 0);
      }),
    );

    const totalRevenue = revenueList.reduce((sum, revenue) => sum + revenue, 0);

    return res.status(200).json({
      success: true,
      instituteViews,
      courseViews,
      totalEnrollments,
      totalRevenue,
      courseStatusCounts,
      cityCounts,
    });
  } catch (error) {
    console.error("GET VIEW COUNT ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getEnrollmentAnalytics = async (req, res) => {
  try {
    const uid = req.user.uid;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const courseSnapshot = await db
      .collection("courses")
      .where("createdBy", "==", uid)
      .get();

    if (courseSnapshot.empty) {
      return res.status(200).json({
        success: true,
        year,
        totalEnrollments: 0,
        data: [],
      });
    }

    const courseIds = courseSnapshot.docs.map((doc) => doc.id);

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const chunks = chunkArray(courseIds, 30);

    const enrollmentPromises = chunks.map((ids) =>
      db.collection("enrollments").where("courseId", "in", ids).get(),
    );

    const enrollmentSnapshots = await Promise.all(enrollmentPromises);

    const monthlyCounts = Array(12).fill(0);

    enrollmentSnapshots.forEach((snapshot) => {
      snapshot.docs.forEach((doc) => {
        const createdAt = doc.data().createdAt;

        if (!createdAt) return;

        const date = createdAt.toDate();

        if (date.getFullYear() === year) {
          monthlyCounts[date.getMonth()]++;
        }
      });
    });

    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const data = months.map((month, index) => ({
      month,
      count: monthlyCounts[index],
    }));

    const totalEnrollments = monthlyCounts.reduce(
      (sum, count) => sum + count,
      0,
    );

    return res.status(200).json({
      success: true,
      year,
      totalEnrollments,
      data,
    });
  } catch (error) {
    console.error("GET ENROLLMENT ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getRevenueAnalytics = async (req, res) => {
  try {
    const uid = req.user.uid;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const courseSnapshot = await db
      .collection("courses")
      .where("createdBy", "==", uid)
      .get();

    if (courseSnapshot.empty) {
      return res.status(200).json({
        success: true,
        year,
        totalRevenue: 0,
        data: [],
      });
    }

    const courseIds = courseSnapshot.docs.map((doc) => doc.id);

    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const chunks = chunkArray(courseIds, 30);

    const orderPromises = chunks.map((ids) =>
      db
        .collection("orders")
        .where("courseId", "in", ids)
        .where("status", "==", "completed")
        .get(),
    );

    const orderSnapshots = await Promise.all(orderPromises);

    const monthlyRevenue = Array(12).fill(0);

    orderSnapshots.forEach((snapshot) => {
      snapshot.docs.forEach((doc) => {
        const order = doc.data();

        if (!order.createdAt) return;

        const date = order.createdAt.toDate();

        if (date.getFullYear() === year) {
          monthlyRevenue[date.getMonth()] += Number(order.amount || 0);
        }
      });
    });

    const months = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const data = months.map((month, index) => ({
      month,
      revenue: monthlyRevenue[index],
    }));

    const totalRevenue = monthlyRevenue.reduce(
      (sum, revenue) => sum + revenue,
      0,
    );

    return res.status(200).json({
      success: true,
      year,
      totalRevenue,
      data,
    });
  } catch (error) {
    console.error("GET REVENUE ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getCourseStatusAnalytics = async (req, res) => {
  try {
    const uid = req.user.uid;

    const courseSnapshot = await db
      .collection("courses")
      .where("createdBy", "==", uid)
      .get();

    if (courseSnapshot.empty) {
      return res.status(200).json({
        success: true,
        totalCourses: 0,
        data: [],
      });
    }

    const statusCounts = {};

    courseSnapshot.forEach((doc) => {
      const status = doc.data().status?.trim() || "Unknown";

      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const data = Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }));

    return res.status(200).json({
      success: true,
      totalCourses: courseSnapshot.size,
      data,
    });
  } catch (error) {
    console.error("GET COURSE STATUS ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};

exports.getLocationAnalytics = async (req, res) => {
  try {
    const uid = req.user.uid;
    const type = req.query.type === "city" ? "city" : "state";

    const [instituteSnapshot, courseSnapshot] = await Promise.all([
      db.collection("institutes").where("ownerUid", "==", uid).limit(1).get(),
      db.collection("courses").where("createdBy", "==", uid).get(),
    ]);

    if (instituteSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
      });
    }

    const institute = instituteSnapshot.docs[0].data();

    // Collect unique viewer IDs
    const viewerIds = new Set();

    (institute.viewerIds || []).forEach((id) => viewerIds.add(id));

    courseSnapshot.forEach((doc) => {
      (doc.data().viewerIds || []).forEach((id) => viewerIds.add(id));
    });

    if (viewerIds.size === 0) {
      return res.status(200).json({
        success: true,
        type,
        totalVisitors: 0,
        data: [],
      });
    }

    // Firestore "in" supports max 30 values
    const chunkArray = (arr, size) => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    const uidChunks = chunkArray([...viewerIds], 30);

    const userSnapshots = await Promise.all(
      uidChunks.map((ids) =>
        db.collection("users").where("uid", "in", ids).get()
      )
    );

    const locationMap = {};

    userSnapshots.forEach((snapshot) => {
      snapshot.forEach((doc) => {
        const user = doc.data();

        const rawLocation = user.address?.[type]?.trim();

        if (!rawLocation) {
          if (!locationMap["unknown"]) {
            locationMap["unknown"] = {
              location: "Unknown",
              count: 0,
            };
          }

          locationMap["unknown"].count++;
          return;
        }

        // Normalize for comparison
        const key = rawLocation
          .toLowerCase()
          .replace(/\s+/g, " ")
          .trim();

        // Format for display
        const displayName = key
          .split(" ")
          .map(
            (word) => word.charAt(0).toUpperCase() + word.slice(1)
          )
          .join(" ");

        if (!locationMap[key]) {
          locationMap[key] = {
            location: displayName,
            count: 0,
          };
        }

        locationMap[key].count++;
      });
    });

    const data = Object.values(locationMap).sort(
      (a, b) => b.count - a.count
    );

    return res.status(200).json({
      success: true,
      type,
      totalVisitors: viewerIds.size,
      data,
    });
  } catch (error) {
    console.error("LOCATION ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

// Was unreachable before (duplicate "/views" route) and had no error
// handling at all — both are fixed here.
exports.getViewAnalytics = async (req, res) => {
  try {
    const uid = req.user.uid;
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const instituteSnapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", uid)
      .limit(1)
      .get();

    if (instituteSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Institute not found",
      });
    }

    const instituteId = instituteSnapshot.docs[0].id;

    const courseSnapshot = await db
      .collection("courses")
      .where("createdBy", "==", uid)
      .get();

    const courseIds = courseSnapshot.docs.map((doc) => doc.id);

    const months = Array(12)
      .fill(null)
      .map(() => ({ courseViews: 0, instituteViews: 0 }));

    // Institute views
    const instituteViews = await db
      .collection("instituteViews")
      .where("instituteId", "==", instituteId)
      .get();

    instituteViews.forEach((doc) => {
      const createdAt = doc.data().createdAt;
      if (!createdAt) return; // guard against legacy/malformed docs

      const date = createdAt.toDate();
      if (date.getFullYear() === year) {
        months[date.getMonth()].instituteViews++;
      }
    });

    // Course views
    const chunk = (arr, size) => {
      const r = [];
      for (let i = 0; i < arr.length; i += size) {
        r.push(arr.slice(i, i + size));
      }
      return r;
    };

    if (courseIds.length > 0) {
      const promises = chunk(courseIds, 30).map((ids) =>
        db.collection("courseViews").where("courseId", "in", ids).get(),
      );

      const snapshots = await Promise.all(promises);

      snapshots.forEach((snapshot) => {
        snapshot.forEach((doc) => {
          const createdAt = doc.data().createdAt;
          if (!createdAt) return;

          const date = createdAt.toDate();
          if (date.getFullYear() === year) {
            months[date.getMonth()].courseViews++;
          }
        });
      });
    }

    const labels = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];

    const data = labels.map((month, index) => ({
      month,
      courseViews: months[index].courseViews,
      instituteViews: months[index].instituteViews,
    }));

    return res.status(200).json({
      success: true,
      year,
      data,
    });
  } catch (error) {
    console.error("GET VIEW ANALYTICS ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Internal Server Error",
    });
  }
};