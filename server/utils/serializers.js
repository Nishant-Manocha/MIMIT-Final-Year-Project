export function normalizeId(doc) {
  if (!doc) return null;
  const obj = typeof doc.toObject === "function" ? doc.toObject() : doc;
  const { _id, __v, ...rest } = obj;
  return { id: String(_id), ...rest };
}

export function normalizeMany(docs) {
  return docs.map(normalizeId);
}

export function toClientUser(user) {
  return {
    id: String(user._id),
    email: user.email,
    display_name: user.display_name,
    roles: user.roles || ["student"],
  };
}

export function normalizeEnrollment(doc) {
  const enrollment = normalizeId(doc);
  if (enrollment?.course_id && typeof enrollment.course_id === "object") {
    enrollment.courses = normalizeId(enrollment.course_id);
    enrollment.course_id = enrollment.courses.id;
  }
  return enrollment;
}
