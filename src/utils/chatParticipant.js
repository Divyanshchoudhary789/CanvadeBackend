/**
 * Builds the {uid, name, role, profileImage} entry stored on a
 * conversation's `memberDetails` map for one participant. For an institute
 * account, prefers the institute's business name (from the `institutes`
 * collection) over the owner's personal `users.displayName`, since that's
 * what should show up in chat ("ABC Institute" rather than the owner's name).
 */
const buildMemberDetail = async (db, uid) => {
  const userDoc = await db.collection("users").doc(uid).get();
  const user = userDoc.exists ? userDoc.data() : {};
  const role = user.role || "student";
  let name = user.displayName || user.name || "";

  if (role === "institute") {
    const instituteSnap = await db
      .collection("institutes")
      .where("ownerUid", "==", uid)
      .limit(1)
      .get();
    if (!instituteSnap.empty) {
      name = instituteSnap.docs[0].data().name || name;
    }
  }

  return {
    uid,
    name: name || "Unknown",
    role,
    profileImage: user.profileImage || null,
  };
};

module.exports = { buildMemberDetail };
