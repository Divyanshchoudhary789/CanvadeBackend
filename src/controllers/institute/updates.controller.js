const { admin, db } = require("../../services/firebase");
const { uploadFile } = require("../../services/storage");
const { getEffectivePlan, countUpdatesThisMonth } = require("../../utils/planHelper");

exports.createUpdates = async (req, res) => {
  try {
    const uid = req.user?.uid;
    const {
      title,
      description,
      tag,
      link,
      keywords,
      relatedCourse,
      status = "draft",
    } = req.body;

    if (!title || !description || !tag) {
      return res.status(400).json({
        success: false,
        message: "Title, description and tag are required.",
      });
    }

    const instituteSnapshot = await db
      .collection("institutes")
      .where("ownerUid", "==", uid)
      .get();
    if (instituteSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "Institute not found for the user.",
      });
    }
    const instituteData = instituteSnapshot.docs[0].data().instituteId;

    const effectivePlan = getEffectivePlan(instituteSnapshot.docs[0].data());
    const updatesThisMonth = await countUpdatesThisMonth(db, instituteData);
    if (updatesThisMonth >= effectivePlan.limits.updatesPerMonth) {
      return res.status(403).json({
        success: false,
        code: "PLAN_LIMIT_UPDATES",
        message: `Your ${effectivePlan.tier === "free" ? "Free" : "Pro"} plan allows up to ${effectivePlan.limits.updatesPerMonth} updates per month. ${effectivePlan.tier === "free" ? "Upgrade to Pro for up to 20/month." : "Please wait until next month."}`,
        data: {
          limit: effectivePlan.limits.updatesPerMonth,
          used: updatesThisMonth,
          plan: effectivePlan.tier,
        },
      });
    }

    let thumbnail = "";
    let images = [];

    // Upload thumbnail
    if (req.files?.thumbnail?.length > 0) {
      thumbnail = await uploadFile(req.files.thumbnail[0], "updates/thumbnails");
    }

    // Upload images (max 3)
    if (req.files?.images?.length > 0) {
      images = await Promise.all(
        req.files.images.slice(0, 3).map((file) => uploadFile(file, "updates/images")),
      );
    }

    let formattedKeywords = [];

    if (Array.isArray(keywords)) {
      formattedKeywords = keywords;
    } else if (typeof keywords === "string") {
      formattedKeywords = keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
    }
    const updateId = `UPDATE_${Date.now()}`;

    const updateData = {
      updateId,
      title: title.trim(),
      description: description.trim(),
      thumbnail,
      images,
      tag,
      link: link || "",
      keywords: formattedKeywords,
      relatedCourse: relatedCourse || "",
      status,
      views: 0,
      clicksToCourses: 0,
      createdBy: uid,
      instituteId: instituteData,
      isDeleted: false,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    console.log("Update Data to be saved:", updateData);

    await db.collection("updates").doc(updateId).set(updateData);

    return res.status(201).json({
      success: true,
      message: "Update created successfully.",
      data: updateData,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getAllUpdates = async (req, res) => {
  try {
    const uid = req.user?.uid;

    const snapshot = await db
      .collection("updates")
      .where("createdBy", "==", uid)
      .orderBy("createdAt", "desc")
      .get();

    const updates = snapshot.docs.map((doc) => ({
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      total: updates.length,
      data: updates,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getPublishedBlogs = async (req, res) => {
  try {
    const snapshot = await db
      .collection("blogs")
      .where("status", "==", "published")
      .where("isDeleted", "==", false)
      .get();

    const blogs = snapshot.docs.map((doc) => ({
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      total: blogs.length,
      data: blogs,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getDraftBlogs = async (req, res) => {
  try {
    const snapshot = await db
      .collection("blogs")
      .where("status", "==", "draft")
      .where("isDeleted", "==", false)
      .get();

    const blogs = snapshot.docs.map((doc) => ({
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      total: blogs.length,
      data: blogs,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.updateUpdate = async (req, res) => {
  try {
    const { updateId } = req.params;

    const updateRef = db.collection("updates").doc(updateId);
    const updateDoc = await updateRef.get();

    if (!updateDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Update not found",
      });
    }

    const updateData = {
      updatedAt: new Date().toISOString(),
    };

    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.tag !== undefined) updateData.tag = req.body.tag;
    if (req.body.link !== undefined) updateData.link = req.body.link;
    if (req.body.relatedCourse !== undefined) updateData.relatedCourse = req.body.relatedCourse;
    if (req.body.status !== undefined) updateData.status = req.body.status;

    if (req.body.keywords !== undefined) {
      if (Array.isArray(req.body.keywords)) {
        updateData.keywords = req.body.keywords;
      } else if (typeof req.body.keywords === "string") {
        updateData.keywords = req.body.keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean);
      }
    }

    console.log("Update Data:", updateData);

    // Prefer newly uploaded files; fall back to URLs sent by the frontend
    if (req.files?.thumbnail?.length > 0) {
      updateData.thumbnail = await uploadFile(req.files.thumbnail[0], "updates/thumbnails");
    } else if (req.body.thumbnail) {
      updateData.thumbnail = req.body.thumbnail;
    }

    if (req.files?.images?.length > 0) {
      updateData.images = await Promise.all(
        req.files.images.slice(0, 3).map((file) => uploadFile(file, "updates/images")),
      );
    } else if (req.body.images) {
      updateData.images = req.body.images;
    }

    await updateRef.update(updateData);

    return res.status(200).json({
      success: true,
      message: "Update updated successfully",
    });
  } catch (error) {
    console.error("Update Update Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.softDeleteUpdate = async (req, res) => {
  try {
    const { updateId } = req.params;

    await db.collection("updates").doc(updateId).update({
      isDeleted: true,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Update moved to trash",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getsoftDeleteUpdate = async (req, res) => {
  try {
    const snapshot = await db
      .collection("updates")
      .where("isDeleted", "==", true)
      .get();

    const updates = snapshot.docs.map((doc) => {
      const data = doc.data();

      return {
        ...data,
      };
    });

    return res.status(200).json({
      success: true,
      total: updates.length,
      data: updates,
    });
  } catch (error) {
    console.error("GET SOFT DELETED UPDATES ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.restoreBlog = async (req, res) => {
  try {
    const { blogId } = req.params;

    await db.collection("blogs").doc(blogId).update({
      isDeleted: false,
      deletedAt: null,
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Blog restored successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.deleteUpdateById = async (req, res) => {
  try {
    const { updateId } = req.params;

    await db.collection("updates").doc(updateId).delete();

    return res.status(200).json({
      success: true,
      message: "Update deleted permanently",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.getUpdateById = async (req, res) => {
  try {
    const { updateId } = req.params;

    if (!updateId) {
      return res.status(400).json({
        success: false,
        message: "Update ID is required",
      });
    }

    const updateDoc = await db.collection("updates").doc(updateId).get();

    if (!updateDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Update not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        id: updateDoc.id,
        ...updateDoc.data(),
      },
    });
  } catch (error) {
    console.error("Get Update By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch update",
      error: error.message,
    });
  }
};
exports.changeUpdateStatus = async (req, res) => {
  try {
    const { updateId } = req.params;
    const { status } = req.body;

    if (!updateId || !status) {
      return res.status(400).json({
        success: false,
        message: "Update ID and status are required",
      });
    }

    const allowedStatuses = ["draft", "publish", "archived"];

    if (!allowedStatuses.includes(status.toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Allowed values are: ${allowedStatuses.join(", ")}`,
      });
    }

    const updateRef = db.collection("updates").doc(updateId);
    const updateDoc = await updateRef.get();

    if (!updateDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Update not found",
      });
    }

    await updateRef.update({
      status: status.toLowerCase(),
      updatedAt: new Date().toISOString(),
    });

    return res.status(200).json({
      success: true,
      message: "Update status changed successfully",
      data: {
        updateId,
        status: status.toLowerCase(),
      },
    });
  } catch (error) {
    console.error("Change Update Status Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getAllupdate = async (req, res) => {
  try {
    const snapshot = await db.collection("updates").get();

    if (snapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "No updates found",
      });
    }
    const updates = snapshot.docs.map((doc) => ({
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      total: updates.length,
      data: updates,
    });
  } catch (error) {
    console.error("Get All Updates Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getUpdatesStats = async (req, res) => {
  try {
    const uid = req.user?.uid;

    const snapshot = await db
      .collection("updates")
      .where("createdBy", "==", uid)
      .get();

    let totalViews = 0;
    let totalClicks = 0;

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      totalViews += data.views || 0;
      totalClicks += data.clicksToCourses || 0;
    });

    return res.status(200).json({
      success: true,
      data: {
        totalPosts: snapshot.size,
        totalViews,
        totalClicks,
      },
    });
  } catch (error) {
    console.error("Get Updates Stats Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.incrementUpdateView = async (req, res) => {
  try {
    const { updateId } = req.params;

    const updateRef = db.collection("updates").doc(updateId);
    const updateDoc = await updateRef.get();

    if (!updateDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Update not found",
      });
    }

    await updateRef.update({
      views: admin.firestore.FieldValue.increment(1),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Increment Update View Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.incrementUpdateClick = async (req, res) => {
  try {
    const { updateId } = req.params;

    const updateRef = db.collection("updates").doc(updateId);
    const updateDoc = await updateRef.get();

    if (!updateDoc.exists) {
      return res.status(404).json({
        success: false,
        message: "Update not found",
      });
    }

    await updateRef.update({
      clicksToCourses: admin.firestore.FieldValue.increment(1),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Increment Update Click Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};

exports.getUpdatedByInstituteId = async (req, res) => {
  try {
    const { instituteId } = req.params;

    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "Institute ID is required",
      });
    }
    const updateSnapshot = await db.collection("updates")
      .where("instituteId", "==", instituteId)
      .get(); 

    if(updateSnapshot.empty) {
      return res.status(404).json({
        success: false,
        message: "No updates found for the given institute ID",
      });
    }

    const updates = updateSnapshot.docs.map((doc) => ({
      ...doc.data(),
    }));

    return res.status(200).json({
      success: true,
      total: updates.length,
      data: updates,
    });
  } catch (error) {
    console.error("Get Updates By Institute ID Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal Server Error",
    });
  }
};
