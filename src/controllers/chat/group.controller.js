const admin = require("firebase-admin");
const db = admin.firestore();

/**
 * Create Group
 * POST /chat/group/create
 */
exports.createGroup = async (req, res) => {
  try {
    const ownerUid = req.user.uid;

    const {
      groupName,
      description,
      courseId = null,
      privacy = "private",
      photo = "",
    } = req.body;

    if (!groupName || !groupName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Group name is required.",
      });
    }

    const instituteSnapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", ownerUid)
      .limit(1)
      .get();

    if (instituteSnapshot.empty) {
      return res.status(403).json({
        success: false,
        message: "Only institutes can create groups.",
      });
    }

    const groupRef = db.collection("groups").doc();

    const groupData = {
      groupId: groupRef.id,

      groupName,

      description,

      ownerUid,

      courseId,

      privacy,

      photo,

      memberCount: 1,

      type: courseId ? "course" : "general",

      createdAt: admin.firestore.FieldValue.serverTimestamp(),

      updatedAt: admin.firestore.FieldValue.serverTimestamp(),

      isActive: true,
    };

    await groupRef.set(groupData);

    await groupRef.collection("members").doc(ownerUid).set({
      uid: ownerUid,

      role: "owner",

      joinedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.status(201).json({
      success: true,

      message: "Group created successfully.",

      data: groupData,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,

      message: "Internal server error.",

      error: error.message,
    });
  }
};

/**
 * Get My Groups
 * GET /chat/group/list
 */
exports.getMyGroups = async (req, res) => {
  try {
    const uid = req.user.uid;

    const instituteSnapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", uid)
      .limit(1)
      .get();

    let groups = [];

    // Institute
    if (!instituteSnapshot.empty) {
      const snapshot = await db
        .collection("groups")
        .where("ownerUid", "==", uid)
        .where("isActive", "==", true)
        .orderBy("updatedAt", "desc")
        .get();

      groups = snapshot.docs.map((doc) => doc.data());
    } else {
      // Student
      const snapshot = await db.collection("groups").get();

      for (const doc of snapshot.docs) {
        const member = await doc.ref.collection("members").doc(uid).get();

        if (member.exists) {
          groups.push(doc.data());
        }
      }
    }

    return res.status(200).json({
      success: true,

      total: groups.length,

      data: groups,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,

      message: "Internal server error.",

      error: error.message,
    });
  }
};

/**
 * Creates a group for a newly created course. Not an HTTP handler — called
 * internally by course.controller.js#createCourse right after the course
 * doc is written. The owning institute is auto-added as the group's owner,
 * same shape as createGroup's own member write. Group is created private
 * (course groups are membership-managed via enrollment, not join requests
 * or the "Global" discover tab).
 */
exports.createGroupForCourse = async ({ courseId, courseTitle, ownerUid, photo = "" }) => {
  const groupRef = db.collection("groups").doc();

  const groupData = {
    groupId: groupRef.id,
    groupName: `${courseTitle} group`,
    description: `Discussion group for ${courseTitle}`,
    ownerUid,
    courseId,
    privacy: "private",
    photo,
    memberCount: 1,
    type: "course",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    isActive: true,
  };

  await groupRef.set(groupData);

  await groupRef.collection("members").doc(ownerUid).set({
    uid: ownerUid,
    role: "owner",
    joinedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return groupData;
};

/**
 * Adds a student as a member of the group linked to a course. Not an HTTP
 * handler — called internally right after enrollment succeeds, from both
 * purchase flows (checkout.controller.js's mock flow via
 * enrolment.controller.js#createEnrollmentRecord, and order.controller.js's
 * Razorpay verifyPayment). Idempotent (no-ops if already a member) and
 * silent on failure — group membership is a side effect of a purchase, not
 * something that should ever fail the purchase itself. Also no-ops if the
 * course has no linked group (e.g. courses created before this feature
 * existed, which never got an auto-created group).
 */
exports.addStudentToCourseGroup = async (courseId, studentUid) => {
  if (!courseId || !studentUid) return;

  try {
    const groupSnapshot = await db
      .collection("groups")
      .where("courseId", "==", courseId)
      .limit(1)
      .get();

    if (groupSnapshot.empty) return;

    const groupRef = groupSnapshot.docs[0].ref;

    await db.runTransaction(async (transaction) => {
      const memberRef = groupRef.collection("members").doc(studentUid);
      const memberDoc = await transaction.get(memberRef);

      if (memberDoc.exists) return;

      transaction.set(memberRef, {
        uid: studentUid,
        role: "member",
        joinedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(groupRef, {
        memberCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    console.error("addStudentToCourseGroup error:", error);
  }
};

/**
 * Get Global (Discoverable) Groups
 * GET /chat/group/global
 *
 * Public, active groups the current user is not already a member of —
 * powers the "Global" tab so students can find groups to request to join.
 */
exports.getGlobalGroups = async (req, res) => {
  try {
    const uid = req.user.uid;

    const snapshot = await db
      .collection("groups")
      .where("privacy", "==", "public")
      .where("isActive", "==", true)
      .orderBy("updatedAt", "desc")
      .get();

    const groups = [];

    for (const doc of snapshot.docs) {
      const member = await doc.ref.collection("members").doc(uid).get();

      if (!member.exists) {
        groups.push(doc.data());
      }
    }

    return res.status(200).json({
      success: true,

      total: groups.length,

      data: groups,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,

      message: "Internal server error.",

      error: error.message,
    });
  }
};

/**
 * Get Group By Id
 * GET /chat/group/:groupId
 */
exports.getGroupById = async (req,res)=>{

    try{

        const uid=req.user.uid;

        const {groupId}=req.params;

        const groupRef=db.collection("groups").doc(groupId);

        const groupDoc=await groupRef.get();

        if(!groupDoc.exists){

            return res.status(404).json({

                success:false,

                message:"Group not found."

            });

        }

        const memberDoc=await groupRef
            .collection("members")
            .doc(uid)
            .get();

        if(!memberDoc.exists){

            return res.status(403).json({

                success:false,

                message:"You are not a member of this group."

            });

        }

        const group=groupDoc.data();

        return res.status(200).json({

            success:true,

            data:group

        });

    }catch(error){

        console.error(error);

        return res.status(500).json({

            success:false,

            message:"Internal server error.",

            error:error.message

        });

    }

};




