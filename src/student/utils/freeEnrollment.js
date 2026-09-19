// student/utils/freeEnrollment.js
//
// Free courses do NOT go through paymentService at all. Clicking
// "Enroll Now" on a free course just writes a small record to
// localStorage (scoped per logged-in userId) so it shows up
// instantly on the My Courses page — no API round trip, no
// PENDING/APPROVED status to wait on.
//
// If a real "free enroll" backend endpoint gets added later, only
// this file needs to change — addFreeEnrollment/getFreeEnrollments/
// isFreeEnrolled are the only functions the rest of the app calls.

const storageKey = (userId) => `freeEnrollments_${userId}`;

const readAll = (userId) => {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const writeAll = (userId, list) => {
  if (!userId) return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(list));
  } catch {
    // localStorage unavailable (private mode / quota) — enrollment still
    // works for the current session via React state in the caller.
  }
};

/** All free-course enrollment records for this user. */
export const getFreeEnrollments = (userId) => readAll(userId);

/** Quick boolean check used to gate curriculum/live/exam content. */
export const isFreeEnrolled = (userId, categoryId) => {
  if (!categoryId) return false;
  return readAll(userId).some((c) => String(c.categoryId) === String(categoryId));
};

/**
 * Records a free enrollment. Pass the category object straight from
 * categoryService (categoryId, categoryTitle, categoryType, mainCategory,
 * imageName) — only the fields below are kept.
 */
export const addFreeEnrollment = (userId, category) => {
  const existing = readAll(userId);
  if (!userId || !category?.categoryId) return existing;

  if (existing.some((c) => String(c.categoryId) === String(category.categoryId))) {
    return existing; // already enrolled, don't duplicate
  }

  const record = {
    categoryId: category.categoryId,
    categoryTitle: category.categoryTitle,
    categoryType: category.categoryType,
    mainCategory: category.mainCategory,
    imageName: category.imageName,
    enrolledAt: new Date().toISOString(),
  };

  const updated = [...existing, record];
  writeAll(userId, updated);
  return updated;
};

export const removeFreeEnrollment = (userId, categoryId) => {
  const updated = readAll(userId).filter(
    (c) => String(c.categoryId) !== String(categoryId)
  );
  writeAll(userId, updated);
  return updated;
};
