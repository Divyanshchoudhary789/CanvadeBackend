const jwt = require("jsonwebtoken");
const { uploadFile } = require("../../services/storage");
const bcrypt = require("bcryptjs");
const extractCoordinates = require("../../utils/extractCoordinates");

const { admin, db } = require("../../services/firebase");

exports.createActivity = async ({
  ownerUid,
  studentUid,
  type,
  entityType,
  entityId,
  entityName,
  instituteId = null,
  instituteName = null,
}) => {
  try {
    const userDoc = await db.collection("users").doc(studentUid).get();

    if (!userDoc.exists) return;

    const user = userDoc.data();

    await db.collection("activities").add({
      ownerUid,
      studentUid,

      student: {
        uid: studentUid,
        name: user.displayName || user.name || "",
        email: user.email || "",
        phoneNumber: user.phoneNumber || "",
        profileImage: user.profileImage || "",
        city: user.address?.city || "",
      },

      activityType: type,

      entityType,

      entity: {
        id: entityId,
        name: entityName,
      },

      institute: {
        id: instituteId,
        name: instituteName,
      },

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.log(err);
  }
};

// const admin = require("firebase-admin");
// const db = admin.firestore();

exports.getMyActivities = async (req, res) => {
  try {
    const ownerUid = req.user.uid;
    console.log("Owner UID:", ownerUid);

    const snapshot = await db
      .collection("activities")
      .where("ownerUid", "==", ownerUid)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const now = Date.now();

    const getTimeAgo = (timestamp) => {
      if (!timestamp) return "";

      const date = timestamp.toDate
        ? timestamp.toDate()
        : new Date(timestamp);

      const diff = Math.floor((now - date.getTime()) / 1000);

      if (diff < 60) return "Just now";

      const minutes = Math.floor(diff / 60);
      if (minutes < 60)
        return `${minutes} min${minutes > 1 ? "s" : ""} ago`;

      const hours = Math.floor(minutes / 60);
      if (hours < 24)
        return `${hours} hour${hours > 1 ? "s" : ""} ago`;

      const days = Math.floor(hours / 24);
      if (days < 30)
        return `${days} day${days > 1 ? "s" : ""} ago`;

      const months = Math.floor(days / 30);
      if (months < 12)
        return `${months} month${months > 1 ? "s" : ""} ago`;

      const years = Math.floor(months / 12);
      return `${years} year${years > 1 ? "s" : ""} ago`;
    };

    const activityLabels = {
      course_view: "Viewed Course",
      institute_view: "Viewed Institute",
      cart_added: "Added To Cart",
      course_enrolled: "Enrolled",
      course_review: "Reviewed Course",
      institute_review: "Reviewed Institute",
    };

    const data = snapshot.docs.map((doc) => {
      const activity = doc.data();

      return {
        activityId: doc.id,

        student: {
          uid: activity.student?.uid || "",
          name: activity.student?.name || "",
          email: activity.student?.email || "",
          phoneNumber: activity.student?.phoneNumber || "",
          profileImage: activity.student?.profileImage || "",
          city: activity.student?.city || "",
        },

        activityType: activity.activityType,

        activity:
          activityLabels[activity.activityType] ||
          activity.activityType,

        entityType: activity.entityType,

        entity: {
          id: activity.entity?.id || "",
          name: activity.entity?.name || "",
        },

        institute: {
          id: activity.institute?.id || "",
          name: activity.institute?.name || "",
        },

        time: getTimeAgo(activity.createdAt),

        createdAt: activity.createdAt || null,
      };
    });

    return res.status(200).json({
      success: true,
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("GET ACTIVITIES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};